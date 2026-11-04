import webpush from 'web-push';
import { handlePush, pushStoreFromEnv } from '../server/push.mjs';

/** Chamado pelo Cron do Vercel (Authorization: Bearer CRON_SECRET). */
export const GET = async request => handlePush(request, process.env, await pushStoreFromEnv(process.env), webpush);
