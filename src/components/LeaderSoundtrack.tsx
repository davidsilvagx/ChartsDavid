import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Headphones, Info, Music2, Trash2, Upload, Volume2, Wand2 } from 'lucide-react';
import { getMeta, putMeta } from '../lib/storage';
import { audioModeLabels, inspectAudioClip, type AudioStatus, type ClipBank, type LeaderAudioMode } from '../lib/leaderAudio';
import { matchAudioFiles, readAudioTags, type FileMatch } from '../lib/audioMatch';
import type { Item } from '../lib/types';
import { Cover, Modal, MusicLoader } from './UI';

const AUTO_LIMIT = 40;
export function useLeaderClips(namespace:string,variant:'manual'|'auto'='manual'){
  const [clips,setClips]=useState<ClipBank>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const key=`${variant==='auto'?'leader-auto':'leader-clips'}:v1:${namespace.toLowerCase()}`;
  const currentKey=useRef(key);currentKey.current=key;
  useEffect(()=>{let active=true;setLoading(true);setClips({});void getMeta<ClipBank>(key).then(value=>{if(active)setClips(value??{});}).catch(()=>{if(active)setError('Não foi possível ler os trechos salvos neste aparelho.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[key]);
  const save=async(next:ClipBank)=>{await putMeta(key,next);if(currentKey.current===key){setClips(next);setError('');}};
  return {clips,loading,error,save};
}

export function LeaderSoundtrack({items,clips,autoClips,mode,onMode,onSaveAuto,loading,error,enabled,volume,status,onEnabled,onVolume,onSave,disabled}: {
  items:Item[];clips:ClipBank;autoClips:ClipBank;mode:LeaderAudioMode;onMode:(m:LeaderAudioMode)=>void;onSaveAuto:(value:ClipBank)=>Promise<void>;loading:boolean;error:string;enabled:boolean;volume:number;status:AudioStatus;
  onEnabled:(value:boolean)=>void;onVolume:(value:number)=>void;onSave:(value:ClipBank)=>Promise<void>;disabled:boolean;
}){
  const [open,setOpen]=useState(false),[auto,setAuto]=useState(false),[query,setQuery]=useState(''),[uploading,setUploading]=useState<string|null>(null),[failure,setFailure]=useState('');
  const visible=useMemo(()=>items.filter(item=>`${item.name} ${item.artist}`.toLowerCase().includes(query.toLowerCase())).slice(0,50),[items,query]);
  const current=items.find(item=>item.id===status.id);
  const source=status.id?(mode!=='auto'&&clips[status.id]?clips[status.id]:mode!=='manual'?autoClips[status.id]:undefined):undefined;
  const autoCount=items.filter(item=>autoClips[item.id]).length,manualCount=Object.keys(clips).length;
  const upload=async(id:string,file:File|undefined)=>{
    if(!file)return;setUploading(id);setFailure('');
    try{if(!clips[id]&&Object.keys(clips).length>=24)throw new Error('Você pode guardar 24 trechos por perfil. Remova um antes de adicionar outro.');const clip=await inspectAudioClip(file);await onSave({...clips,[id]:{...clip,origin:'manual'}});}
    catch(e){setFailure(e instanceof Error?e.message:'Não foi possível salvar. Confira o espaço do aparelho.');}
    finally{setUploading(null);}
  };
  const message=loading?'Lendo trechos do aparelho…':status.phase==='playing'?`Tocando #1 · ${current?.name??'trecho local'}${source?` · ${source.origin==='auto'?'automático':'manual'}`:''}`:status.phase==='loading'?`Preparando ${current?.name??'o trecho'}…`:status.phase==='missing'?`Sem ${mode==='manual'?'trecho manual':'arquivo local correspondente'} para ${current?.name??'este líder'}. O vídeo segue em silêncio.`:status.phase==='error'?status.message:status.phase==='paused'?'Áudio pausado junto com o vídeo.':'Associe os arquivos e toque em Play. Sem #1 no chart, o som fica em silêncio.';
  return <>
    <div className="leader-soundtrack">
      <div className="leader-soundtrack-heading"><Headphones size={19}/><div><strong>Trilha do #1</strong><small>O trecho acompanha quem lidera, nas linhas e nas barras, e troca quando outro assume.</small></div><label className="switch-row"><input type="checkbox" aria-label="Ativar trilha do primeiro lugar" checked={enabled} disabled={disabled||loading} onChange={e=>onEnabled(e.target.checked)}/><span>{enabled?'Ativada':'Desativada'}</span></label></div>
      {enabled&&<>
        <div className="segmented compact-seg audio-mode" role="group" aria-label="Modo da trilha">{(Object.keys(audioModeLabels) as LeaderAudioMode[]).map(m=><button key={m} type="button" className={mode===m?'selected':''} aria-pressed={mode===m} disabled={disabled} onClick={()=>onMode(m)}>{audioModeLabels[m]}</button>)}</div>
        <small className="audio-mode-help">{mode==='manual'?'Toca só os trechos que você escolheu item por item.':mode==='auto'?'Associa sozinho os arquivos da sua biblioteca local pelo artista e título das etiquetas.':'Automático pela biblioteca local; quando houver trecho manual, ele tem prioridade.'}</small>
        <div className="leader-audio-status" role="status" aria-live="polite">{(loading||status.phase==='loading')&&<MusicLoader size="sm"/>}<span>{message}</span></div>
        <div className="leader-audio-actions">
          {mode!=='auto'&&<button type="button" className="button small" disabled={disabled} onClick={()=>setOpen(true)}><Music2 size={16}/><span>Trechos manuais · {manualCount}</span></button>}
          {mode!=='manual'&&<button type="button" className="button small" disabled={disabled} onClick={()=>setAuto(true)}><Wand2 size={16}/><span>Associar biblioteca · {autoCount}/{items.length}</span></button>}
          <label className="audio-volume"><Volume2 size={15}/><span>Volume</span><input aria-label="Volume da trilha do primeiro lugar" type="range" min="0" max="1" step="0.05" value={volume} disabled={disabled} onChange={e=>onVolume(Number(e.target.value))}/></label>
        </div>
        <small>Seus arquivos ficam neste aparelho e entram na prévia e no vídeo baixado. <Info size={12}/> As prévias de 30 s do catálogo (iTunes) só tocam no player: as regras da Apple proíbem sincronizá-las com vídeo.</small>
      </>}
      {error&&<p className="alert error" role="alert">{error}</p>}
    </div>
    {open&&<Modal title="A voz de cada #1" subtitle="Associe um trecho a cada item. Ele repete enquanto lidera e muda quando outro assume." onClose={()=>setOpen(false)} wide>
      <div className="audio-clips-intro"><Headphones size={24}/><p>Escolha arquivos de áudio de até 60 segundos e 8 MB. Tocamos até 30 segundos em loop. Itens sem trecho ficam em silêncio; as contagens do chart não mudam.</p></div>
      <label className="field-label">Buscar no elenco<input type="search" aria-label="Buscar item para adicionar trecho" placeholder="Música, álbum ou artista" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      {failure&&<p className="alert error" role="alert">{failure}</p>}
      {!visible.length&&<p className="note">Nenhum item encontrado na seleção do vídeo. Adicione competidores no estúdio.</p>}
      <div className="audio-clip-list">{visible.map(item=><div className="audio-clip-row" key={item.id}><Cover item={item}/><div className="truncate"><strong>{item.name}</strong><small>{item.artist}</small><small>{clips[item.id]?`${clips[item.id].name} · ${Math.round(clips[item.id].duration)}s`:autoClips[item.id]?`Automático: ${autoClips[item.id].name}`:'Sem trecho'}</small></div><label className={`button small ${uploading?'disabled':''}`}>{uploading===item.id?<MusicLoader size="sm"/>:<Upload size={15}/>}<span>{clips[item.id]?'Trocar':'Adicionar'}</span><input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm" aria-label={`Trecho de ${item.name}`} disabled={!!uploading} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void upload(item.id,file);}}/></label>{clips[item.id]&&<button type="button" className="icon-button" aria-label={`Remover trecho de ${item.name}`} disabled={!!uploading} onClick={()=>{const next={...clips};delete next[item.id];void onSave(next).catch(()=>setFailure('Não foi possível remover o trecho do aparelho.'));}}><Trash2 size={15}/></button>}</div>)}</div>
      <p className="note">Até 24 trechos por perfil. A lista mostra 50 resultados por busca. Formatos compatíveis dependem do navegador; MP3 e WAV costumam funcionar em Android e iPhone.</p>
    </Modal>}
    {auto&&<AutoMatchModal items={items} autoClips={autoClips} onSave={onSaveAuto} onClose={()=>setAuto(false)}/>}
  </>;
}

/** Associação automática: lê etiquetas ID3/MP4/Vorbis (ou “Artista - Título” no nome) e confirma antes de salvar. */
function AutoMatchModal({items,autoClips,onSave,onClose}:{items:Item[];autoClips:ClipBank;onSave:(v:ClipBank)=>Promise<void>;onClose:()=>void}){
  const [matches,setMatches]=useState<FileMatch[]|null>(null),[reading,setReading]=useState<{done:number;total:number}|null>(null),[choice,setChoice]=useState<Record<number,string>>({}),[saving,setSaving]=useState(false),[failure,setFailure]=useState('');
  const cancel=useRef(false);
  useEffect(()=>()=>{cancel.current=true;},[]);
  const byId=useMemo(()=>new Map(items.map(item=>[item.id,item])),[items]);
  const read=async(list:FileList|null)=>{
    const files=[...(list??[])].filter(f=>f.type.startsWith('audio/')||/\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i.test(f.name)).slice(0,400);
    if(!files.length){setFailure('Nenhum arquivo de áudio encontrado.');return;}
    setFailure('');setMatches(null);cancel.current=false;setReading({done:0,total:files.length});
    const entries=[];
    for(const [i,file] of files.entries()){
      if(cancel.current)break;
      // Só os primeiros 512 KB (etiquetas ficam no início) e o fim (ID3v1) para não carregar músicas inteiras.
      const head=file.size>600_000?new File([file.slice(0,512_000),file.slice(file.size-128)],file.name,{type:file.type}):file;
      entries.push({file,tags:await readAudioTags(head).catch(()=>({via:'none' as const}))});
      setReading({done:i+1,total:files.length});
    }
    const result=matchAudioFiles(entries,items);
    setMatches(result);setChoice(Object.fromEntries(result.map((m,i)=>[i,m.confidence==='exata'?m.itemId!:''])));setReading(null);
  };
  const save=async()=>{
    if(!matches)return;setSaving(true);setFailure('');
    try{
      const next:ClipBank={...autoClips};
      for(const [i,match] of matches.entries()){
        const id=choice[i];if(!id)continue;
        if(!next[id]&&Object.keys(next).length>=AUTO_LIMIT)throw new Error(`Limite de ${AUTO_LIMIT} associações automáticas por perfil.`);
        const clip=await inspectAudioClip(match.file,{maxBytes:15*1024*1024,maxSeconds:900});
        next[id]={...clip,origin:'auto',matchedBy:`${match.tags.via==='filename'?'nome do arquivo':`etiqueta ${match.tags.via.toUpperCase()}`}: ${match.tags.artist} — ${match.tags.title}`};
      }
      await onSave(next);onClose();
    }catch(e){setFailure(e instanceof Error?e.message:'Não foi possível salvar as associações.');}
    finally{setSaving(false);}
  };
  const chosen=Object.values(choice).filter(Boolean).length;
  const groups:Array<[FileMatch['confidence'],string]>=[['exata','Correspondência exata'],['variante','Variação de título · confirme'],['ambígua','Ambíguas · escolha a gravação'],['sem correspondência','Sem correspondência no vídeo']];
  return <Modal title="Associar biblioteca local" subtitle="O app lê artista e título dos seus arquivos e propõe a música do chart. Nada sai do aparelho." onClose={onClose} wide>
    <div className="audio-clips-intro"><Wand2 size={24}/><p>Escolha vários arquivos ou uma pasta. Apenas artista + título iguais entram sozinhos; variações e homônimos pedem sua confirmação. Até {AUTO_LIMIT} associações, 15 MB por arquivo; tocamos os primeiros 30 s.</p></div>
    <div className="inline-actions">
      <label className="button primary"><Upload size={16}/><span>Escolher arquivos</span><input type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.webm" className="sr-only" aria-label="Escolher arquivos de áudio" onChange={e=>{void read(e.target.files);e.target.value='';}}/></label>
      <label className="button"><FolderOpen size={16}/><span>Escolher pasta</span><input type="file" multiple className="sr-only" aria-label="Escolher pasta de músicas" {...{webkitdirectory:''}} onChange={e=>{void read(e.target.files);e.target.value='';}}/></label>
    </div>
    {reading&&<div className="catalog-progress" role="status"><MusicLoader size="sm"/><span>Lendo etiquetas {reading.done}/{reading.total}</span><progress max={reading.total} value={reading.done}/><button type="button" className="button small" onClick={()=>{cancel.current=true;}}>Parar</button></div>}
    {failure&&<p className="alert error" role="alert">{failure}</p>}
    {matches&&<>
      {groups.map(([confidence,label])=>{const list=matches.map((m,i)=>[m,i] as const).filter(([m])=>m.confidence===confidence);if(!list.length)return null;
        return <details className="awards-area" key={confidence} open={confidence!=='sem correspondência'}><summary><span>{label}</span><b>{list.length}</b></summary><ul className="match-list">{list.map(([m,i])=>{const target=byId.get(choice[i]||m.itemId||m.candidates[0]||'');return <li key={i}>
          {target?<Cover item={target}/>:<span className="cover"><Music2 size={16}/></span>}
          <span className="truncate"><strong>{m.file.name}</strong><small>{m.tags.artist??'Artista desconhecido'} — {m.tags.title??'Título desconhecido'} · {m.tags.via==='filename'?'nome do arquivo':m.tags.via==='none'?'sem etiquetas':`etiqueta ${m.tags.via.toUpperCase()}`}</small></span>
          {confidence==='sem correspondência'?<small>Não está entre as músicas do vídeo.</small>:<select aria-label={`Associação de ${m.file.name}`} value={choice[i]??''} onChange={e=>setChoice({...choice,[i]:e.target.value})}><option value="">Não associar</option>{(m.candidates.length?m.candidates:[m.itemId!]).filter(Boolean).map(id=><option key={id} value={id}>{byId.get(id)?.name} · {byId.get(id)?.album||byId.get(id)?.artist}</option>)}</select>}
        </li>;})}</ul></details>;})}
      <div className="inline-actions"><button type="button" className="button primary" disabled={!chosen||saving} onClick={()=>void save()}>{saving?<MusicLoader size="sm" tone="ink"/>:<Wand2 size={16}/>}<span>Salvar {chosen} associações</span></button>{!!Object.keys(autoClips).length&&<button type="button" className="button" disabled={saving} onClick={async()=>{await onSave({});onClose();}}><Trash2 size={15}/><span>Limpar automáticas</span></button>}</div>
    </>}
  </Modal>;
}
