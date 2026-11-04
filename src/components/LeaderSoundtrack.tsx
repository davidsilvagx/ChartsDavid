import { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Music2, Trash2, Upload, Volume2 } from 'lucide-react';
import { getMeta, putMeta } from '../lib/storage';
import { inspectAudioClip, type AudioStatus, type ClipBank } from '../lib/leaderAudio';
import type { Item } from '../lib/types';
import { Cover, Modal, MusicLoader } from './UI';

export function useLeaderClips(namespace:string){
  const [clips,setClips]=useState<ClipBank>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const key=`leader-clips:v1:${namespace.toLowerCase()}`;
  const currentKey=useRef(key);currentKey.current=key;
  useEffect(()=>{let active=true;setLoading(true);setClips({});void getMeta<ClipBank>(key).then(value=>{if(active)setClips(value??{});}).catch(()=>{if(active)setError('Não foi possível ler os trechos salvos neste aparelho.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[key]);
  const save=async(next:ClipBank)=>{await putMeta(key,next);if(currentKey.current===key){setClips(next);setError('');}};
  return {clips,loading,error,save};
}

export function LeaderSoundtrack({items,clips,loading,error,enabled,volume,status,onEnabled,onVolume,onSave,disabled}: {
  items:Item[];clips:ClipBank;loading:boolean;error:string;enabled:boolean;volume:number;status:AudioStatus;
  onEnabled:(value:boolean)=>void;onVolume:(value:number)=>void;onSave:(value:ClipBank)=>Promise<void>;disabled:boolean;
}){
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[uploading,setUploading]=useState<string|null>(null),[failure,setFailure]=useState('');
  const visible=useMemo(()=>items.filter(item=>`${item.name} ${item.artist}`.toLowerCase().includes(query.toLowerCase())).slice(0,50),[items,query]);
  const current=items.find(item=>item.id===status.id);
  const upload=async(id:string,file:File|undefined)=>{
    if(!file)return;setUploading(id);setFailure('');
    try{if(!clips[id]&&Object.keys(clips).length>=24)throw new Error('Você pode guardar 24 trechos por perfil. Remova um antes de adicionar outro.');const clip=await inspectAudioClip(file);await onSave({...clips,[id]:clip});}
    catch(e){setFailure(e instanceof Error?e.message:'Não foi possível salvar. Confira o espaço do aparelho.');}
    finally{setUploading(null);}
  };
  return <>
    <div className="leader-soundtrack">
      <div className="leader-soundtrack-heading"><Headphones size={19}/><div><strong>Trilha do #1</strong><small>O trecho acompanha quem lidera, nas linhas e nas barras.</small></div><label className="switch-row"><input type="checkbox" aria-label="Ativar trilha do primeiro lugar" checked={enabled} disabled={disabled||loading} onChange={e=>onEnabled(e.target.checked)}/><span>{enabled?'Ativada':'Desativada'}</span></label></div>
      {enabled&&<>
        <div className="leader-audio-status" role="status" aria-live="polite">{(loading||status.phase==='loading')&&<MusicLoader size="sm"/>}<span>{loading?'Lendo trechos do aparelho…':status.phase==='playing'?`Tocando #1 · ${current?.name??'Trecho local'}`:status.phase==='loading'?`Preparando ${current?.name??'o trecho'}…`:status.phase==='missing'?`Sem trecho para ${current?.name??'este líder'}. O vídeo segue em silêncio.`:status.phase==='error'?status.message:status.phase==='paused'?'Áudio pausado junto com o vídeo.':'Adicione os trechos e toque em Play. Sem #1 no chart, o som fica em silêncio.'}</span></div>
        <div className="leader-audio-actions"><button type="button" className="button small" disabled={disabled} onClick={()=>setOpen(true)}><Music2 size={16}/><span>Trechos por música · {Object.keys(clips).length}</span></button><label className="audio-volume"><Volume2 size={15}/><span>Volume</span><input aria-label="Volume da trilha do primeiro lugar" type="range" min="0" max="1" step="0.05" value={volume} disabled={disabled} onChange={e=>onVolume(Number(e.target.value))}/></label></div>
        <small>Seus arquivos entram na prévia e no vídeo baixado. Eles ficam neste aparelho. A trilha local contínua fica desativada enquanto o som do #1 estiver ativo.</small>
      </>}
      {error&&<p className="alert error" role="alert">{error}</p>}
    </div>
    {open&&<Modal title="A voz de cada #1" subtitle="Associe um trecho a cada item. Ele repete enquanto lidera e muda quando outro assume." onClose={()=>setOpen(false)} wide>
      <div className="audio-clips-intro"><Headphones size={24}/><p>Escolha arquivos de áudio de até 60 segundos e 8 MB. Tocamos até 30 segundos em loop. Itens sem trecho ficam em silêncio; as contagens do chart não mudam.</p></div>
      <label className="field-label">Buscar no elenco<input type="search" aria-label="Buscar item para adicionar trecho" placeholder="Música, álbum ou artista" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      {failure&&<p className="alert error" role="alert">{failure}</p>}
      {!visible.length&&<p className="note">Nenhum item encontrado na seleção do vídeo. Adicione competidores no estúdio.</p>}
      <div className="audio-clip-list">{visible.map(item=><div className="audio-clip-row" key={item.id}><Cover item={item}/><div className="truncate"><strong>{item.name}</strong><small>{item.artist}</small><small>{clips[item.id]?`${clips[item.id].name} · ${Math.round(clips[item.id].duration)}s`:'Sem trecho'}</small></div><label className={`button small ${uploading?'disabled':''}`}>{uploading===item.id?<MusicLoader size="sm"/>:<Upload size={15}/>}<span>{clips[item.id]?'Trocar':'Adicionar'}</span><input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm" aria-label={`Trecho de ${item.name}`} disabled={!!uploading} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void upload(item.id,file);}}/></label>{clips[item.id]&&<button type="button" className="icon-button" aria-label={`Remover trecho de ${item.name}`} disabled={!!uploading} onClick={()=>{const next={...clips};delete next[item.id];void onSave(next).catch(()=>setFailure('Não foi possível remover o trecho do aparelho.'));}}><Trash2 size={15}/></button>}</div>)}</div>
      <p className="note">Até 24 trechos por perfil. A lista mostra 50 resultados por busca. Formatos compatíveis dependem do navegador; MP3 e WAV costumam funcionar em Android e iPhone.</p>
    </Modal>}
  </>;
}
