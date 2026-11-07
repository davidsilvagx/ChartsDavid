import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, Mail, ShieldCheck, KeyRound, Check, Circle } from 'lucide-react';
import { supabase, accountError, authRedirect } from '../lib/supabase';
import { verifySignupEmail } from '../lib/signupVerification';
import { passwordRules, validPassword } from '../lib/passwordPolicy';
import { useAccount } from './AccountProvider';
import { DEMO_USER } from '../lib/types';
import { AppVersion } from './AppVersion';
import { AccountLoading } from './AccountLoading';
type Step='login'|'email'|'password'|'verify'|'confirmed'|'reset'|'recovery';
export function AuthForm({onStep}:{onStep:(step:string)=>void}){
 const heading=useRef<HTMLHeadingElement>(null),transitionTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const [changing,setChanging]=useState(false);
 useEffect(()=>()=>clearTimeout(transitionTimer.current),[]);
 const account=useAccount(),[step,setStep]=useState<Step>(account.recovery?'recovery':'login');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[code,setCode]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[cooldown,setCooldown]=useState(0);
 const [carry,setCarry]=useState(()=>{try{const p=JSON.parse(localStorage.getItem('lastchart-studio:settings:v1')??'{}');return Boolean(p.user&&(p.user.toLowerCase()!==DEMO_USER.toLowerCase()||localStorage.getItem('lastchart-studio:custom-user:v1')==='1'));}catch{return false;}});
 useEffect(()=>{onStep(step);heading.current?.focus({preventScroll:true});},[step,onStep]);
 useEffect(()=>{if(account.recovery)setStep('recovery');},[account.recovery]);
 useEffect(()=>{if(!cooldown)return;const id=setTimeout(()=>setCooldown(c=>c-1),1000);return()=>clearTimeout(id);},[cooldown]);
 const go=(next:Step)=>{setError('');setNotice('');setChanging(true);clearTimeout(transitionTimer.current);transitionTimer.current=setTimeout(()=>{setStep(next);setChanging(false);},160);};
 const submit=async(e:FormEvent)=>{
  e.preventDefault();if(busy||changing)return;setError('');setNotice('');
  if(step==='email'){go('password');return;}
  if(step==='password'||step==='recovery'){
   if(new TextEncoder().encode(password).length>72){setError('Essa senha ficou longa demais. Use uma mais curta.');return;}
   if(!validPassword(password)){setError('Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.');return;}
   if(password!==confirm){setError('As senhas precisam ser iguais.');return;}
  }
  setBusy(true);
  try{
   if(step==='login'){
    account.prepareLogin(carry,email);sessionStorage.setItem('lastchart-account:entering','1');
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error){sessionStorage.removeItem('lastchart-account:entering');throw error;}setPassword('');
   }else if(step==='password'){
    account.prepareLogin(carry,email);
    const {error}=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:authRedirect()}});if(error)throw error;
    setPassword('');setConfirm('');setCode('');setCooldown(60);go('verify');
   }else if(step==='verify'){
    await verifySignupEmail(email,code);setCode('');go('confirmed');
   }else if(step==='reset'){
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:authRedirect()});if(error)throw error;setNotice('Se esse e-mail tiver conta, o link vai chegar por lá. Abra-o neste mesmo navegador.');
   }else if(step==='recovery'){
    const {error}=await supabase.auth.updateUser({password});if(error)throw error;setPassword('');setConfirm('');sessionStorage.removeItem('lastchart-account:recovery');await account.signOut();account.finishRecovery();go('login');setNotice('Senha atualizada. Entre para voltar ao seu palco.');
   }
  }catch(err){if(step==='login'&&(err as {code?:string}).code==='email_not_confirmed'){setPassword('');setCode('');go('verify');setNotice('Confirme seu e-mail para entrar. Use o código recebido ou peça outro.');}else setError(step==='verify'?'Código inválido ou expirado. Confira o e-mail ou peça outro código.':accountError(err));}finally{setBusy(false);}
 };
 const resend=async()=>{if(cooldown||busy)return;setBusy(true);setError('');try{const {error}=await supabase.auth.resend({type:'signup',email:email.trim()});if(error)throw error;setCooldown(60);setNotice('Novo código solicitado. Confira também o spam.');}catch(err){setError(accountError(err));}finally{setBusy(false);}};
 const signup=['email','password','verify','confirmed'].includes(step);
 const title={login:'Seu backstage começa aqui',email:'Vamos criar sua conta',password:'Uma senha só sua',verify:'Confirme seu e-mail',confirmed:'Seu e-mail está confirmado!',reset:'Recupere seu acesso',recovery:'Nova senha, mesma era'}[step];
 return <section className={`auth-form-panel ${changing?'transitioning':''}`} aria-label="Acesso LastChart" aria-busy={busy} data-signup={signup}>
  <div className="auth-progress" aria-label={signup?'Etapas do cadastro':'Acesso seguro'}>{(signup?['E-mail','Senha','Confirmação']:['Seu backstage']).map((label,i)=><span key={label} className={!signup||i<=(step==='email'?0:step==='password'?1:2)?'active':''}>{label}</span>)}</div>
  <div className="auth-step" key={step}>
   <h2 tabIndex={-1} ref={heading}>{title}</h2>
   <p className="auth-step-copy">{step==='login'?'Entre para continuar sua história musical.':step==='email'?'O primeiro passo para levar suas eras a qualquer tela.':step==='password'?email:step==='verify'?`Enviamos um código para ${email}. Confira também o spam.`:step==='confirmed'?'Agora é só entrar com seu e-mail e senha.':step==='reset'?'Vamos mandar um link para o seu e-mail.':'Escolha uma senha nova para a sua conta.'}</p>
   {step==='confirmed'?<div className="auth-confirmed"><BadgeCheck size={56}/><button className="button primary" onClick={()=>go('login')}>Voltar para a tela de login <ArrowRight size={17}/></button></div>:<form className="account-form" onSubmit={e=>void submit(e)}>
    {['login','email','reset'].includes(step)&&<label><span><Mail size={14}/> E-mail</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy||changing}/></label>}
    {['login','password','recovery'].includes(step)&&<label><span><KeyRound size={14}/>{step==='recovery'?'Nova senha':'Senha'}</span><input type="password" autoComplete={step==='login'?'current-password':'new-password'} required minLength={step==='login'?1:12} maxLength={72} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy||changing}/></label>}
    {['password','recovery'].includes(step)&&<><label><span><KeyRound size={14}/>Repita a senha</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy||changing}/></label><ul className="password-rules compact-rules" aria-label="Requisitos da senha">{passwordRules(password).slice(0,5).map(rule=><li key={rule.label} className={rule.met?'met':''}>{rule.met?<Check size={12}/>:<Circle size={10}/>}<span>{rule.label}</span></li>)}</ul></>}
    {step==='verify'&&<label><span>Código do e-mail</span><input className="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required maxLength={8} placeholder="00000000" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} disabled={busy||changing}/></label>}
    {['login','email'].includes(step)&&<label className="account-carry"><input type="checkbox" checked={carry} onChange={e=>setCarry(e.target.checked)} disabled={busy||changing}/><span>Levar meus dados deste aparelho para a conta.</span></label>}
    <button className="button primary" type="submit" disabled={busy||changing}>{busy?'Afinando os últimos detalhes…':({login:'Entrar no meu backstage',email:'Continuar',password:'Criar minha conta',verify:'Confirmar meu e-mail',reset:'Enviar link',recovery:'Salvar nova senha'} as Record<string,string>)[step]}{!busy&&<ArrowRight size={17}/>}</button>
   </form>}
   {error&&<p className="error-text" role="alert">{error}</p>}{notice&&<p role="status" className="auth-notice">{notice}</p>}
   <div className="auth-links">
    {step==='login'?<><button type="button" onClick={()=>go('email')} disabled={busy||changing}>Criar conta</button><button type="button" onClick={()=>go('reset')} disabled={busy||changing}>Esqueci minha senha</button></>:step!=='confirmed'&&<button type="button" onClick={()=>go(step==='password'?'email':'login')} disabled={busy||changing}><ArrowLeft size={14}/>{step==='password'?'Trocar e-mail':'Voltar para login'}</button>}
    {step==='verify'&&<button type="button" onClick={()=>void resend()} disabled={busy||cooldown>0}>{cooldown?`Reenviar em ${cooldown}s`:'Reenviar código'}</button>}
   </div>
  </div>
  <p className="auth-safe-note"><ShieldCheck size={14}/> Seu e-mail precisa ser confirmado para entrar.</p>
  <AppVersion/>
  {busy&&<div className="auth-busy"><AccountLoading message="Só mais um compasso…"/></div>}
 </section>;
}
