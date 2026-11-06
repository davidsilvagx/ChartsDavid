import { authenticated } from '../server/auth.mjs';
import { itunesProxy } from '../netlify/functions/itunes.mjs';

export const GET = authenticated(async request => {
  return itunesProxy(new URL(request.url).search);
});
