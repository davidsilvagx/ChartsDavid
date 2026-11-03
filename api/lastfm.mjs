import { lastfmProxy } from '../netlify/functions/lastfm.mjs';

export async function GET(request) {
  return lastfmProxy(new URL(request.url).search, process.env.LASTFM_API_KEY);
}
