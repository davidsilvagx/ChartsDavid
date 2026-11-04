import { ARTIST_OF_YEAR, GRAMMY_EDITION, genreGroupsOf, awardById, awardCategories, needLabels, type GrammyCategory } from './grammy';
import { metaKey, type EffectiveMeta } from './metadata';
import type { Item, Kind } from './types';
import { artistYearFormula, artistYearScores, runJury, sanitizeJury, type ItemStats, type JuryResult } from './jury';
import { personalDebutCheck } from './awardStats';
import { normalize } from './charts';

/** Indicado guardado como retrato do momento, para a cédula não mudar se o histórico for recalculado. */
export interface Nominee { id: string; kind: Kind | 'manual'; name: string; artist: string; album: string; image: string; plays?: number; basis: string }
export interface BallotEntry { categoryId: string; nominees: Nominee[]; winners: string[]; method: 'vote' | 'suggestion' | 'jury'; updatedAt: number; note?: string; jury?: JuryResult; rulesVersion?: 2 }
export interface Ballot {
  version: 1; edition: typeof GRAMMY_EDITION.id; profile: string; period: string; mode: 'vote' | 'jury';
  /** release: só lançamentos da janela do período (como o Grammy); any: qualquer lançamento. */
  eligibility: 'release' | 'any';
  selected: string[]; favorites: string[]; entries: Record<string, BallotEntry>; updatedAt: number;
}
export const subjectKind = (category: GrammyCategory): Kind | null =>
  category.subject === 'album' ? 'albums' : category.subject === 'artist' ? 'artists' : category.subject === 'recording' || category.subject === 'song' ? 'tracks' : null;

export const defaultSelection = ['record-of-the-year', 'album-of-the-year', 'song-of-the-year', 'best-new-artist', ARTIST_OF_YEAR, 'best-pop-solo-performance', 'best-rnb-song', 'best-rnb-album'];
export const hasPersonalYearRules = (id: string) => ['record-of-the-year', 'best-new-artist', ARTIST_OF_YEAR].includes(id);
export function emptyBallot(profile: string, period: string): Ballot {
  return { version: 1, edition: GRAMMY_EDITION.id, profile, period, mode: 'vote', eligibility: 'release', selected: [...defaultSelection], favorites: [], entries: {}, updatedAt: Date.now() };
}
export const ballotKey = (profile: string, period: string) => `lastchart-awards:v1:${profile.trim().toLowerCase()}:${GRAMMY_EDITION.id}:${period}`;

/** Valida dados vindos de localStorage, sincronização ou arquivo. Remove categorias desconhecidas. */
export function sanitizeBallot(raw: unknown, profile: string, period: string): Ballot {
  const base = emptyBallot(profile, period);
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<Ballot>;
  if (value.version !== 1 || value.edition !== GRAMMY_EDITION.id) return base;
  const known = (id: unknown): id is string => typeof id === 'string' && awardById.has(id);
  const entries: Record<string, BallotEntry> = {};
  for (const [id, entry] of Object.entries(value.entries ?? {})) {
    if (!known(id) || !entry || !Array.isArray(entry.nominees)) continue;
    const nominees = entry.nominees.filter(n => n && typeof n.id === 'string' && typeof n.name === 'string').slice(0, 10).map(n => ({
      id: n.id.slice(0, 400), kind: (['tracks', 'albums', 'artists', 'manual'] as const).includes(n.kind) ? n.kind : 'manual', name: n.name.slice(0, 200), artist: String(n.artist ?? '').slice(0, 200), album: String(n.album ?? '').slice(0, 200),
      image: typeof n.image === 'string' && /^https:\/\//.test(n.image) ? n.image : '', plays: Number.isFinite(n.plays) ? n.plays : undefined, basis: String(n.basis ?? 'Escolha pessoal').slice(0, 200),
    }));
    const ids = new Set(nominees.map(n => n.id));
    const jury = entry.method === 'jury' ? sanitizeJury(entry.jury, ids) : undefined;
    entries[id] = { categoryId: id, nominees, winners: jury ? [jury.winner] : (Array.isArray(entry.winners) ? entry.winners : []).filter(w => ids.has(w)).slice(0, 3), method: jury ? 'jury' : entry.method === 'suggestion' ? 'suggestion' : 'vote', updatedAt: Number(entry.updatedAt) || Date.now(), note: typeof entry.note === 'string' ? entry.note.slice(0, 900) : undefined, ...(jury ? { jury } : {}), ...(entry.rulesVersion === 2 ? { rulesVersion: 2 } : {}) };
  }
  const unique = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).filter(known))];
  return { ...base, mode: value.mode === 'jury' ? 'jury' : 'vote', eligibility: value.eligibility === 'any' ? 'any' : 'release', selected: unique(value.selected), favorites: unique(value.favorites), entries, updatedAt: Number(value.updatedAt) || Date.now() };
}

