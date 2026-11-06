import { requireAccount } from '../../server/auth.mjs';
import { lastfmProxy } from '../../netlify/functions/lastfm.mjs';

export async function onRequestGet(context) {
  const failure=await requireAccount(context.request,context.env);if(failure)return failure;
  return lastfmProxy(new URL(context.request.url).search, context.env.LASTFM_API_KEY);
}
