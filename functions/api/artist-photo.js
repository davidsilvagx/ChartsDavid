import { authenticated } from '../../server/auth.mjs';
import { handleArtistPhoto } from '../../server/artist-photo.mjs';
export const onRequestGet = context => authenticated(handleArtistPhoto)(context.request,context.env);
