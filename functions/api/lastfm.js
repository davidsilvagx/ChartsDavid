import { authenticated } from '../../server/auth.mjs';
import { lastfmProxy } from '../../netlify/functions/lastfm.mjs';

export async function onRequestGet(context) {
  return authenticated(request => lastfmProxy(new URL(request.url).search, context.env.LASTFM_API_KEY))(context.request,context.env);
}
