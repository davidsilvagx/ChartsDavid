import { expect,it,vi } from 'vitest';
import { requireAccount,authenticated } from '../../server/auth.mjs';
import { validPassword } from './passwordPolicy';
it('rejects missing, malformed and forged bearer tokens before protected work',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:401}));
 expect((await requireAccount(new Request('https://app/api/sync'),{},fetcher))?.status).toBe(401);
 expect(fetcher).not.toHaveBeenCalled();
 expect((await requireAccount(new Request('https://app/api/sync',{headers:{authorization:'Bearer '+ 'forged.'.repeat(10)}}),{},fetcher))?.status).toBe(401);
 const protectedWork=vi.fn();expect((await authenticated(protectedWork)(new Request('https://app/api/sync'))).status).toBe(401);expect(protectedWork).not.toHaveBeenCalled();
});
it('requires a confirmed registered identity and fails closed on validation outages',async()=>{
 const req=new Request('https://app/api/lastfm',{headers:{authorization:'Bearer '+ 'a'.repeat(30)}});
 for(const user of [{id:'qa'},{id:'qa',email_confirmed_at:'today',is_anonymous:true}])expect((await requireAccount(req,{},async()=>Response.json(user)))?.status).toBe(401);
 expect(await requireAccount(req,{},async()=>Response.json({id:'qa',email_confirmed_at:'today',is_anonymous:false}))).toBeNull();
 expect((await requireAccount(req,{},async()=>{throw Error('offline')}))?.status).toBe(503);
});
it('checks all requested password classes and the UTF-8 byte limit',()=>{
 expect(validPassword('Good-Passphrase42!')).toBe(true);
 for(const value of ['shortA1!','lowercaseonly123!','UPPERCASEONLY123!','NoDigitsHere!!','NoSymbolsHere12','A1!'+ 'é'.repeat(36)])expect(validPassword(value)).toBe(false);
});
