import { Disc3, Music2, Headphones, AudioLines, Sparkles, ShieldCheck, UserRound } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { AuthForm } from './AuthForm';
import { readLoginAppearance } from '../lib/loginAppearance';
import type { Profile } from '../lib/types';
const LoginAvatar=lazy(()=>import('./Avatars').then(m=>({default:m.ProfileAvatar})));
import { setChromeBase } from '../lib/chrome';
export function AccountGate(){const [step,setStep]=useState("login"),[appearance]=useState(()=>readLoginAppearance());useEffect(()=>{const root=document.documentElement,previous=root.dataset.theme,body=document.body.style.backgroundColor;root.dataset.theme='dark';root.dataset.auth='true';document.body.style.backgroundColor='#0d141c';setChromeBase('#0d141c');return()=>{delete root.dataset.auth;if(previous)root.dataset.theme=previous;else delete root.dataset.theme;document.body.style.backgroundColor=body;};},[]);return <main className={`auth-stage auth-view-${step}`}>
  <div className="auth-orchestra" aria-hidden="true">{[Disc3,Music2,Headphones,AudioLines,Sparkles,Music2].map((Icon,i)=><span key={i} style={{'--i':i} as React.CSSProperties}><Icon size={i%2 ? 38 : 64} strokeWidth={1}/></span>)}</div>
  <section className="auth-story"><a className="auth-brand" href="/" aria-label="LastChart"><img src="/favicon.svg" width="52" height="52" alt=""/>lastchart</a><span className="auth-eyebrow">SEU GOSTO. SUA ERA. SEU PALCO.</span><h1>Todo fã tem uma história.<br/><em>A sua merece o topo.</em></h1><p>Seus charts, suas conquistas e todas as suas eras musicais, juntos em qualquer tela.</p><div className="auth-vinyl" aria-hidden="true"><Disc3 size={120} strokeWidth={.6}/><span>ON REPEAT · LASTCHART</span></div><small><ShieldCheck size={16}/> Entre para abrir seu backstage privado.</small></section>
  <section className="auth-portal" aria-label="Sua entrada no LastChart">
   <a className="auth-mobile-brand" href="/" aria-label="LastChart"><img src="/favicon.svg" alt="" width="44" height="44"/><span>lastchart</span></a>
   <div className="auth-glass"><header className="auth-identity">
    {appearance?<Suspense fallback={<div className="auth-avatar"><Disc3 size={40}/></div>}><LoginAvatar className="avatar auth-avatar" avatar={appearance.avatar} profile={{image:appearance.image} as Profile}/></Suspense>:<div className="auth-avatar" aria-hidden="true"><UserRound size={34} strokeWidth={1.5}/><Headphones size={54} strokeWidth={1}/></div>}
    <p>{appearance?'Sua próxima era começa aqui.':'Sua música merece o centro do palco.'}</p>
   </header><AuthForm onStep={setStep}/></div>
  </section>
</main>}