export interface Suggestion { nominees: Nominee[]; criterion: string; insufficient?: string; unknown?: number }
/** Janela de elegibilidade: o período escolhido com 4 meses de tolerância antes (a janela do Grammy atravessa anos). */
export interface Eligibility { mode: 'release' | 'any'; start: number; end: number; year: number; period?: string }
const TOLERANCE = 122 * 86400;
const releasedIn = (date: string | undefined, rules: Eligibility) => { if (!date) return null; const t = Date.parse(`${date}T12:00:00Z`) / 1000; return t >= rules.start - TOLERANCE && t < rules.end; };
/** Estimativa de carreira no catálogo, mantida para informações externas. A premiação pessoal usa personalDebutCheck. */
export function newArtistCheck(record: EffectiveMeta | undefined, rules: Eligibility): { ok: boolean | null; basis: string } {
  const prior = (record?.grammyYears ?? []).filter(y => y < rules.year).sort((a, b) => a - b)[0];
  if (prior) return { ok: false, basis: `Já concorreu ao Grammy em ${prior} (Wikidata) · não é revelação` };
  const dates = [record?.firstRelease, record?.mbFirstRelease].filter((d): d is string => !!d && /^\d{4}/.test(d)).sort();
  if (!dates.length) return { ok: null, basis: 'Carreira não verificada no catálogo' };
  const year = Number(dates[0].slice(0, 4)), albums = record?.albumCount ?? 0;
  const ok = year >= rules.year - 3 && albums <= 3;
  const source = record?.mbFirstRelease && dates[0] === record.mbFirstRelease ? 'MusicBrainz' : 'catálogo';
  return { ok, basis: `Estreia em ${year} (${source}) · ${albums} ${albums === 1 ? 'álbum' : 'álbuns'}${ok ? '' : year < rules.year - 3 ? ' · carreira longa demais para revelação' : ' · mais de 3 álbuns'}` };
}
/**
 * Sugestões só com critérios do próprio usuário e metadados verificados.
 * Reproduções não comprovam composição, engenharia ou qualidade artística — isso fica explícito no critério.
 */
