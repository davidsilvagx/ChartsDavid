import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, fetchWeek, parseTrack } from './api';
import { defaults } from './types';
import { makeWeeks } from './calendar';
const week=makeWeeks(defaults,Date.parse('2016-06-25T00:00:00Z'))[0];
const settings={...defaults,user:'test',apiKey:'test-key'};
const track=(t=week.start)=>({name:'Track',artist:{'#text':'Artist'},album:{'#text':'Album'},date:{uts:String(t)}});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('Leitura Last.fm',()=>{
 it('descarta now playing e timestamp inválido',()=>{expect(parseTrack({...track(),'@attr':{nowplaying:'true'}})).toBeNull();expect(parseTrack({...track(),date:{uts:'invalid'}})).toBeNull();expect(parseTrack(track())).toMatchObject({artist:'Artist',track:'Track'});});
 it('lê todas as páginas, filtra fronteiras e conta duplicatas',async()=>{
  const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({recenttracks:{track:[track(week.start-1),track(week.start)],'@attr':{user:'test',total:'4',totalPages:'2',page:'1'}}})).mockResolvedValueOnce(Response.json({recenttracks:{track:[track(week.start),track(week.end)],'@attr':{user:'test',total:'4',totalPages:'2',page:'2'}}}));
  vi.stubGlobal('fetch',fetchMock);const page=vi.fn();const result=await fetchWeek(settings,week,new AbortController().signal,page,week.end*1000);expect(result.scrobbles).toHaveLength(2);expect(result.duplicates).toBe(1);expect(page).toHaveBeenCalledTimes(2);expect(String(fetchMock.mock.calls[0][0])).toContain(`from=${week.start-1}`);
 });
 it('recusa resposta de outro usuário',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({recenttracks:{track:[],'@attr':{user:'other',total:'0',totalPages:'0',page:'1'}}})));await expect(fetchWeek(settings,week,new AbortController().signal,()=>{})).rejects.toThrow('perfil diferente');});
 it('recusa paginação incompleta',async()=>{vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({recenttracks:{track:[track()],'@attr':{user:'test',total:'2',totalPages:'1',page:'1'}}})));await expect(fetchWeek(settings,week,new AbortController().signal,()=>{})).rejects.toThrow('incompleta');});
 it('aceita semana completamente vazia no Last.fm (0 scrobbles) sem inventar faixas',async()=>{vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>Response.json({recenttracks:{track:[],'@attr':{user:'test',total:'0',totalPages:'0',page:'1'}}})));const res=await fetchWeek(settings,week,new AbortController().signal,()=>{},week.end*1000);expect(res.scrobbles).toEqual([]);expect(res.duplicates).toBe(0);});
 it('respeita cancelamento antes da consulta',async()=>{const controller=new AbortController();controller.abort();const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);await expect(api('user.getInfo',{user:'test'},'',controller.signal)).rejects.toThrow();expect(fetchMock).not.toHaveBeenCalled();});
 it('retenta erro temporário, mas falha em chave inválida',async()=>{const fetchMock=vi.fn().mockResolvedValueOnce(Response.json({error:16,message:'Temporary'})).mockResolvedValueOnce(Response.json({user:{name:'test'}}));vi.stubGlobal('fetch',fetchMock);await expect(api('user.getInfo',{user:'test'},'')).resolves.toEqual({user:{name:'test'}});expect(fetchMock).toHaveBeenCalledTimes(2);fetchMock.mockResolvedValue(Response.json({error:10,message:'bad key'}));await expect(api('user.getInfo',{user:'test'},'')).rejects.toThrow('Chave');},10000);
});
