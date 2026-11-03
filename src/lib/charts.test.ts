import { describe, expect, it } from 'vitest';
import { makeWeeks, namespace, validateCalendar } from './calendar';
import { buildCharts, computeRecords, getCertification, getItemAuditHistory, getLibrary, itemOf, trimTimeline } from './charts';
import { defaults, type CachedWeek, type Scrobble } from './types';
import { chartCSV, parseBackup, backupJSON } from './export';
const settings={...defaults,user:'test',timezone:'UTC'};
const weeks=makeWeeks(settings,Date.parse('2016-07-23T12:00:00Z'));
const scrobble=(week:number,name='Song',artist='Artist',album='Album',offset=100):Scrobble=>({timestamp:weeks[week].start+offset,track:name,artist,album,image:''});
const cache=(index:number,scrobbles:Scrobble[]):CachedWeek=>({key:String(index),week:weeks[index],scrobbles,cutoff:weeks[index].end,fetchedAt:1,duplicates:0});
it('compartilha passos imutáveis para economizar memória sem estender snapshots antigos', () => {
 const result=buildCharts(weeks.slice(0,3),[cache(0,repeat(0,'Song',2)),cache(1,[]),cache(2,repeat(2,'Song',1))],'tracks');
 const first=result[0].entries[0].run;
 const latest=result[2].entries[0].run;
 expect(first).toHaveLength(1);
 expect(latest.map(r=>r.rank)).toEqual([1,null,1]);
 expect(latest[0]).toBe(first[0]);
 expect(first).not.toBe(latest);
});
const repeat=(week:number,name:string,count:number)=>Array.from({length:count},(_,i)=>scrobble(week,name,'Artist','Album',100+i));
describe('Calendário de sexta-feira',()=>{
 it('preserva semana 1 e todas as semanas vazias',()=>{expect(weeks[0].id).toBe('2016-06-24');expect(new Date(weeks[0].start*1000).toISOString()).toBe('2016-06-24T00:00:00.000Z');expect(new Date(weeks[0].end*1000).toISOString()).toBe('2016-07-01T00:00:00.000Z');expect(weeks.map(w=>w.number)).toEqual([1,2,3,4,5]);});
 it('valida sexta, fuso e futuro',()=>{expect(()=>validateCalendar('2016-06-25','UTC')).toThrow('sexta');expect(()=>validateCalendar('2016-06-24','Mars/Olympus')).toThrow();expect(()=>validateCalendar('2099-01-02','UTC')).toThrow();});
 it('usa dias de calendário em mudanças de horário de verão',()=>{const result=makeWeeks({...settings,startDate:'2016-10-14',timezone:'America/Sao_Paulo'},Date.parse('2016-10-22T00:00:00Z'));expect(result[0].end-result[0].start).toBe(601200);expect(result[1].start).toBe(result[0].end);});
 it('atravessa ano bissexto sem perder semanas',()=>{const result=makeWeeks({...settings,startDate:'2020-02-28'},Date.parse('2020-03-13T00:00:00Z'));expect(result.map(w=>w.id)).toEqual(['2020-02-28','2020-03-06','2020-03-13']);});
 it('isola cache por usuário, fuso e calendário',()=>{expect(namespace(settings)).not.toBe(namespace({...settings,user:'other'}));expect(namespace(settings)).not.toBe(namespace({...settings,timezone:'America/Sao_Paulo'}));});
});
describe('Ranking auditável',()=>{
 it('inclui sexta 00:00 e exclui próxima sexta',()=>{const result=buildCharts(weeks.slice(0,1),[cache(0,[scrobble(0,'First','A','Album',0),scrobble(0,'Last','A','Album',604799),scrobble(0,'Outside','A','Album',604800)])],'tracks');expect(result[0].plays).toBe(2);expect(result[0].entries.map(e=>e.name)).not.toContain('Outside');});
 it('diferencia ausência de dados e semana vazia',()=>{const result=buildCharts(weeks,[cache(0,[])],'tracks');expect(result[0].status).toBe('loaded');expect(result[0].plays).toBe(0);expect(result[1].status).toBe('missing');});
 it('mantém reentradas, OUT, pico e semanas',()=>{const result=buildCharts(weeks.slice(0,3),[cache(0,repeat(0,'Song',2)),cache(1,[]),cache(2,repeat(2,'Song',1))],'tracks');const e=result[2].entries[0];expect(e.change).toBe('RE');expect(e.peak).toBe(1);expect(e.weeks).toBe(2);expect(e.run.map(r=>r.rank)).toEqual([1,null,1]);expect(e.totalPlays).toBe(3);});
 it('nunca afirma estreia após lacuna desconhecida',()=>{const result=buildCharts(weeks.slice(0,3),[cache(0,repeat(0,'Song',1)),cache(2,repeat(2,'Other',1))],'tracks');expect(result[2].entries[0].change).toBe('?');expect(result[2].provisional).toBe(true);});
 it('usa semana anterior como desempate e ordem lexical estável',()=>{const result=buildCharts(weeks.slice(0,2),[cache(0,[...repeat(0,'Z',2),...repeat(0,'A',1)]),cache(1,[...repeat(1,'A',2),...repeat(1,'Z',2)])],'tracks');expect(result[1].entries.map(e=>e.name)).toEqual(['Z','A']);});
 it('não mistura versões/álbuns com mesmo título',()=>{const result=buildCharts(weeks.slice(0,1),[cache(0,[scrobble(0,'Same','A','2016'),scrobble(0,'Same','A','2026')])],'tracks');expect(result[0].entries).toHaveLength(2);expect(itemOf(scrobble(0),'tracks')?.id).toBe(itemOf({...scrobble(0),artist:'ARTIST '},'tracks')?.id);});
 it('duplicatas só são removidas quando solicitado',()=>{const s=scrobble(0);const c=[cache(0,[s,s])];expect(buildCharts(weeks.slice(0,1),c,'tracks')[0].plays).toBe(2);expect(buildCharts(weeks.slice(0,1),c,'tracks',true)[0].plays).toBe(1);});
 it('não inventa álbuns quando metadados faltam',()=>{const c=[cache(0,[scrobble(0,'Song','A','')])];expect(buildCharts(weeks.slice(0,1),c,'albums')[0].entries).toHaveLength(0);expect(buildCharts(weeks.slice(0,1),c,'artists')[0].entries).toHaveLength(1);});
 it('mantém todas as faixas na biblioteca além do Top 100',()=>{const c=[cache(0,Array.from({length:150},(_,i)=>scrobble(0,`Song${i}`)))];expect(buildCharts(weeks.slice(0,1),c,'tracks')[0].entries).toHaveLength(100);expect(getLibrary(c,'tracks')).toHaveLength(150);});
 it('filtrar ano não recalcula pico nem semanas',()=>{const w=makeWeeks({...settings,startDate:'2016-12-23'},Date.parse('2017-01-07'));const c=w.map((week,i)=>({...cache(0,[{...scrobble(0),timestamp:week.start+1}]),week,key:String(i),cutoff:week.end}));const all=buildCharts(w,c,'tracks');expect(all.filter(w=>w.year===2017)[0].entries[0].weeks).toBe(3);});
 it('timeline conserva intervalos vazios e encerra após última reentrada',()=>{const all=buildCharts(weeks,[cache(0,[]),cache(1,[scrobble(1)]),cache(2,[]),cache(3,[scrobble(3)]),cache(4,[])],'tracks');const id=all[1].entries[0].id;const trimmed=trimTimeline(all,[id]);expect(trimmed.map(w=>w.number)).toEqual([2,3,4]);expect(trimTimeline(all,[])).toEqual([]);});
 it('aplica aliases auditáveis sem mutar scrobbles originais e calcula recordes/certificações',()=>{
  const raw=[cache(0,[scrobble(0,'Expectations (Live)','Lauren Jauregui','Album',10),scrobble(0,'Expectations','Lauren Jauregui','Album',20)])];
  const separate=buildCharts(weeks.slice(0,1),raw,'tracks');
  expect(separate[0].entries).toHaveLength(2);
  const merged=buildCharts(weeks.slice(0,1),raw,'tracks',false,[{id:'r1',kind:'tracks',artist:'Lauren Jauregui',from:'Expectations (Live)',to:'Expectations'}]);
  expect(merged[0].entries).toHaveLength(1);
  expect(merged[0].entries[0].plays).toBe(2);
  expect(merged[0].entries[0].weeksAtOne).toBe(1);
  const rec=computeRecords(merged);
  expect(rec.mostWeeksAtOne[0].weeksAtOne).toBe(1);
  expect(getCertification(200).tier).toBe('diamond');
  expect(getCertification(55).tier).toBe('platinum');
 });
});
describe('Exportação e importação',()=>{
 it('escapa CSV, vírgulas, aspas e fórmulas',()=>{const chart=buildCharts(weeks.slice(0,1),[cache(0,[scrobble(0,'=HYPERLINK("bad")','A,B')])],'tracks');const csv=chartCSV(chart[0].entries);expect(csv).toContain('"\'=HYPERLINK(""bad"")"');expect(csv).toContain('"A,B"');});
 it('backup não expõe API key e restaura dados validados',()=>{const raw=backupJSON({...settings,apiKey:'secret'},[cache(0,[scrobble(0)])],null);expect(raw).not.toContain('secret');const restored=parseBackup(raw);expect(restored.weeks[0].scrobbles).toHaveLength(1);expect(restored.settings.apiKey).toBe('');});
 it('rejeita duplicatas de semana e timestamps fora do intervalo',()=>{const bad=JSON.parse(backupJSON(settings,[cache(0,[scrobble(0)])],null));bad.weeks[0].scrobbles[0].timestamp=1;expect(()=>parseBackup(JSON.stringify(bad))).toThrow('Scrobble');const duplicated=backupJSON(settings,[cache(0,[]),cache(0,[])],null);expect(()=>parseBackup(duplicated)).toThrow('duplicada');});
 it('rejeita conteúdo desconhecido e datas incompatíveis',()=>{expect(()=>parseBackup('{}')).toThrow('backup');const bad=JSON.parse(backupJSON(settings,[],null));bad.settings.startDate='2016-06-25';expect(()=>parseBackup(JSON.stringify(bad))).toThrow('sexta');});
});

