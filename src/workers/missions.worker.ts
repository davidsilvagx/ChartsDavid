import { buildMissions } from '../lib/missions';
self.onmessage = ({ data }) => { try { self.postMessage({ missions: buildMissions(data.cached, data.settings, data.source, data.meta) }); } catch (e) { self.postMessage({ error: e instanceof Error ? e.message : String(e) }); } };
