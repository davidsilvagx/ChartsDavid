import { handleArtistPhoto } from '../server/artist-photo.mjs';
export const GET = request => handleArtistPhoto(request);
