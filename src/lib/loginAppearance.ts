import type { Profile } from './types';
export const LOGIN_APPEARANCE='lastchart-login:appearance:v1';
export interface LoginAppearance { avatar:string; image:string }
export function readLoginAppearance(storage:Pick<Storage,'getItem'>=localStorage):LoginAppearance|null {
 try{const value=JSON.parse(storage.getItem(LOGIN_APPEARANCE)??'null');if(!value||typeof value.avatar!=='string'||!/^[-\w]{1,40}$/.test(value.avatar))return null;return {avatar:value.avatar,image:typeof value.image==='string'&&/^https:\/\//.test(value.image)?value.image:''};}catch{return null;}
}
export function rememberLoginAppearance(avatar:string|undefined,profile:Profile|null,storage:Pick<Storage,'setItem'>=localStorage){
 if(!avatar&&!profile?.image)return;
 try{storage.setItem(LOGIN_APPEARANCE,JSON.stringify({avatar:avatar||'lastfm',image:profile?.image&&/^https:\/\//.test(profile.image)?profile.image:''}));}catch{/* Appearance is optional and never grants access. */}
}
