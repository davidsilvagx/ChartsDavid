import { handleArtistPhoto } from '../../server/artist-photo.mjs';
export const onRequestGet = context => handleArtistPhoto(context.request);
