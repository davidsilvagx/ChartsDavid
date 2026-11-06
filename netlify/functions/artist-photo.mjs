import { authenticated } from '../../server/auth.mjs';
import { handleArtistPhoto } from '../../server/artist-photo.mjs';
export default authenticated(request => request.method === 'GET' ? handleArtistPhoto(request) : new Response('Method not allowed', { status: 405 }));
