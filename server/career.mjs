/**
 * Carreira e prêmios oficiais com fontes públicas:
 * - MusicBrainz: identifica o artista (MBID) e o primeiro lançamento/álbuns de estúdio.
 * - Wikidata (SPARQL): vitórias (P166) e indicações (P1411) a prêmios cujo nome oficial em inglês começa com “Grammy”,
 *   do artista e, quando pedido, da obra (álbum/música) com intérprete = esse artista.
 * Correspondência conservadora: nome exato no MusicBrainz e obra com o mesmo título exato.
 */
const UA = 'LastChartStudioPro/1.0 (https://charts-david.vercel.app; github.com/davidsilvagx/ChartsDavid)';
const json = (body, status = 200, cache = true) => Response.json(body, { status, headers: { 'Cache-Control': cache && status === 200 ? 'public, s-maxage=604800, max-age=86400' : 'no-store' } });
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const clean = s => fold(s).replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim();
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

async function mb(path, fetcher) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetcher(`https://musicbrainz.org/ws/2/${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (response.status === 503 || response.status === 429) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
    if (!response.ok) throw new Error(`mb ${response.status}`);
    return response.json();
  }
  throw new Error('rate');
}
async function sparql(query, fetcher) {
  const response = await fetcher(`https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`wdqs ${response.status}`);
  return (await response.json()).results.bindings;
}

/** Escolhe o artista do MusicBrainz só com nome exato (sem acento/caixa); dois exatos = ambíguo. */
export function pickArtist(artists, name) {
  const all = (artists ?? []).filter(a => fold(a.name) === fold(name) || (a.aliases ?? []).some(x => fold(x.name) === fold(name)));
  if (!all.length) return { status: 'not-found' };
  // Cadastros marcados como apelido/projeto paralelo só valem se não houver o principal.
  const isAlias = a => /alias|apelido|pseud/i.test(a.disambiguation ?? '');
  const exact = all.some(a => !isAlias(a)) ? all.filter(a => !isAlias(a)) : all;
  // Preferir o cadastro “principal”: maior score, tipo e país definidos, sem ser apelido de outro projeto.
  const quality = a => (Number(a.score) || 0) * 10 + (a.type ? 3 : 0) + (a.country ? 2 : 0) + (fold(a.name) === fold(name) ? 2 : 0) - (/alias|apelido|pseud/i.test(a.disambiguation ?? '') ? 6 : 0);
  const ranked = [...exact].sort((a, b) => quality(b) - quality(a));
  // Homônimos: dois ou mais cadastros com o mesmo nome exato e score alto não são desempatados no chute.
  const sameName = exact.filter(a => fold(a.name) === fold(name) && Number(a.score) >= 90);
  if (sameName.length > 1 || (ranked[1] && quality(ranked[0]) === quality(ranked[1]) && Number(ranked[0].score) >= 95)) return { status: 'ambiguous', candidates: ranked.slice(0, 3).map(a => ({ id: a.id, name: a.name, disambiguation: a.disambiguation ?? '' })) };
  const best = ranked[0];
  return { status: 'matched', artist: { id: best.id, name: best.name, type: best.type ?? '', country: best.country ?? '', disambiguation: best.disambiguation ?? '', begin: best['life-span']?.begin ?? '' } };
}

export function summarizeReleaseGroups(groups) {
  const dated = (groups ?? []).filter(g => /^\d{4}/.test(g['first-release-date'] ?? ''));
  const first = dated.map(g => g['first-release-date']).sort()[0] ?? '';
  const albums = new Set(dated.filter(g => g['primary-type'] === 'Album' && !(g['secondary-types'] ?? []).length).map(g => clean(g.title))).size;
  return { firstRelease: first, albums };
}

const awardsPart = subject => `
  { ${subject} p:P166 ?st . ?st ps:P166 ?award . BIND("win" AS ?kind) } UNION { ${subject} p:P1411 ?st . ?st ps:P1411 ?award . BIND("nomination" AS ?kind) }
  OPTIONAL { ?st pq:P585 ?date . }
  OPTIONAL { ?award rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?award rdfs:label ?pt . FILTER(LANG(?pt) = "pt-br" || LANG(?pt) = "pt") }`;
/** Prêmios do artista (todos; o filtro “Grammy” é feito depois, pelo nome oficial em inglês). */
export const artistQuery = mbid => `SELECT ?entity ?award ?en ?pt ?date ?kind WHERE { ?entity wdt:P434 "${esc(mbid)}" . ${awardsPart('?entity')} } LIMIT 500`;
/** Prêmios da obra (álbum ou música) cujo intérprete é o artista e cujo título coincide. */
export const workQuery = (mbid, work) => `SELECT ?entity ?award ?en ?pt ?date ?kind WHERE {
  ?artist wdt:P434 "${esc(mbid)}" . ?entity wdt:P175 ?artist ; rdfs:label ?wl .
  FILTER(LCASE(STR(?wl)) = "${esc(fold(work))}" || LCASE(STR(?wl)) = "${esc(clean(work))}")
  ${awardsPart('?entity')} } LIMIT 200`;

