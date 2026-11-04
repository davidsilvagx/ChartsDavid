import { handleSync, storeFromEnv } from '../server/sync.mjs';

const handler = request => handleSync(request, storeFromEnv(process.env));
export const GET = handler;
export const PUT = handler;
export const DELETE = handler;
export const HEAD = handler;
