import { lastfmProxy } from '../../netlify/functions/lastfm.mjs';

export async function onRequestGet(context) {
  return lastfmProxy(new URL(context.request.url).search, context.env.LASTFM_API_KEY);
}
