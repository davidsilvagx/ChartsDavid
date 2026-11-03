import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaults, type SyncProgress, type Week } from './types';
import { makeWeeks, weekKey } from './calendar';
vi.mock('./api', async importOriginal => ({ ...await importOriginal<typeof import('./api')>(), getProfile: vi.fn(async () => ({name:'test'})), fetchWeek: vi.fn() }));
vi.mock('./storage', async importOriginal => ({...await importOriginal<typeof import('./storage')>(),readWeeks:vi.fn(async()=>[]),putMeta:vi.fn(),saveWeek:vi.fn()}));
import { synchronize } from './sync';
import { ApiError, fetchWeek } from './api';
import { readWeeks, saveWeek } from './storage';
const settings = {...defaults,user:'test'};
const result = (w: Week) => ({scrobbles:[],cutoff:w.end,duplicates:0});
beforeEach(()=>{
 vi.clearAllMocks();
 vi.mocked(readWeeks).mockResolvedValue([]);
 vi.mocked(fetchWeek).mockImplementation(async (_s,w,_signal,page)=>{page(1,1);return result(w);});
});
describe('Progresso de sincronização',()=>{
 it('avança ao salvar cada semana e conclui o lote real',async()=>{
  const progress:SyncProgress[]=[]; const saved=vi.fn();
  await synchronize({...defaults,user:'test'},'recent',new AbortController().signal,p=>progress.push({...p}),false,saved);
  expect(progress[0].phase).toBe('connecting');
  expect(progress.some(p=>p.completed>1&&p.completed<p.total)).toBe(true);
  expect(progress.at(-1)).toMatchObject({completed:8,total:8,pages:8,phase:'done'});
  expect(saved).toHaveBeenCalledTimes(8);
 });
 it('retenta uma semana com falha temporária e termina todas',async()=>{
  vi.mocked(fetchWeek).mockRejectedValueOnce(new Error('offline'));
  const progress:SyncProgress[]=[];
  await synchronize(settings,'recent',new AbortController().signal,p=>progress.push({...p}));
  expect(fetchWeek).toHaveBeenCalledTimes(9);
  expect(saveWeek).toHaveBeenCalledTimes(8);
  expect(progress.at(-1)).toMatchObject({completed:8,total:8,phase:'done'});
 });
 it('continua as demais semanas e informa pendências sem anunciar sucesso',async()=>{
  const failedId=makeWeeks(settings).at(-8)!.id;
  vi.mocked(fetchWeek).mockImplementation(async(_s,w)=>{if(w.id===failedId)throw new Error('offline');return result(w);});
  const progress:SyncProgress[]=[];
  await expect(synchronize(settings,'recent',new AbortController().signal,p=>progress.push({...p}))).rejects.toThrow('7 de 8 semanas');
  expect(saveWeek).toHaveBeenCalledTimes(7);
  expect(fetchWeek).toHaveBeenCalledTimes(9);
  expect(progress.some(p=>p.phase==='done')).toBe(false);
 });
 it('retoma só semanas ausentes ou incompletas, com progresso do lote e sem perder Spotify',async()=>{
  const selected=makeWeeks(settings).filter(w=>w.year===2016);
  const cached=selected.slice(1).map(w=>({key:weekKey(settings,w.id),week:w,scrobbles:[],cutoff:w.end,fetchedAt:1,duplicates:0}));
  const incomplete=cached[0];incomplete.cutoff=incomplete.week.start+1;
  const spotify={timestamp:incomplete.week.start+2,track:'Keep me',artist:'Artist',album:'',image:'',source:'spotify' as const};
  vi.mocked(readWeeks).mockResolvedValue(cached.map(w=>w===incomplete?{...w,scrobbles:[spotify]}:w));
  const progress:SyncProgress[]=[];
  await synchronize(settings,2016,new AbortController().signal,p=>progress.push({...p}));
  expect(fetchWeek).toHaveBeenCalledTimes(2);
  expect(progress.at(-1)).toMatchObject({completed:2,total:2,phase:'done'});
  expect(vi.mocked(saveWeek).mock.calls.some(([w])=>w.scrobbles.includes(spotify))).toBe(true);
 });
 it('interrompe chave inválida sem fingir conclusão',async()=>{
  vi.mocked(fetchWeek).mockRejectedValue(new ApiError('Chave inválida',10));
  const progress:SyncProgress[]=[];
  await expect(synchronize(settings,'all',new AbortController().signal,p=>progress.push(p))).rejects.toThrow('Chave inválida');
  expect(fetchWeek).toHaveBeenCalledTimes(5);
  expect(saveWeek).not.toHaveBeenCalled();
  expect(progress.some(p=>p.phase==='done')).toBe(false);
 });
 it('não confunde semana importada do Spotify com arquivo Last.fm completo',async()=>{
  const selected=makeWeeks(settings).filter(w=>w.year===2016);
  const spotify={timestamp:selected[0].start+2,track:'Keep me',artist:'Artist',album:'',image:'',source:'spotify' as const};
  vi.mocked(readWeeks).mockResolvedValue(selected.map((w,i)=>({key:weekKey(settings,w.id),week:w,scrobbles:i===0?[spotify]:[],lastfmSynced:i!==0,cutoff:w.end,fetchedAt:1,duplicates:0})));
  await synchronize(settings,2016,new AbortController().signal,()=>{});
  expect(fetchWeek).toHaveBeenCalledTimes(1);
  expect(vi.mocked(saveWeek).mock.calls[0][0]).toMatchObject({lastfmSynced:true,scrobbles:[spotify]});
 });
 it('pausa sem salvar semanas recebidas após o cancelamento',async()=>{
  const abort=new AbortController();
  vi.mocked(fetchWeek).mockImplementation(async(_s,w)=>{abort.abort();return result(w);});
  const progress:SyncProgress[]=[];
  await expect(synchronize(settings,'recent',abort.signal,p=>progress.push(p))).rejects.toThrow();
  expect(saveWeek).not.toHaveBeenCalled();
  expect(progress.some(p=>p.phase==='done')).toBe(false);
 });
});
