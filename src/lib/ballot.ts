import { GRAMMY_EDITION, genreGroupsOf, grammyById, grammyCategories, needLabels, type GrammyCategory } from './grammy';
import { metaKey, type EffectiveMeta } from './metadata';
import type { Item, Kind } from './types';
import { runJury, sanitizeJury, type ItemStats, type JuryResult } from './jury';

/** Indicado guardado como retrato do momento, para a cédula não mudar se o histórico for recalculado. */
export interface Nominee { id: string; kind: Kind | 'manual'; name: string; artist: string; album: string; image: string; plays?: number; basis: string }
export interface BallotEntry { categoryId: string; nominees: Nominee[]; winners: string[]; method: 'vote' | 'suggestion' | 'jury'; updatedAt: number; note?: string; jury?: JuryResult }
export interface Ballot {
  version: 1; edition: typeof GRAMMY_EDITION.id; profile: string; period: string; mode: 'vote' | 'jury';
  /** release: só lançamentos da janela do período (como o Grammy); any: qualquer lançamento. */
  eligibility: 'release' | 'any';
  selected: string[]; favorites: string[]; entries: Record<string, BallotEntry>; updatedAt: number;
}
export const subjectKind = (category: GrammyCategory): Kind | null =>
  category.subject === 'album' ? 'albums' : category.subject === 'artist' ? 'artists' : category.subject === 'recording' || category.subject === 'song' ? 'tracks' : null;

export const defaultSelection = ['record-of-the-year', 'album-of-the-year', 'song-of-the-year', 'best-new-artist', 'best-pop-solo-performance', 'best-rnb-song', 'best-rnb-album'];
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
  const known = (id: unknown): id is string => typeof id === 'string' && grammyById.has(id);
  const entries: Record<string, BallotEntry> = {};
  for (const [id, entry] of Object.entries(value.entries ?? {})) {
    if (!known(id) || !entry || !Array.isArray(entry.nominees)) continue;
    const nominees = entry.nominees.filter(n => n && typeof n.id === 'string' && typeof n.name === 'string').slice(0, 10).map(n => ({
      id: n.id.slice(0, 400), kind: (['tracks', 'albums', 'artists', 'manual'] as const).includes(n.kind) ? n.kind : 'manual', name: n.name.slice(0, 200), artist: String(n.artist ?? '').slice(0, 200), album: String(n.album ?? '').slice(0, 200),
      image: typeof n.image === 'string' && /^https:\/\//.test(n.image) ? n.image : '', plays: Number.isFinite(n.plays) ? n.plays : undefined, basis: String(n.basis ?? 'Escolha pessoal').slice(0, 200),
    }));
    const ids = new Set(nominees.map(n => n.id));
    const jury = entry.method === 'jury' ? sanitizeJury(entry.jury, ids) : undefined;
    entries[id] = { categoryId: id, nominees, winners: jury ? [jury.winner] : (Array.isArray(entry.winners) ? entry.winners : []).filter(w => ids.has(w)).slice(0, 3), method: jury ? 'jury' : entry.method === 'suggestion' ? 'suggestion' : 'vote', updatedAt: Number(entry.updatedAt) || Date.now(), note: typeof entry.note === 'string' ? entry.note.slice(0, 300) : undefined, ...(jury ? { jury } : {}) };
  }
  const unique = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).filter(known))];
  return { ...base, mode: value.mode === 'jury' ? 'jury' : 'vote', eligibility: value.eligibility === 'any' ? 'any' : 'release', selected: unique(value.selected), favorites: unique(value.favorites), entries, updatedAt: Number(value.updatedAt) || Date.now() };
}

export interface Suggestion { nominees: Nominee[]; criterion: string; insufficient?: string; unknown?: number }
/** Janela de elegibilidade: o período escolhido com 4 meses de tolerância antes (a janela do Grammy atravessa anos). */
export interface Eligibility { mode: 'release' | 'any'; start: number; end: number; year: number }
const TOLERANCE = 122 * 86400;
const releasedIn = (date: string | undefined, rules: Eligibility) => { if (!date) return null; const t = Date.parse(`${date}T12:00:00Z`) / 1000; return t >= rules.start - TOLERANCE && t < rules.end; };
/** Artista Revelação (estimativa do catálogo): estreia nos 4 anos até o fim do período e no máximo 3 álbuns completos. */
export function newArtistCheck(record: EffectiveMeta | undefined, rules: Eligibility): { ok: boolean | null; basis: string } {
  if (!record?.firstRelease) return { ok: null, basis: 'Carreira não verificada no catálogo' };
  const year = Number(record.firstRelease.slice(0, 4)), albums = record.albumCount ?? 0;
  const ok = year >= rules.year - 3 && albums <= 3;
  return { ok, basis: `Estreia no catálogo em ${year} · ${albums} ${albums === 1 ? 'álbum' : 'álbuns'}${ok ? '' : year < rules.year - 3 ? ' · carreira longa demais para revelação' : ' · mais de 3 álbuns'}` };
}
/**
 * Sugestões só com critérios do próprio usuário e metadados verificados.
 * Reproduções não comprovam composição, engenharia ou qualidade artística — isso fica explícito no critério.
 */
