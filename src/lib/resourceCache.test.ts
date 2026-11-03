import { expect, it, vi } from 'vitest';
import { ResourceCache } from './resourceCache';
it('limita recursos e libera capas antigas, preservando as recentemente usadas',()=>{
  const dispose=vi.fn();const cache=new ResourceCache<object>(2,dispose);
  const a={},b={},c={},replacement={};
  cache.set('a',a);cache.set('b',b);expect(cache.get('a')).toBe(a);
  cache.set('c',c);expect(cache.size).toBe(2);expect(cache.get('b')).toBeUndefined();expect(dispose).toHaveBeenCalledWith(b);
  cache.set('a',replacement);expect(dispose).toHaveBeenCalledWith(a);expect(cache.get('a')).toBe(replacement);
  cache.set('a',replacement);expect(dispose).toHaveBeenCalledTimes(2);
});
