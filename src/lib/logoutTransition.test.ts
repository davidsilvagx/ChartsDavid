import { afterEach, expect, it, vi } from 'vitest';
import { logoutWithTransition } from './logoutTransition';
afterEach(() => vi.useRealTimers());
it('shows the transition before ending only this device session', async () => {
 vi.useFakeTimers();
 const auth={signOut:vi.fn().mockResolvedValue({error:null})};
 const pending=logoutWithTransition(auth);
 await vi.advanceTimersByTimeAsync(449);expect(auth.signOut).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);await pending;
 expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({scope:'local'});
});
it('propagates a failed signout instead of claiming that the session ended', async () => {
 const error=Error('Sem conexão');const auth={signOut:vi.fn().mockResolvedValue({error})};
 await expect(logoutWithTransition(auth,0,async()=>{})).rejects.toBe(error);
});