export function suggestNominees(category: GrammyCategory, pools: Partial<Record<Kind, Item[]>>, meta: Partial<Record<Kind, Map<string, EffectiveMeta>>>, limit = 5, rules?: Eligibility): Suggestion {
  const kind = subjectKind(category);
  if (!kind) return { nominees: [], criterion: 'Escolha pessoal', insufficient: `Esta categoria premia ${category.subject === 'person' ? 'pessoas por créditos de produção/composição' : 'vídeos ou filmes'}, que o histórico de scrobbles não registra. Adicione indicados manualmente.` };
  const sorted = [...(pools[kind] ?? [])].sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name));
  if (category.id === 'best-new-artist') {
    if (!rules) return { nominees: [], criterion: 'Escolha pessoal', insufficient: 'A estreia oficial do artista não é comprovada pela primeira audição no seu perfil. Escolha manualmente os artistas que você considera revelação.' };
    const checked = sorted.slice(0, 60).map(item => ({ item, check: newArtistCheck(meta.artists?.get(metaKey('artists', item)), rules) }));
    const eligible = checked.filter(c => c.check.ok).slice(0, limit), unknown = checked.filter(c => c.check.ok === null).length;
    if (!eligible.length) return { nominees: [], criterion: 'Estreia recente no catálogo', unknown, insufficient: unknown ? `Nenhum artista com estreia recente confirmada; ${unknown} ainda sem carreira verificada. Toque em “Verificar elegibilidade”.` : 'Seus artistas mais ouvidos já têm carreira longa (estreia há mais de 4 anos ou mais de 3 álbuns). Indique manualmente se quiser.' };
    return { nominees: eligible.map(c => ({ id: c.item.id, kind, name: c.item.name, artist: c.item.artist, album: c.item.album, image: c.item.image, plays: c.item.plays, basis: c.check.basis })), criterion: `Artistas com estreia a partir de ${rules.year - 3} e até 3 álbuns completos no catálogo, ordenados pelas suas reproduções (estimativa, não a elegibilidade oficial)`, unknown };
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
/** Categorias que entram na cerimônia: selecionadas, com indicados e vencedor escolhido. */
export function ceremonyReadiness(ballot: Ballot) {
  const ready: string[] = [], issues: ReadinessIssue[] = [];
  for (const id of ballot.selected) {
    const entry = ballot.entries[id];
    if (!grammyById.has(id)) continue;
    if (!entry?.nominees.length) issues.push({ categoryId: id, reason: 'Sem indicados. Aceite sugestões ou adicione manualmente.' });
    else if (!entry.winners.length) issues.push({ categoryId: id, reason: 'Indicados prontos; falta escolher o vencedor.' });
    else ready.push(id);
  }
  return { ready, issues };
}

export interface RevealCard { category: GrammyCategory; nominees: Nominee[]; winners: Nominee[]; method: BallotEntry['method']; criterion?: string; jury?: JuryResult }
/** Congela o resultado antes da revelação: alterações posteriores não mudam o vencedor durante a animação. */
export function freezeCeremony(ballot: Ballot): RevealCard[] {
  return ceremonyReadiness(ballot).ready.map(id => {
    const entry = ballot.entries[id];
    const nominees = entry.nominees.map(n => ({ ...n }));
    return Object.freeze({ category: grammyById.get(id)!, nominees, winners: nominees.filter(n => entry.winners.includes(n.id)), method: entry.method, criterion: entry.note, jury: entry.jury });
  });
}

export const nomineeFromItem = (item: Item, kind: Kind, basis = 'Escolha pessoal no acervo'): Nominee => ({ id: item.id, kind, name: item.name, artist: item.artist, album: item.album, image: item.image, plays: item.plays, basis });
export const manualNominee = (name: string, artist: string): Nominee => ({ id: `manual:${crypto.randomUUID()}`, kind: 'manual', name: name.trim().slice(0, 200), artist: artist.trim().slice(0, 200), album: '', image: '', basis: 'Indicação manual identificada' });

export const categoryOrder = new Map(grammyCategories.map((category, i) => [category.id, i]));

/**
 * Júri automático: para cada categoria selecionada, escolhe até 6 indicados pelas regras de sugestão e
 * deixa os jurados decidirem. Resultado guardado lacrado até a cerimônia; categorias sem dados ficam explicadas.
 */
export function conveneJury(ballot: Ballot, pools: Partial<Record<Kind, Item[]>>, meta: Partial<Record<Kind, Map<string, EffectiveMeta>>>, stats: Partial<Record<Kind, Record<string, ItemStats>>>, now = Date.now(), rules?: Eligibility) {
  const entries = { ...ballot.entries };
  const skipped: Array<{ categoryId: string; reason: string }> = [];
  let decided = 0;
  for (const id of ballot.selected) {
    const category = grammyById.get(id);
    if (!category) continue;
    const suggestion = suggestNominees(category, pools, meta, 6, rules);
    const result = suggestion.nominees.length >= 2 ? runJury(category, suggestion.nominees, stats, meta, now) : null;
    if (!result) { skipped.push({ categoryId: id, reason: suggestion.insufficient ?? 'Menos de dois indicados com dados para o júri comparar.' }); continue; }
    entries[id] = { categoryId: id, nominees: suggestion.nominees, winners: [result.winner], method: 'jury', updatedAt: now, note: suggestion.criterion, jury: result };
    decided++;
  }
  return { ballot: { ...ballot, mode: 'jury' as const, entries, updatedAt: now }, decided, skipped };
}
