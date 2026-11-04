import { getChartIndex } from './chartIndex';
import type { ChartWeek, Item, StudioSettings } from './types';

export interface AudioClip { file: File; name: string; duration: number }
export type ClipBank = Record<string, AudioClip>;
export type AudioStatus = { phase: 'idle'|'loading'|'playing'|'paused'|'missing'|'error'; id: string | null; message?: string };

export function createLeaderResolver(charts: ChartWeek[], items: Item[], settings: Pick<StudioSettings,'mode'|'barMetric'>) {
  const selected=new Set(items.map(item=>item.id));
  const index=settings.mode==='bars'?getChartIndex(charts,items,settings.barMetric==='cumulative'):null;
  return (position:number):string|null=>{
    if(!charts.length)return null;
    const p=Math.max(0,Math.min(Number.isFinite(position)?position:0,charts.length-1)),current=Math.floor(p);
    if(charts[current].status!=='loaded')return null;
    if(settings.mode==='lines'){
      const winner=charts[current].entries.find(entry=>entry.rank===1);
      return winner&&selected.has(winner.id)?winner.id:null;
    }
    const maps=settings.barMetric==='cumulative'?index!.cumPlayMaps:index!.playMaps;
    const a=maps[current],b=charts[current+1]?.status==='loaded'?maps[current+1]:a;
    const t=p-current,ease=t*t*(3-2*t);
    let winner:Item|null=null,max=0;
    for(const item of items){
      const start=a?.get(item.id)??0,end=charts[current+1]?.status==='loaded'?(b?.get(item.id)??0):start,value=start+(end-start)*ease;
      if(value>max || (value>0&&value===max&&winner&&(item.name.localeCompare(winner.name)||item.id.localeCompare(winner.id))<0)){winner=item;max=value;}
    }
    return winner?.id??null;
  };
}

export async function inspectAudioClip(file:File):Promise<AudioClip>{
  if(!file.size||file.size>8*1024*1024)throw new Error('Escolha um trecho de até 8 MB.');
  if(file.type&&!file.type.startsWith('audio/')&&!/\.(mp3|m4a|wav|ogg|aac|flac|webm)$/i.test(file.name))throw new Error('Escolha um arquivo de áudio.');
  const url=URL.createObjectURL(file),audio=new Audio();
  try{
    const duration=await new Promise<number>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Não foi possível ler o trecho. Tente MP3, M4A ou WAV.')),8000);
      audio.onloadedmetadata=()=>{clearTimeout(timer);resolve(audio.duration);};
      audio.onerror=()=>{clearTimeout(timer);reject(new Error('Este formato de áudio não é compatível com o navegador.'));};
      audio.preload='metadata';audio.src=url;
    });
    if(!Number.isFinite(duration)||duration<=0||duration>60)throw new Error('Use um trecho de até 60 segundos. O app repete os primeiros 30 segundos enquanto o item lidera.');
    return {file,name:file.name,duration};
  }finally{audio.onloadedmetadata=null;audio.onerror=null;audio.removeAttribute('src');audio.load();URL.revokeObjectURL(url);}
}

