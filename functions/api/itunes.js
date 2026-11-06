import { authenticated } from '../../server/auth.mjs';
import { itunesProxy } from '../../netlify/functions/itunes.mjs';

export async function onRequestGet(context) {
  return authenticated(request => itunesProxy(new URL(request.url).search))(context.request,context.env);
}
