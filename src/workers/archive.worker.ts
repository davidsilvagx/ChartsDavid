import { computeArchive, type ArchiveJob } from '../lib/archiveCompute';
self.onmessage=async({data}:{data:{id:number;job:ArchiveJob}})=>{try{self.postMessage({id:data.id,result:await computeArchive(data.job)});}catch(error){self.postMessage({id:data.id,error:error instanceof Error?error.message:'Backup inválido'});}};
