import { requireAccount } from '../../server/auth.mjs';
import { handleArtistPhoto } from '../../server/artist-photo.mjs';
export const onRequestGet = async context => (await requireAccount(context.request,context.env)) ?? handleArtistPhoto(context.request);
