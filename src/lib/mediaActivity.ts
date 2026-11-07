// Backups remain queued while animation/recording owns the main thread.
const active=new Set<string>();
const waiting=new Set<()=>void>();
export const mediaIsBusy=()=>active.size>0;
export function setMediaBusy(source:string,busy:boolean){
 if(busy)active.add(source);else active.delete(source);
 if(!active.size){for(const resume of waiting)resume();waiting.clear();}
}
export function waitForMediaIdle():Promise<void>{return active.size?new Promise(resolve=>waiting.add(resolve)):Promise.resolve();}
