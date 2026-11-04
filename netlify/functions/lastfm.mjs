const allowed = new Map(
  ['user.getInfo', 'user.getRecentTracks', 'user.getWeeklyChartList', 'user.getTopTracks', 'user.getTopAlbums', 'artist.getInfo', 'artist.getTopTracks', 'artist.getTopAlbums', 'album.getInfo', 'track.getInfo'].map(
    m => [m.toLowerCase(), m],
  ),
);
const parameters = new Set(['user', 'artist', 'album', 'track', 'page', 'limit', 'from', 'to', 'period']);
export async function lastfmProxy(search, apiKey) {
  if (!apiKey) return Response.json({ error: 10, message: 'Configure LASTFM_API_KEY no servidor (Vercel/Netlify) ou informe sua chave nos Ajustes.' }, { status: 503 });
  const incoming = new URLSearchParams(search);
  const rawMethod = incoming.get('method') || '';
  const method = allowed.get(rawMethod.toLowerCase());
  if (!method) return Response.json({ error: 3, message: 'Método não permitido.' }, { status: 400 });
  const params = new URLSearchParams({ method, api_key: apiKey, format: 'json' });
  for (const [key, value] of incoming) if (parameters.has(key) && value.length <= 300) params.set(key, value);
  try {
    const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, {
      signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'LastChartStudioPro/1.0 (github.com/davidsilvagx/ChartsDavid)' },
    });
    const body = await response.text();
    try { JSON.parse(body); } catch { return Response.json({ error: 11, message: 'Last.fm retornou uma resposta inválida.' }, { status: 502 }); }
    return new Response(body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 11, message: 'Last.fm indisponível. Tente novamente.' }, { status: 502 }); }
}
export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  return lastfmProxy(new URL(request.url).search, process.env.LASTFM_API_KEY);
};
