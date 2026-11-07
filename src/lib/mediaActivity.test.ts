import { expect,it } from 'vitest';
import { mediaIsBusy,setMediaBusy,waitForMediaIdle } from './mediaActivity';
it('keeps backup continuations queued until every active media operation finishes',async()=>{setMediaBusy('preview',true);setMediaBusy('record',true);let resumed=false;const idle=waitForMediaIdle().then(()=>{resumed=true;});await Promise.resolve();expect(resumed).toBe(false);setMediaBusy('preview',false);expect(mediaIsBusy()).toBe(true);setMediaBusy('record',false);await idle;expect(resumed).toBe(true);expect(mediaIsBusy()).toBe(false);});
