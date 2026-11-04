import webpush from 'web-push';
import { handlePush, pushStoreFromEnv } from '../server/push.mjs';

const handler = async request => handlePush(request, process.env, await pushStoreFromEnv(process.env), webpush);
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
