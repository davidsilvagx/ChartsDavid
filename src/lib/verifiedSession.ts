import type { Session, SupabaseClient } from '@supabase/supabase-js';
/** A connection error is not a sign-out and must not change the shared workspace. */
export async function verifiedSession(auth:Pick<SupabaseClient['auth'],'getSession'|'getUser'>):Promise<Session|null>{
 const {data,error}=await auth.getSession();
 if(error)throw error;
 const session=data.session;
 if(!session)return null;
 const result=await auth.getUser(session.access_token);
 if(result.error)throw result.error;
 if(!result.data.user?.email_confirmed_at||result.data.user.is_anonymous||result.data.user.id!==session.user.id)throw Error('Confirme sua conta para entrar.');
 return session;
}
