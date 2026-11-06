import { authenticated } from '../server/auth.mjs';
import { lastfmProxy } from '../netlify/functions/lastfm.mjs';

export const GET = authenticated(async request => {
  return lastfmProxy(new URL(request.url).search, process.env.LASTFM_API_KEY);
});
