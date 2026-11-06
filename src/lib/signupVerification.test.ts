import {expect,it,vi} from 'vitest';
const isolated=vi.hoisted(()=>({auth:{verifyOtp:vi.fn(),signOut:vi.fn(),stopAutoRefresh:vi.fn()}}));
vi.mock('./supabase',()=>({verificationClient:()=>isolated}));
import {verifySignupEmail} from './signupVerification';
it('confirms the signup and closes only the isolated session without returning a login token',async()=>{
 isolated.auth.verifyOtp.mockResolvedValue({data:{user:{email_confirmed_at:'today'}},error:null});
 expect(await verifySignupEmail(' fan@example.test ',' 12345678 ')).toBeUndefined();
 expect(isolated.auth.verifyOtp).toHaveBeenLastCalledWith({email:'fan@example.test',token:'12345678',type:'signup'});
 expect(isolated.auth.signOut).toHaveBeenLastCalledWith({scope:'local'});expect(isolated.auth.stopAutoRefresh).toHaveBeenCalled();
});
it('rejects invalid or unconfirmed responses, never treating them as success',async()=>{
 isolated.auth.verifyOtp.mockResolvedValue({data:{user:{}},error:null});await expect(verifySignupEmail('fan@example.test','00000000')).rejects.toThrow('verification_failed');
 isolated.auth.verifyOtp.mockResolvedValue({data:{},error:Error('expired')});await expect(verifySignupEmail('fan@example.test','00000000')).rejects.toThrow('expired');
});
