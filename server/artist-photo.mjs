const normalize = value => value.normalize('NFC').trim().toLowerCase();
/** Exact catalog artist match only: never use album artwork for a performer. */
export async function handleArtistPhoto(request, fetcher = fetch) {
  const name = new URL(request.url).searchParams.get('artist')?.trim();
  if (!name || name.length > 300) return Response.json({ error: 'Artista inválido.' }, { status: 400 });
  try {
    const response = await fetcher(`https://api.deezer.com/search/artist?${new URLSearchParams({ q: name, limit: '10' })}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('catalog');
    const body = await response.json();
    const hit = body.data?.find(a => typeof a.name === 'string' && normalize(a.name) === normalize(name));
    const image = typeof hit?.picture_xl === 'string' && /^https:\/\/(?:cdn-images|cdns-images)\.dzcdn\.net\/images\/artist\//.test(hit.picture_xl) ? hit.picture_xl : '';
    return Response.json({ image, source: image ? 'Deezer · foto do artista no catálogo' : null }, { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800' } });
  } catch { return Response.json({ image: '', error: 'Foto temporariamente indisponível.' }, { status: 502 }); }
}
