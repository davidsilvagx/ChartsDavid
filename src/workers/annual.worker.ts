import { annualRecords } from '../lib/annualRecords';
self.onmessage = ({ data }) => { try { self.postMessage({ result: annualRecords(data.cached, data.settings, data.source, data.year) }); } catch (e) { self.postMessage({ error: e instanceof Error ? e.message : String(e) }); } };
