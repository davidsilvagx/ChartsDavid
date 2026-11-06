import { authenticated } from '../server/auth.mjs';
import { handleArtistPhoto } from '../server/artist-photo.mjs';
export const GET = authenticated(request => handleArtistPhoto(request));
