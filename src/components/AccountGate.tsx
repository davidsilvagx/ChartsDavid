import { Disc3, Music2, Headphones, AudioLines, Sparkles, ShieldCheck } from 'lucide-react';
import { AccountPanel } from './AccountPanel';
export function AccountGate(){return <main className="auth-stage">
  <div className="auth-orchestra" aria-hidden="true">{[Disc3,Music2,Headphones,AudioLines,Sparkles,Music2].map((Icon,i)=><span key={i} style={{'--i':i} as React.CSSProperties}><Icon size={i%2 ? 38 : 64} strokeWidth={1}/></span>)}</div>
  <section className="auth-story"><a className="auth-brand" href="/" aria-label="LastChart"><img src="/favicon.svg" width="52" height="52" alt=""/>lastchart</a><span className="auth-eyebrow">SEU GOSTO. SUA ERA. SEU PALCO.</span><h1>Todo fã tem uma história.<br/><em>A sua merece o topo.</em></h1><p>Seus charts, suas conquistas e todas as suas eras musicais, juntos em qualquer tela.</p><div className="auth-vinyl" aria-hidden="true"><Disc3 size={120} strokeWidth={.6}/><span>ON REPEAT · LASTCHART</span></div><small><ShieldCheck size={16}/> Entre para abrir seu backstage privado.</small></section>
  <div className="auth-glass"><AccountPanel/></div>
</main>}