export function summarizeGrammys(rows) {
  const seen = new Map();
  let entity = '';
  for (const r of rows) {
    entity ||= r.entity?.value ?? '';
    const en = r.en?.value ?? '';
    if (!/^grammy/i.test(en)) continue;
    const year = Number((r.date?.value ?? '').slice(0, 4)) || null, kind = r.kind?.value;
    const label = (r.pt?.value && !/^Q\d+$/.test(r.pt.value) ? r.pt.value : en).replace(/^Grammy Award (for|de|para)\s*/i, '').replace(/^Prêmio Grammy (de|para)\s*/i, '');
    const key = `${kind}|${r.award?.value}|${year}`;
    if (kind && !seen.has(key)) seen.set(key, { kind, label, year });
  }
  const list = [...seen.values()].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return { entity, wins: list.filter(x => x.kind === 'win'), nominations: list.filter(x => x.kind === 'nomination') };
}

export async function lookupCareer({ artist, work, mbid }, fetcher = fetch) {
  if (mbid) {
    const a = await mb(`artist/${encodeURIComponent(mbid)}?fmt=json`, fetcher);
    return finishCareer({ id: a.id, name: a.name, type: a.type ?? '', country: a.country ?? '', disambiguation: a.disambiguation ?? '', begin: a['life-span']?.begin ?? '' }, work, fetcher, true);
  }
  // 1ª busca pelo nome principal; se só achar apelido (ou nada), 2ª busca incluindo apelidos.
  const q = artist.replace(/"/g, '');
  const first = await mb(`artist?${new URLSearchParams({ query: `artist:"${q}"`, fmt: 'json', limit: '8' })}`, fetcher);
  let picked = pickArtist(first.artists, artist);
  if (picked.status !== 'matched' || /alias|apelido|pseud/i.test(picked.artist.disambiguation)) {
    await new Promise(r => setTimeout(r, 1100));
    const second = await mb(`artist?${new URLSearchParams({ query: `alias:"${q}"`, fmt: 'json', limit: '8' })}`, fetcher).catch(() => ({ artists: [] }));
    const merged = [...(first.artists ?? []), ...(second.artists ?? []).filter(b => !(first.artists ?? []).some(a => a.id === b.id))];
    const retry = pickArtist(merged, artist);
    if (retry.status === 'matched' || picked.status !== 'matched') picked = retry;
  }
  if (picked.status !== 'matched') return { status: picked.status, candidates: picked.candidates ?? [], source: 'MusicBrainz' };
  return finishCareer(picked.artist, work, fetcher, false);
}

async function finishCareer(a, work, fetcher, chosen) {
  await new Promise(r => setTimeout(r, 1100)); // MusicBrainz: no máximo 1 requisição por segundo
  const groups = await mb(`release-group?${new URLSearchParams({ artist: a.id, fmt: 'json', limit: '100' })}`, fetcher).catch(() => ({ 'release-groups': [] }));
  const career = summarizeReleaseGroups(groups['release-groups']);
  let grammys = { entity: '', artist: { wins: [], nominations: [] }, work: null, available: true };
  try {
    const [artistRows, workRows] = await Promise.all([sparql(artistQuery(a.id), fetcher), work ? sparql(workQuery(a.id, work), fetcher) : Promise.resolve([])]);
    const artistAwards = summarizeGrammys(artistRows), workAwards = work ? summarizeGrammys(workRows) : null;
    grammys = { entity: artistAwards.entity, artist: { wins: artistAwards.wins, nominations: artistAwards.nominations }, work: workAwards?.entity ? workAwards : null, available: true };
  } catch { grammys.available = false; /* Wikidata indisponível: segue só com a carreira */ }
  return {
    status: 'matched', checkedAt: Date.now(), chosen,
    artist: { mbid: a.id, name: a.name, type: a.type, country: a.country, disambiguation: a.disambiguation, begin: a.begin },
    career, grammys,
    sources: { musicbrainz: `https://musicbrainz.org/artist/${a.id}`, wikidata: grammys.entity || '' },
  };
}

export async function handleCareer(request, fetcher = fetch) {
  const url = new URL(request.url);
  const artist = (url.searchParams.get('artist') ?? '').trim().slice(0, 200), work = (url.searchParams.get('work') ?? '').trim().slice(0, 200);
  const mbid = url.searchParams.get('mbid') ?? '';
  if (!artist || (mbid && !/^[0-9a-f-]{36}$/.test(mbid))) return json({ status: 'bad-request' }, 400, false);
  try { return json(await lookupCareer({ artist, work: work || undefined, mbid: mbid || undefined }, fetcher)); }
  catch (error) { return json({ status: 'error', message: String(error?.message) === 'rate' ? 'MusicBrainz pediu uma pausa. Tente de novo em instantes.' : 'Fontes de carreira indisponíveis agora.' }, 502, false); }
}
