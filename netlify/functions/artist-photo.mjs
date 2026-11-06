import { handleArtistPhoto } from '../../server/artist-photo.mjs';
export default request => request.method === 'GET' ? handleArtistPhoto(request) : new Response('Method not allowed', { status: 405 });