export function suggestNominees(category: GrammyCategory, pools: Partial<Record<Kind, Item[]>>, meta: Partial<Record<Kind, Map<string, EffectiveMeta>>>, limit = 5, rules?: Eligibility, stats: Partial<Record<Kind, Record<string, ItemStats>>> = {}): Suggestion {
  if (limit <= 0) return { nominees: [], criterion: 'Nenhum indicado solicitado.' };
  const kind = subjectKind(category);
  if (!kind) return { nominees: [], criterion: 'Escolha pessoal', insufficient: `Esta categoria premia ${category.subject === 'person' ? 'pessoas por créditos de produção/composição' : 'vídeos ou filmes'}, que o histórico de scrobbles não registra. Adicione indicados manualmente.` };
  const sorted = [...(pools[kind] ?? [])].filter(item => item.plays > 0).sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const year = rules && rules.period !== 'all' ? rules.year : null;
  if (hasPersonalYearRules(category.id) && year === null) return { nominees: [], criterion: 'Premiação anual do seu chart', insufficient: 'Escolha um ano em Época para criar esta categoria. Todo o histórico mistura anos diferentes.' };
  if (category.id === 'record-of-the-year') {
    const top20 = sorted.slice(0, 20), snapshots = top20.map(item => nomineeFromItem(item, 'tracks'));
    const curator = runJury(category, snapshots, stats, meta, 0);
    const ranked = [...top20].sort((a, b) => (curator?.totals[b.id] ?? 0) - (curator?.totals[a.id] ?? 0) || b.plays - a.plays || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const chosen: Item[] = [], artistCounts = new Map<string, number>();
    const count = Math.min(5, limit, ranked.length);
    for (const item of ranked) { const artist = stats.tracks?.[item.id]?.artistId ?? normalize(item.artist); if ((artistCounts.get(artist) ?? 0) >= 2) continue; chosen.push(item); artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1); if (chosen.length === count) break; }
    for (const item of ranked) { if (chosen.length >= count) break; if (!chosen.some(n => n.id === item.id)) chosen.push(item); }
    return { nominees: chosen.map(item => ({ ...nomineeFromItem(item, 'tracks'), basis: `Top ${top20.findIndex(n => n.id === item.id) + 1} de ${year} · curadoria ${curator ? `${curator.totals[item.id].toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pontos` : 'sem comparação disponível'}` })), criterion: `Até cinco entre o Top 20 mais ouvido em ${year}: curadoria por volume, tempo ouvido confirmado, topo, constância, ascensão e afinidade com o artista no seu histórico. Critérios com dados insuficientes se abstêm; votação Borda, sem sorteio. Até duas faixas por artista quando houver alternativas suficientes. Vale a escuta no ano, independentemente do lançamento.`, insufficient: chosen.length ? undefined : 'Não há músicas ouvidas no ano escolhido.' };
  }
  if (category.id === 'best-new-artist') {
    const checked = sorted.map(item => ({ item, check: personalDebutCheck(stats.artists?.[item.id], year) }));
    const eligible = checked.filter(c => c.check.ok).slice(0, limit), unknown = checked.filter(c => c.check.ok === null).length;
    if (!eligible.length) return { nominees: [], criterion: 'Estreia no seu chart', unknown, insufficient: unknown ? `Nenhuma estreia pessoal confirmada em ${year}; ${unknown} artistas ainda dependem da verificação do histórico. Baixe as semanas anteriores para confirmar a primeira entrada no Top 100 de artistas.` : `Nenhum artista estreou no seu Top 100 de artistas em ${year}. Os que já entraram antes não concorrem novamente.` };
    return { nominees: eligible.map(c => ({ id: c.item.id, kind, name: c.item.name, artist: c.item.artist, album: c.item.album, image: c.item.image, plays: c.item.plays, basis: c.check.basis })), criterion: `Primeira entrada no seu Top 100 de artistas em ${year}, desde o início da contagem e na fonte escolhida; indicados ordenados por reproduções nesse ano. Carreira, idade e Grammys oficiais não interferem.`, unknown };
  }
  if (category.id === ARTIST_OF_YEAR) {
    const scores = artistYearScores(stats.artists ?? {}), score = (id: string) => scores[id].top + scores[id].volume + scores[id].steady;
    const candidates = sorted.filter(item => scores[item.id]).sort((a, b) => score(b.id) - score(a.id) || b.plays - a.plays || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, limit);
    return { nominees: candidates.map(item => { const row = stats.artists![item.id]; return { ...nomineeFromItem(item, 'artists'), basis: `${score(item.id).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/100 · ${row.top10Tracks} músicas no Top 10 · ${row.plays.toLocaleString('pt-BR')} plays · ${row.trackWeeksAtOne} ${row.trackWeeksAtOne === 1 ? 'semana' : 'semanas'} com música em #1 · ${year}` }; }), criterion: artistYearFormula, insufficient: candidates.length ? undefined : 'Não há desempenho anual verificado de artistas. Sincronize o ano escolhido.' };
  }
  // Obras precisam ter sido lançadas na janela do período (quando a regra está ativa); data desconhecida fica de fora.
  const windowed = rules?.mode === 'release' && kind !== 'artists' ? sorted.filter(item => releasedIn(meta[kind]?.get(metaKey(kind, item))?.releaseDate, rules) === true) : sorted;
  const unknown = rules?.mode === 'release' && kind !== 'artists' ? sorted.slice(0, 60).filter(item => releasedIn(meta[kind]?.get(metaKey(kind, item))?.releaseDate, rules) === null).length : 0;
  if (rules?.mode === 'release' && kind !== 'artists' && !windowed.length) return { nominees: [], criterion: 'Lançamentos da janela', unknown, insufficient: unknown ? `Nenhum item com lançamento confirmado entre ${new Date((rules.start - TOLERANCE) * 1000).toLocaleDateString('pt-BR')} e ${new Date(rules.end * 1000).toLocaleDateString('pt-BR')}; ${unknown} ainda sem data. Toque em “Verificar elegibilidade”.` : 'Nada lançado dentro da janela do período entre os seus mais ouvidos. Mude a elegibilidade para “qualquer lançamento”.' };
  const pool = windowed;
  if (!pool.length) return { nominees: [], criterion: 'Reproduções no período', insufficient: 'Não há itens deste tipo no período escolhido. Sincronize o período ou mude a época.' };
  const windowNote = rules?.mode === 'release' && kind !== 'artists' ? ' · lançados na janela do período' : '';
  const caveats = category.needs.map(need => needLabels[need]);
  const note = caveats.length ? ` · Atenção: ${caveats.join('; ')}.` : '';
  const snapshot = (item: Item, basis: string): Nominee => ({ id: item.id, kind, name: item.name, artist: item.artist, album: item.album, image: item.image, plays: item.plays, basis });
  if (category.id === 'best-remixed-recording') {
    const remixes = pool.filter(item => meta.tracks?.get(metaKey('tracks', item))?.versions.includes('remix') || /\bremix\b/i.test(item.name)).slice(0, limit);
    return remixes.length ? { nominees: remixes.map(item => snapshot(item, 'Marcador “remix” no título · ordenado por reproduções')), criterion: `Gravações com “remix” no título, ordenadas pelas suas reproduções${note}` }
      : { nominees: [], criterion: 'Marcador “remix” no título', insufficient: 'Nenhuma gravação com marcador de remix no título. Adicione indicados manualmente.' };
  }
  if (category.id === 'best-album-cover') {
    const covers = pool.filter(item => item.image).slice(0, limit);
    return { nominees: covers.map(item => snapshot(item, 'Álbum com capa no período · ordenado por reproduções')), criterion: 'Álbuns com capa disponível, ordenados por reproduções. A escolha da capa vencedora é estética e sua.', insufficient: covers.length ? undefined : 'Nenhuma capa disponível nos álbuns do período.' };
  }
  if (!category.genre) {
    return { nominees: pool.slice(0, limit).map(item => snapshot(item, `Mais reproduções no período${windowNote}`)), criterion: `Mais reproduções verificadas no período${windowNote} (critério pessoal, não oficial)${note}`, unknown };
  }
  const records = meta[kind];
  const withGenre = pool.filter(item => records?.get(metaKey(kind, item))?.genre);
  const matches = withGenre.filter(item => genreGroupsOf(records!.get(metaKey(kind, item))!.genre).includes(category.genre!)).slice(0, limit);
  if (!withGenre.length) return { nominees: [], criterion: 'Gênero do catálogo', insufficient: 'Ainda não há gêneros verificados para estes itens. Use “Gêneros e tempo” no Acervo para consultar o catálogo, ou indique manualmente.' };
  if (!matches.length) return { nominees: [], criterion: 'Gênero do catálogo', insufficient: `Nenhum item com gênero compatível entre ${withGenre.length} com gênero verificado. Indique manualmente se discordar do catálogo.` };
  return {
    nominees: matches.map(item => snapshot(item, `Gênero no catálogo: ${records!.get(metaKey(kind, item))!.genre}${records!.get(metaKey(kind, item))!.reviewed ? ' (revisado)' : ''}`)),
    criterion: `Itens cujo gênero verificado é compatível, ordenados pelas suas reproduções${note}`,
  };
}

export type ReadinessIssue = { categoryId: string; reason: string };
export function personalEntryIssue(entry: BallotEntry, pools: Partial<Record<Kind, Item[]>> | null, stats: Partial<Record<Kind, Record<string, ItemStats>>>, rules: Eligibility): string | undefined {
  if (!hasPersonalYearRules(entry.categoryId)) return;
  if (entry.rulesVersion !== 2) return 'Os critérios desta categoria mudaram. Atualize os indicados; o resultado salvo foi preservado.';
  if (rules.period === 'all') return 'Escolha um ano para esta categoria anual.';
  if (!pools) return 'Reunindo dados do ano e do histórico anterior para validar os indicados.';
  if (entry.categoryId === 'best-new-artist' && entry.nominees.some(n => n.kind !== 'artists' || personalDebutCheck(stats.artists?.[n.id], rules.year).ok !== true)) return `Há indicados sem estreia pessoal confirmada em ${rules.year}. Atualize a lista ou baixe o histórico anterior.`;
  if (entry.categoryId === 'record-of-the-year') {
    const top20 = new Set([...(pools.tracks ?? [])].filter(n => n.plays > 0).sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, 20).map(n => n.id));
    if (entry.nominees.length > 5 || entry.nominees.some(n => n.kind !== 'tracks' || !top20.has(n.id))) return 'Gravação do Ano aceita até cinco músicas entre o Top 20 ouvido no ano escolhido. Atualize os indicados.';
  }
  if (entry.categoryId === ARTIST_OF_YEAR) {
    const scores = artistYearScores(stats.artists ?? {});
    if (entry.nominees.some(n => n.kind !== 'artists' || !scores[n.id])) return `Há artistas sem desempenho verificado em ${rules.year}. Atualize os indicados.`;
  }
}
/** Categorias que entram na cerimônia: selecionadas, com indicados e vencedor escolhido. */
export function ceremonyReadiness(ballot: Ballot, ruleIssues: Record<string, string> = {}) {
  const ready: string[] = [], issues: ReadinessIssue[] = [];
  for (const id of ballot.selected) {
    const entry = ballot.entries[id];
    if (!awardById.has(id)) continue;
    if (!entry?.nominees.length) issues.push({ categoryId: id, reason: 'Sem indicados. Aceite sugestões ou adicione manualmente.' });
    else if (ruleIssues[id] || (hasPersonalYearRules(id) && entry.rulesVersion !== 2)) issues.push({ categoryId: id, reason: ruleIssues[id] ?? 'Os critérios desta categoria mudaram. Atualize os indicados na cédula para aplicar as novas regras.' });
    else if (!entry.winners.length) issues.push({ categoryId: id, reason: 'Indicados prontos; falta escolher o vencedor.' });
    else ready.push(id);
  }
  return { ready, issues };
}

