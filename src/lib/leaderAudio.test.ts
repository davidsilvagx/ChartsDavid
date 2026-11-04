import { describe, expect, it, vi } from 'vitest';
import { createLeaderResolver, LeaderAudioSession, type AudioStatus, type ClipBank } from './leaderAudio';
import { defaults, type ChartWeek, type Item } from './types';
import { buildCharts, getLibrary } from './charts';
import { makeWeeks } from './calendar';

const weeks=makeWeeks(defaults,Date.parse('2016-07-09T12:00Z'));
const cache=weeks.map((week,i)=>({key:week.id,week,cutoff:week.end,fetchedAt:1,duplicates:0,scrobbles:Array.from({length:i?12:10},(_,n)=>({timestamp:week.start+10+n,track:i?'Beta':'Alpha',artist:'Artist',album:'Album',image:''}))}));
const charts=buildCharts(weeks,cache,'tracks'),items=getLibrary(cache,'tracks');

describe('Líder real da trilha',()=>{
  it('linhas tocam apenas o #1 oficial escolhido, sem promover o melhor dos selecionados',()=>{
    const resolve=createLeaderResolver(charts,items,{mode:'lines',barMetric:'weekly'});
    expect(resolve(0)).toBe(charts[0].entries[0].id);expect(resolve(1)).toBe(charts[1].entries[0].id);
    const subset=createLeaderResolver(charts,[items.find(i=>i.name==='Beta')!],{mode:'lines',barMetric:'weekly'});
    expect(subset(0)).toBeNull();expect(subset(1)).not.toBeNull();
  });
  it('barras trocam ao ultrapassar por plays, com métrica semanal ou acumulada',()=>{
    const weekly=createLeaderResolver(charts,items,{mode:'bars',barMetric:'weekly'});
    const cumulative=createLeaderResolver(charts,items,{mode:'bars',barMetric:'cumulative'});
    const alpha=items.find(i=>i.name==='Alpha')!.id,beta=items.find(i=>i.name==='Beta')!.id;
    expect(weekly(0)).toBe(alpha);expect(weekly(.5)).toBe(beta);
    expect(cumulative(.5)).toBe(alpha);expect(cumulative(.95)).toBe(beta);
  });
  it('lacunas, zeros e seleção vazia ficam em silêncio',()=>{
    const missing:ChartWeek[]=[{...charts[0],status:'missing',entries:[],playCounts:[]}];
    expect(createLeaderResolver(missing,items,{mode:'bars',barMetric:'cumulative'})(0)).toBeNull();
    expect(createLeaderResolver([{...charts[0],entries:[],playCounts:[]}],items,{mode:'bars',barMetric:'weekly'})(0)).toBeNull();
    expect(createLeaderResolver(charts,[],{mode:'lines',barMetric:'weekly'})(0)).toBeNull();
  });
});

