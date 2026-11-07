import { expect,it,vi } from 'vitest';
import { verifiedSession } from './verifiedSession';
import type { SupabaseClient } from '@supabase/supabase-js';
const createAuth=()=>({getSession:vi.fn().mockResolvedValue({data:{session:{access_token:'real-token',user:{id:'account-a'}}},error:null}),getUser:vi.fn().mockResolvedValue({data:{user:{id:'account-a',email_confirmed_at:'today',is_anonymous:false}},error:null})});
const resolve=(auth:ReturnType<typeof createAuth>)=>verifiedSession(auth as unknown as SupabaseClient['auth']);
it('verifies the current account at the server, never a queued identity',async()=>{const auth=createAuth();expect((await resolve(auth))?.user.id).toBe('account-a');expect(auth.getUser).toHaveBeenCalledWith('real-token');});
it('does not turn a network or validation error into a guest session',async()=>{const auth=createAuth();auth.getUser.mockRejectedValue(TypeError('offline'));await expect(resolve(auth)).rejects.toThrow('offline');auth.getUser.mockResolvedValue({data:{user:null},error:Error('invalid token')});await expect(resolve(auth)).rejects.toThrow('invalid token');});
it('rejects unconfirmed, anonymous or mismatched server identities',async()=>{for(const user of [{id:'account-a'},{id:'account-a',email_confirmed_at:'today',is_anonymous:true},{id:'account-b',email_confirmed_at:'today'}]){const auth=createAuth();auth.getUser.mockResolvedValue({data:{user},error:null});await expect(resolve(auth)).rejects.toThrow();}});
it('allows the guest transition only when the current SDK session is absent',async()=>{const auth=createAuth();auth.getSession.mockResolvedValue({data:{session:null},error:null});expect(await resolve(auth)).toBeNull();expect(auth.getUser).not.toHaveBeenCalled();});
