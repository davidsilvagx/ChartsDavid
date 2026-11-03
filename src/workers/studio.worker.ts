import { automaticBarItems } from '../lib/studio';
self.onmessage=({data})=>{
  try { self.postMessage({ids:automaticBarItems(data.charts,data.library,data.count,data.metric).map(item=>item.id)}); }
  catch { self.postMessage({error:'Não foi possível preparar o Top. Tente um intervalo menor.'}); }
};