describe('Integridade contra posições fictícias, épocas vazias e tempo fora do chart', () => {
  const tenWeeks = makeWeeks(settings, Date.parse('2016-08-27T12:00:00Z')); // 10 semanas
  const cacheW = (idx: number, scrobbles: Scrobble[]): CachedWeek => ({
    key: String(idx),
    week: tenWeeks[idx],
    scrobbles,
    cutoff: tenWeeks[idx].end,
    fetchedAt: 1,
    duplicates: 0,
  });
  const repW = (idx: number, name: string, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      timestamp: tenWeeks[idx].start + 100 + i,
      track: name,
      artist: 'Artist',
      album: 'Album',
      image: '',
    }));

  it('jamais coloca músicas sem play nas últimas posições (#4..#100)', () => {
    // Semana 1 tem 25 músicas; Semana 2 tem apenas 3 músicas tocadas (as outras 22 tiveram 0 plays)
    const w1Scrobbles = Array.from({ length: 25 }, (_, i) => repW(0, `Track-${i + 1}`, 30 - i)).flat();
    const w2Scrobbles = [...repW(1, 'Track-1', 5), ...repW(1, 'Track-2', 3), ...repW(1, 'NewTrack', 1)];
    const result = buildCharts(tenWeeks.slice(0, 2), [cacheW(0, w1Scrobbles), cacheW(1, w2Scrobbles)], 'tracks');

    expect(result[0].entries).toHaveLength(25);
    expect(result[1].entries).toHaveLength(3); // Exatamente 3 posições, nunca preenche #4..#100!
    expect(result[1].entries.map(e => [e.rank, e.name, e.plays])).toEqual([
      [1, 'Track-1', 5],
      [2, 'Track-2', 3],
      [3, 'NewTrack', 1],
    ]);
    expect(result[1].entries.every(e => e.plays >= 1)).toBe(true);
  });

  it('trata épocas com Last.fm 100% vazio sem inventar dados e calcula hiatusWeeks exato no retorno', () => {
    // Sem. 1: Hit toca 6x (#1). Sem. 2, 3 e 4: Last.fm completamente vazio (0 scrobbles). Sem. 5: Hit volta com 2 plays.
    const result = buildCharts(
      tenWeeks.slice(0, 5),
      [cacheW(0, repW(0, 'Hit', 6)), cacheW(1, []), cacheW(2, []), cacheW(3, []), cacheW(4, repW(4, 'Hit', 2))],
      'tracks',
    );

    expect(result[1].status).toBe('loaded');
    expect(result[1].entries).toEqual([]);
    expect(result[2].entries).toEqual([]);
    expect(result[3].entries).toEqual([]);

    const reEntry = result[4].entries[0];
    expect(reEntry.change).toBe('RE');
    expect(reEntry.hiatusWeeks).toBe(3); // Exatamente 3 semanas fora do chart (0 plays)!
    expect(reEntry.weeksOut).toBe(3);
    expect(reEntry.weeks).toBe(2);
    expect(reEntry.run.map(r => [r.rank, r.plays])).toEqual([
      [1, 6],
      [null, 0],
      [null, 0],
      [null, 0],
      [1, 2],
    ]);
  });

  it('exibe todas as semanas fora após a última aparição até o presente via getItemAuditHistory', () => {
    // Música toca na Sem. 1 e Sem. 2, depois fica Sem. 3, 4, 5 e 6 com 0 plays sem nunca retornar
    const result = buildCharts(
      tenWeeks.slice(0, 6),
      [
        cacheW(0, repW(0, 'EarlySong', 4)),
        cacheW(1, repW(1, 'EarlySong', 2)),
        cacheW(2, repW(2, 'OtherSong', 5)),
        cacheW(3, []),
        cacheW(4, repW(4, 'OtherSong', 3)),
        cacheW(5, []),
      ],
      'tracks',
    );
    const id = result[0].entries[0].id;
    const audit = getItemAuditHistory(result, id);

    expect(audit.charted).toBe(true);
    expect(audit.weeks).toBe(2);
    expect(audit.totalWeeksOut).toBe(4);
    expect(audit.currentOutStreak).toBe(4);
    expect(audit.longestOutStreak).toBe(4);
    expect(audit.zeroPlayWeeks).toBe(4);
    expect(audit.run.map(r => r.rank)).toEqual([1, 1, null, null, null, null]);
  });

  it('não inventa contagem de semanas fora (hiatusWeeks = null) quando há semana não sincronizada no meio', () => {
    // Sem. 1 carregada -> Sem. 2 NÃO sincronizada (missing) -> Sem. 3 vazia carregada -> Sem. 4 retorno
    const result = buildCharts(
      tenWeeks.slice(0, 4),
      [cacheW(0, repW(0, 'SongX', 3)), cacheW(2, []), cacheW(3, repW(3, 'SongX', 2))],
      'tracks',
    );
    const reEntry = result[3].entries[0];
    expect(reEntry.change).toBe('RE');
    expect(reEntry.hiatusWeeks).toBeNull(); // Honesto: Sem. 2 não foi sincronizada!
    const audit = getItemAuditHistory(result, reEntry.id);
    expect(audit.missingWeeksSinceDebut).toBe(1);
    expect(audit.run.map(r => r.rank)).toEqual([1, undefined, null, 1]);
  });

  it('impede vazamento de scrobble de quinta 23:59:59 para sexta 00:00:00 como posição fantasma', () => {
    const thursday235959: Scrobble = {
      timestamp: tenWeeks[1].start - 1, // 1 segundo antes de abrir a Semana 2
      track: 'Ghost',
      artist: 'Artist',
      album: 'Album',
      image: '',
    };
    const result = buildCharts(tenWeeks.slice(1, 2), [cacheW(1, [thursday235959])], 'tracks');
    expect(result[0].plays).toBe(0);
    expect(result[0].entries).toHaveLength(0);
  });

  it('exporta semanas fora no CSV e preserva avatar musical no backup JSON', () => {
    const result = buildCharts(
      tenWeeks.slice(0, 4),
      [cacheW(0, repW(0, 'Hit', 4)), cacheW(1, []), cacheW(2, []), cacheW(3, repW(3, 'Hit', 2))],
      'tracks',
    );
    const csv = chartCSV(result[3].entries);
    expect(csv).toContain('Semanas fora antes do retorno');
    expect(csv).toContain('"2","2","Hit"');
    expect(csv).toContain('OUT(0p)');

    const json = backupJSON({ ...settings, avatar: 'synth-wave' }, [cache(0, [scrobble(0)])], null);
    const parsed = parseBackup(json);
    expect(parsed.settings.avatar).toBe('synth-wave');
  });
});