/** One context, one voice, three small decoded buffers. No network audio. */
export class LeaderAudioSession {
  readonly context:AudioContext;
  readonly destination:MediaStreamAudioDestinationNode|null;
  private master:GainNode;
  private current:{id:string;file:File}|null=null;
  private voice:{source:AudioBufferSourceNode;gain:GainNode}|null=null;
  private buffers=new Map<File,AudioBuffer>();
  private pending=new Map<File,Promise<AudioBuffer>>();
  private queue:Promise<unknown>=Promise.resolve();
  private generation=0;
  private closed=false;
  private lastRequest:{id:string|null;file?:File}|undefined;
  constructor(private clips:()=>ClipBank, private onStatus:(state:AudioStatus)=>void=()=>{}, options:{record?:boolean;audible?:boolean;volume?:number;context?:AudioContext}={}){
    this.context=options.context??new AudioContext();
    this.master=this.context.createGain();this.setVolume(options.volume??.7);
    this.destination=options.record?this.context.createMediaStreamDestination():null;
    if(this.destination)this.master.connect(this.destination);
    if(options.audible!==false)this.master.connect(this.context.destination);
  }
  setVolume(value:number){if(!this.closed)this.master.gain.setTargetAtTime(Math.max(0,Math.min(1,value)),this.context.currentTime,.03);}
  async resume(){if(this.closed)return;await this.context.resume();if(this.current)this.onStatus({phase:'playing',id:this.current.id});}
  pause(){if(this.closed)return;void this.context.suspend().catch(()=>{});this.onStatus({phase:'paused',id:this.current?.id??null});}
  private stopVoice(){
    if(!this.voice)return;
    const {source,gain}=this.voice;this.voice=null;
    gain.gain.cancelScheduledValues(this.context.currentTime);gain.gain.setValueAtTime(gain.gain.value,this.context.currentTime);gain.gain.linearRampToValueAtTime(0,this.context.currentTime+.06);
    source.onended=()=>{source.disconnect();gain.disconnect();};
    try{source.stop(this.context.currentTime+.07);}catch{source.disconnect();gain.disconnect();}
  }
  stop(){this.generation++;this.current=null;this.lastRequest=undefined;this.stopVoice();if(!this.closed)this.onStatus({phase:'idle',id:null});}
  private buffer(file:File):Promise<AudioBuffer>{
    const hit=this.buffers.get(file);
    if(hit){this.buffers.delete(file);this.buffers.set(file,hit);return Promise.resolve(hit);}
    const waiting=this.pending.get(file);if(waiting)return waiting;
    const task=this.queue.catch(()=>{}).then(async()=>{
      if(this.closed)throw new Error('Áudio encerrado.');
      const decoded=await this.context.decodeAudioData(await file.arrayBuffer());
      if(this.closed)throw new Error('Áudio encerrado.');
      const seconds=Math.min(30,decoded.duration),rate=22050,length=Math.max(1,Math.floor(seconds*rate));
      const compact=this.context.createBuffer(1,length,rate),target=compact.getChannelData(0);
      const channels=Array.from({length:Math.min(2,decoded.numberOfChannels)},(_,i)=>decoded.getChannelData(i));
      for(let i=0;i<length;i++){const sample=Math.min(decoded.length-1,Math.floor(i*decoded.sampleRate/rate));target[i]=channels.reduce((sum,c)=>sum+c[sample],0)/channels.length;}
      this.buffers.set(file,compact);while(this.buffers.size>3)this.buffers.delete(this.buffers.keys().next().value!);
      return compact;
    });
    this.queue=task;this.pending.set(file,task);void task.finally(()=>this.pending.delete(file)).catch(()=>{});return task;
  }
  async setLeader(id:string|null){
    if(this.closed)return;
    const clip=id?this.clips()[id]:undefined;
    if(this.lastRequest?.id===id&&this.lastRequest?.file===clip?.file)return;
    this.lastRequest={id,file:clip?.file};
    const version=++this.generation;this.current=id&&clip?{id,file:clip.file}:null;this.stopVoice();
    if(!id){this.onStatus({phase:'idle',id:null});return;}
    if(!clip){this.onStatus({phase:'missing',id});return;}
    this.onStatus({phase:'loading',id});
    try{
      const buffer=await this.buffer(clip.file);
      if(this.closed||version!==this.generation)return;
      const source=this.context.createBufferSource(),gain=this.context.createGain();
      source.buffer=buffer;source.loop=true;gain.gain.setValueAtTime(0,this.context.currentTime);gain.gain.linearRampToValueAtTime(1,this.context.currentTime+.04);
      source.connect(gain);gain.connect(this.master);this.voice={source,gain};source.start();
      this.onStatus({phase:this.context.state==='running'?'playing':'paused',id});
    }catch{if(!this.closed&&version===this.generation){this.current=null;this.onStatus({phase:'error',id,message:'Não foi possível tocar este trecho. O vídeo continua em silêncio.'});}}
  }
  dispose(){if(this.closed)return;this.stop();this.closed=true;this.buffers.clear();this.pending.clear();this.master.disconnect();void this.context.close().catch(()=>{});}
}
