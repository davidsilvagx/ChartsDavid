import { GRAMMY_EDITION, genreGroupsOf, grammyById, grammyCategories, needLabels, type GrammyCategory } from './grammy';
import { metaKey, type EffectiveMeta } from './metadata';
import type { Item, Kind } from './types';

/** Indicado guardado como retrato do momento, para a cédula não mudar se o histórico for recalculado. */
export interface Nominee { id: string; kind: Kind | 'manual'; name: string; artist: string; album: string; image: string; plays?: number; basis: string }
export interface BallotEntry { categoryId: string; nominees: Nominee[]; winners: string[]; method: 'vote' | 'suggestion'; updatedAt: number; note?: string }
export interface Ballot {
  version: 1; edition: typeof GRAMMY_EDITION.id; profile: string; period: string;
  selected: string[]; favorites: string[]; entries: Record<string, BallotEntry>; updatedAt: number;
}
export const subjectKind = (category: GrammyCategory): Kind | null =>
  category.subject === 'album' ? 'albums' : category.subject === 'artist' ? 'artists' : category.subject === 'recording' || category.subject === 'song' ? 'tracks' : null;

export const defaultSelection = ['record-of-the-year', 'album-of-the-year', 'song-of-the-year', 'best-new-artist', 'best-pop-solo-performance', 'best-rnb-song', 'best-rnb-album'];
export function emptyBallot(profile: string, period: string): Ballot {
  return { version: 1, edition: GRAMMY_EDITION.id, profile, period, selected: [...defaultSelection], favorites: [], entries: {}, updatedAt: Date.now() };
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
    entries[id] = { categoryId: id, nominees, winners: (Array.isArray(entry.winners) ? entry.winners : []).filter(w => ids.has(w)).slice(0, 3), method: entry.method === 'suggestion' ? 'suggestion' : 'vote', updatedAt: Number(entry.updatedAt) || Date.now(), note: typeof entry.note === 'string' ? entry.note.slice(0, 300) : undefined };
  }
  const unique = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).filter(known))];
  return { ...base, selected: unique(value.selected), favorites: unique(value.favorites), entries, updatedAt: Number(value.updatedAt) || Date.now() };
}

export interface Suggestion { nominees: Nominee[]; criterion: string; insufficient?: string }
/**
 * Sugestões só com critérios do próprio usuário e metadados verificados.
 * Reproduções não comprovam composição, engenharia ou qualidade artística — isso fica explícito no critério.
 */
export function suggestNominees(category: GrammyCategory, pools: Partial<Record<Kind, Item[]>>, meta: Partial<Record<Kind, Map<string, EffectiveMeta>>>, limit = 5): Suggestion {
  const kind = subjectKind(category);
  if (!kind) return { nominees: [], criterion: 'Escolha pessoal', insufficient: `Esta categoria premia ${category.subject === 'person' ? 'pessoas por créditos de produção/composição' : 'vídeos ou filmes'}, que o histórico de scrobbles não registra. Adicione indicados manualmente.` };
  if (category.id === 'best-new-artist') return { nominees: [], criterion: 'Escolha pessoal', insufficient: 'A estreia oficial do artista não é comprovada pela primeira audição no seu perfil. Escolha manualmente os artistas que você considera revelação.' };
  const pool = [...(pools[kind] ?? [])].sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name));
  if (!pool.length) return { nominees: [], criterion: 'Reproduções no período', insufficient: 'Não há itens deste tipo no período escolhido. Sincronize o período ou mude a época.' };
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
    return { nominees: pool.slice(0, limit).map(item => snapshot(item, 'Mais reproduções no período')), criterion: `Mais reproduções verificadas no período (critério pessoal, não oficial)${note}` };
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

export interface RevealCard { category: GrammyCategory; nominees: Nominee[]; winners: Nominee[]; method: BallotEntry['method']; criterion?: string }
/** Congela o resultado antes da revelação: alterações posteriores não mudam o vencedor durante a animação. */
export function freezeCeremony(ballot: Ballot): RevealCard[] {
  return ceremonyReadiness(ballot).ready.map(id => {
    const entry = ballot.entries[id];
    const nominees = entry.nominees.map(n => ({ ...n }));
    return Object.freeze({ category: grammyById.get(id)!, nominees, winners: nominees.filter(n => entry.winners.includes(n.id)), method: entry.method, criterion: entry.note });
  });
}

export const nomineeFromItem = (item: Item, kind: Kind, basis = 'Escolha pessoal no acervo'): Nominee => ({ id: item.id, kind, name: item.name, artist: item.artist, album: item.album, image: item.image, plays: item.plays, basis });
export const manualNominee = (name: string, artist: string): Nominee => ({ id: `manual:${crypto.randomUUID()}`, kind: 'manual', name: name.trim().slice(0, 200), artist: artist.trim().slice(0, 200), album: '', image: '', basis: 'Indicação manual identificada' });

export const categoryOrder = new Map(grammyCategories.map((category, i) => [category.id, i]));
