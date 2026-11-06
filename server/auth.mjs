const URL_DEFAULT='https://qyzelexnjoquhrlcelvz.supabase.co';
const KEY_DEFAULT='sb_publishable_nmcr3oTT40jamGIeP9Vgvw_RP4CaNEB';
export async function requireAccount(request,env={},fetcher=fetch){
  const authorization=request.headers.get('authorization')??'';
  if(!/^Bearer [A-Za-z0-9_.-]{20,8192}$/.test(authorization))return denied(401);
  try{
    const result=await fetcher(`${env.SUPABASE_URL||env.VITE_SUPABASE_URL||URL_DEFAULT}/auth/v1/user`,{headers:{authorization,apikey:env.SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY||KEY_DEFAULT},signal:AbortSignal.timeout(8000),cache:'no-store'});
    if(!result.ok)return denied(result.status>=500?503:401);
    const user=await result.json();
    if(!user.id||!user.email_confirmed_at||user.is_anonymous)return denied(401);
    return null;
  }catch{return denied(503);}
}
const denied=status=>Response.json({error:'authentication_required',message:status===401?'Entre na sua conta para continuar.':'Não foi possível validar sua sessão. Tente novamente.'},{status,headers:{'Cache-Control':'private, no-store'}});
export const authenticated=handler=>async(request,env=process.env)=>{
  const failure=await requireAccount(request,env);if(failure)return failure;
  const response=await handler(request);
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Authorization');return response;
};
