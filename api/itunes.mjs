import { itunesProxy } from '../netlify/functions/itunes.mjs';

export async function GET(request) {
  return itunesProxy(new URL(request.url).search);
}