export interface RevealCard { category: GrammyCategory; nominees: Nominee[]; winners: Nominee[]; method: BallotEntry['method']; criterion?: string; jury?: JuryResult }
/** Congela o resultado antes da revelação: alterações posteriores não mudam o vencedor durante a animação. */
export function freezeCeremony(ballot: Ballot, ruleIssues: Record<string, string> = {}): RevealCard[] {
  return ceremonyReadiness(ballot, ruleIssues).ready.map(id => {
    const entry = ballot.entries[id];
    const nominees = entry.nominees.map(n => ({ ...n }));
    return Object.freeze({ category: awardById.get(id)!, nominees, winners: nominees.filter(n => entry.winners.includes(n.id)), method: entry.method, criterion: entry.note, jury: entry.jury });
  });
}

export const nomineeFromItem = (item: Item, kind: Kind, basis = 'Escolha pessoal no acervo'): Nominee => ({ id: item.id, kind, name: item.name, artist: item.artist, album: item.album, image: item.image, plays: item.plays, basis });
export const manualNominee = (name: string, artist: string): Nominee => ({ id: `manual:${crypto.randomUUID()}`, kind: 'manual', name: name.trim().slice(0, 200), artist: artist.trim().slice(0, 200), album: '', image: '', basis: 'Indicação manual identificada' });

