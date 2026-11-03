import { itunesProxy } from '../../netlify/functions/itunes.mjs';

export async function onRequestGet(context) {
  return itunesProxy(new URL(context.request.url).search);
}
