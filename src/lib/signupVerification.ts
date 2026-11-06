import { verificationClient } from './supabase';
/** Confirmation deliberately uses an isolated, nonpersistent session: login remains a separate step. */
export async function verifySignupEmail(email:string,code:string){
 const isolated=verificationClient();
 try{
  const {data,error}=await isolated.auth.verifyOtp({email:email.trim(),token:code.trim(),type:'signup'});
  if(error)throw error;
  if(!data.user?.email_confirmed_at)throw Error('verification_failed');
  await isolated.auth.signOut({scope:'local'});
 }finally{isolated.auth.stopAutoRefresh();}
}