export const categoryOrder = new Map(awardCategories.map((category, i) => [category.id, category.personal ? 6 : i]));

/**
 * Júri automático: para cada categoria selecionada, escolhe até 6 indicados pelas regras de sugestão e
 * deixa os jurados decidirem. Resultado guardado lacrado até a cerimônia; categorias sem dados ficam explicadas.
 */
export function conveneJury(ballot: Ballot, pools: Partial<Record<Kind, Item[]>>, meta: Partial<Record<Kind, Map<string, EffectiveMeta>>>, stats: Partial<Record<Kind, Record<string, ItemStats>>>, now = Date.now(), rules?: Eligibility) {
  const entries = { ...ballot.entries };
  const skipped: Array<{ categoryId: string; reason: string }> = [];
  let decided = 0;
  for (const id of ballot.selected) {
    const category = awardById.get(id);
    if (!category) continue;
    const suggestion = suggestNominees(category, pools, meta, 6, rules, stats);
    const result = suggestion.nominees.length >= 2 ? runJury(category, suggestion.nominees, stats, meta, now) : null;
    if (!result) { skipped.push({ categoryId: id, reason: suggestion.insufficient ?? 'Menos de dois indicados com dados para o júri comparar.' }); continue; }
    entries[id] = { categoryId: id, nominees: suggestion.nominees, winners: [result.winner], method: 'jury', updatedAt: now, note: suggestion.criterion, jury: result, ...(hasPersonalYearRules(id) ? { rulesVersion: 2 as const } : {}) };
    decided++;
  }
  return { ballot: { ...ballot, mode: 'jury' as const, entries, updatedAt: now }, decided, skipped };
}
