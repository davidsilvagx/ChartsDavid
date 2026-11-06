import { authenticated } from '../server/auth.mjs';
import webpush from 'web-push';
import { handlePush, pushStoreFromEnv } from '../server/push.mjs';

const handler = authenticated(async request => handlePush(request, process.env, await pushStoreFromEnv(process.env), webpush));
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
