export async function itunesProxy(search) {
  const incoming = new URLSearchParams(search);
  const term = (incoming.get('term') ?? '').trim().slice(0, 200);
  const requested = incoming.get('entity');
  const entity = requested === 'album' || requested === 'musicArtist' ? requested : 'song';
  if (!term) {
    return Response.json({ results: [] }, { status: 400 });
  }
  const params = new URLSearchParams({
    term,
    media: 'music',
    entity,
    limit: '8',
    country: 'BR',
  });
  try {
    const response = await fetch(`https://itunes.apple.com/search?${params}`, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'LastChartStudioPro/1.0 (github.com/davidsilvagx/ChartsDavid)' },
    });
    if (!response.ok) {
      return Response.json({ results: [] }, { status: 502 });
    }
    const data = await response.json();
    const results = Array.isArray(data?.results)
      ? data.results.map((r) => ({
          artistName: String(r.artistName ?? ''),
          trackName: String(r.trackName ?? ''),
          collectionName: String(r.collectionName ?? ''),
          artworkUrl: typeof r.artworkUrl100 === 'string'
            ? r.artworkUrl100.replace(/\/100x100bb\./, '/600x600bb.')
            : '',
          previewUrl: typeof r.previewUrl === 'string' && r.previewUrl.startsWith('https://')
            ? r.previewUrl
            : '',
          trackViewUrl: typeof r.trackViewUrl === 'string' ? r.trackViewUrl : (typeof r.collectionViewUrl === 'string' ? r.collectionViewUrl : (typeof r.artistLinkUrl === 'string' ? r.artistLinkUrl : '')),
          trackId: Number.isSafeInteger(r.trackId) ? r.trackId : undefined,
          collectionId: Number.isSafeInteger(r.collectionId) ? r.collectionId : undefined,
          artistId: Number.isSafeInteger(r.artistId) ? r.artistId : undefined,
          trackTimeMillis: Number.isFinite(r.trackTimeMillis) && r.trackTimeMillis > 0 ? r.trackTimeMillis : undefined,
          primaryGenreName: typeof r.primaryGenreName === 'string' ? r.primaryGenreName.slice(0, 80) : '',
          releaseDate: typeof r.releaseDate === 'string' ? r.releaseDate.slice(0, 25) : '',
          collectionType: typeof r.collectionType === 'string' ? r.collectionType.slice(0, 40) : '',
          trackCount: Number.isSafeInteger(r.trackCount) ? r.trackCount : undefined,
          explicit: r.trackExplicitness === 'explicit' || r.collectionExplicitness === 'explicit',
        }))
      : [];
    return Response.json(
      { results },
      { headers: { 'Cache-Control': 'public, max-age=86400' } },
    );
  } catch {
    return Response.json({ results: [] }, { status: 502 });
  }
}

export default async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  return itunesProxy(new URL(request.url).search);
};