function mockAudio(){
  const sources:Array<{start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>;connect:ReturnType<typeof vi.fn>;buffer:AudioBuffer|null;loop:boolean;onended:(()=>void)|null}>=[];
  const gain=()=>({gain:{value:1,setTargetAtTime:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),cancelScheduledValues:vi.fn()},connect:vi.fn(),disconnect:vi.fn()});
  const buffer=(length=22050,rate=22050)=>({duration:length/rate,length,sampleRate:rate,numberOfChannels:1,getChannelData:()=>new Float32Array(length).fill(.2)}) as unknown as AudioBuffer;
  const context={currentTime:0,state:'running',destination:{},createGain:vi.fn(gain),createMediaStreamDestination:vi.fn(()=>({stream:{getAudioTracks:()=>[{kind:'audio'}]}})),createBuffer:vi.fn((_:number,n:number,r:number)=>buffer(n,r)),decodeAudioData:vi.fn(async()=>buffer()),createBufferSource:vi.fn(()=>{const source={start:vi.fn(),stop:vi.fn(),disconnect:vi.fn(),connect:vi.fn(),buffer:null as AudioBuffer|null,loop:false,onended:null as (()=>void)|null};sources.push(source);return source;}),resume:vi.fn(async()=>{context.state='running';}),suspend:vi.fn(async()=>{context.state='suspended';}),close:vi.fn(async()=>{context.state='closed';})};
  return {context,sources,buffer};
}
const file=(name:string)=>new File([new Uint8Array([1,2,3])],`${name}.wav`,{type:'audio/wav'});
const bank:ClipBank=Object.fromEntries(['a','b','c','d'].map(id=>[id,{file:file(id),name:`${id}.wav`,duration:1}]));
describe('Sessão de áudio local',()=>{
  it('mantém o mesmo trecho sem reiniciar e troca a fonte quando muda o #1',async()=>{
    const mock=mockAudio(),status:AudioStatus[]=[];
    const session=new LeaderAudioSession(()=>bank,s=>status.push(s),{context:mock.context as unknown as AudioContext,record:true});
    await session.setLeader('a');await session.setLeader('a');
    expect(mock.sources).toHaveLength(1);expect(mock.sources[0].loop).toBe(true);
    await session.setLeader('b');expect(mock.sources).toHaveLength(2);expect(mock.sources[0].stop).toHaveBeenCalledOnce();
    expect(session.destination?.stream.getAudioTracks()).toHaveLength(1);
    session.pause();expect(mock.context.suspend).toHaveBeenCalledOnce();await session.resume();expect(mock.context.resume).toHaveBeenCalledOnce();
    session.dispose();expect(mock.context.close).toHaveBeenCalledOnce();expect(status.at(-1)?.phase).toBe('idle');
  });
  it('ignora decodificação antiga quando outro líder já assumiu',async()=>{
    const mock=mockAudio();let release!:(value:AudioBuffer)=>void;
    mock.context.decodeAudioData.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const session=new LeaderAudioSession(()=>bank,()=>{},{context:mock.context as unknown as AudioContext});
    const first=session.setLeader('a');await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    const second=session.setLeader('b');release(mock.buffer());await Promise.all([first,second]);
    expect(mock.sources).toHaveLength(1);expect(mock.sources[0].start).toHaveBeenCalledOnce();session.dispose();
  });
  it('não repete eventos nem consome decoder para um trecho ausente',async()=>{
    const mock=mockAudio(),status=vi.fn();const session=new LeaderAudioSession(()=>bank,status,{context:mock.context as unknown as AudioContext});
    await session.setLeader('a');await session.setLeader('missing');await session.setLeader('missing');
    expect(status.mock.calls.filter(([s])=>s.phase==='missing')).toHaveLength(1);
    expect(mock.context.decodeAudioData).toHaveBeenCalledTimes(1);expect(mock.sources[0].stop).toHaveBeenCalledOnce();session.dispose();
  });
  it('libera buffers antigos e cancela início pendente ao encerrar',async()=>{
    const mock=mockAudio();const session=new LeaderAudioSession(()=>bank,()=>{},{context:mock.context as unknown as AudioContext});
    for(const id of ['a','b','c','d','a'])await session.setLeader(id);
    expect(mock.context.decodeAudioData).toHaveBeenCalledTimes(5);
    session.dispose();await session.setLeader('b');expect(mock.sources).toHaveLength(5);
    session.dispose();expect(mock.context.close).toHaveBeenCalledOnce();
  });
  it('falha de codec não impede a animação nem gera rejeição não tratada',async()=>{
    const mock=mockAudio(),status=vi.fn();mock.context.decodeAudioData.mockRejectedValueOnce(new Error('codec'));
    const session=new LeaderAudioSession(()=>bank,status,{context:mock.context as unknown as AudioContext});await session.setLeader('a');
    expect(status.mock.calls.at(-1)?.[0].phase).toBe('error');session.dispose();
  });
});
