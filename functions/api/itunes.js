import { requireAccount } from '../../server/auth.mjs';
import { itunesProxy } from '../../netlify/functions/itunes.mjs';

export async function onRequestGet(context) {
  const failure=await requireAccount(context.request,context.env);if(failure)return failure;
  return itunesProxy(new URL(context.request.url).search);
}
