import { computeProfile } from '../lib/profile';
self.onmessage = ({ data }) => {
  try { self.postMessage({ result: computeProfile(data.cached, data.options) }); }
  catch { self.postMessage({ error: 'Não foi possível calcular o perfil deste período.' }); }
};
