import { supabase } from './supabase';
/** Attach credentials only to this app's API, never to artist media or other origins. */
export function installAuthenticatedFetch(){
  const original=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const url=new URL(input instanceof Request ? input.url : String(input),location.href);
    if(url.origin!==location.origin||!/^\/(api\/|\.netlify\/functions\/)/.test(url.pathname))return original(input,init);
    const {data}=await supabase.auth.getSession();
    if(!data.session)return Response.json({error:'authentication_required',message:'Entre na sua conta.'},{status:401});
    const headers=new Headers(input instanceof Request? input.headers:undefined);
    new Headers(init?.headers).forEach((v,k)=>headers.set(k,v));headers.set('Authorization',`Bearer ${data.session.access_token}`);
    return original(input,{...init,headers,cache:'no-store'});
  };
}
