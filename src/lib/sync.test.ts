import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaults, type SyncProgress } from './types';
vi.mock('./api', () => ({ getProfile: vi.fn(async () => ({name:'test'})), fetchWeek: vi.fn(async (_s, w, _signal, page) => {page(); return {scrobbles:[],cutoff:w.end,duplicates:0};}) }));
vi.mock('./storage', () => ({readWeeks:vi.fn(async()=>[]),putMeta:vi.fn(),saveWeek:vi.fn()}));
import { synchronize } from './sync';
import { fetchWeek } from './api';
afterEach(()=>vi.clearAllMocks());
describe('Progresso de sincronização',()=>{
 it('avança ao salvar cada semana e conclui o lote real',async()=>{
  const progress:SyncProgress[]=[]; const saved=vi.fn();
  await synchronize({...defaults,user:'test'},'recent',new AbortController().signal,p=>progress.push({...p}),false,saved);
  expect(progress[0].phase).toBe('connecting');
  expect(progress.some(p=>p.completed>1&&p.completed<p.total)).toBe(true);
  expect(progress.at(-1)).toMatchObject({completed:8,total:8,pages:8,phase:'done'});
  expect(saved).toHaveBeenCalledTimes(8);
 });
 it('não sinaliza conclusão quando uma semana falha',async()=>{
  vi.mocked(fetchWeek).mockRejectedValueOnce(new Error('offline'));
  const progress:SyncProgress[]=[];
  await expect(synchronize({...defaults,user:'test'},'recent',new AbortController().signal,p=>progress.push({...p}))).rejects.toThrow('offline');
  expect(progress.some(p=>p.phase==='done')).toBe(false);
 });
});
