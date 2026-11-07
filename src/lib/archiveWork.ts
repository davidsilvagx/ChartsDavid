import { waitForMediaIdle } from './mediaActivity';
import type { ArchiveJob } from './archiveCompute';
let worker:Worker|undefined,id=0,idle:ReturnType<typeof setTimeout>|undefined;
const pending=new Map<number,{resolve:(result:string)=>void;reject:(error:Error)=>void}>();
function dispose(){worker?.terminate();worker=undefined;clearTimeout(idle);}
export async function archiveWork(job:ArchiveJob):Promise<string>{
 if(typeof Worker==='undefined')return (await import('./archiveCompute')).computeArchive(job);
 clearTimeout(idle);
 if(!worker){
  worker=new Worker(new URL('../workers/archive.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=async({data})=>{await waitForMediaIdle();const task=pending.get(data.id);pending.delete(data.id);if(data.error)task?.reject(Error(data.error));else task?.resolve(data.result);if(!pending.size)idle=setTimeout(dispose,30000);};
  worker.onerror=()=>{for(const task of pending.values())task.reject(Error('Não foi possível preparar o backup. Seus dados locais foram preservados.'));pending.clear();dispose();};
 }
 return new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});try{worker!.postMessage({id:request,job});}catch(error){pending.delete(request);reject(error);}});
}
