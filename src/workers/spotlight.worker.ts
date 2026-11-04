import { buildSpotlight } from '../lib/spotlight';
self.onmessage=({data})=>{try{self.postMessage({result:buildSpotlight(data.charts,data.library)});}catch{self.postMessage({error:'Não foi possível preparar o Spotlight. Tente um ano menor.'});}};
