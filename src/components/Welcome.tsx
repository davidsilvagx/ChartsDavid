import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ExternalLink, Link2, Music2, Share2, UserRound } from 'lucide-react';
import { ApiError, getProfile } from '../lib/api';
import type { Profile, Settings } from '../lib/types';
import { Modal, MusicLoader, number } from './UI';
import { shareInvite } from '../lib/invite';

/** Mini-tutorial para qualquer pessoa usar o app com o próprio Last.fm. Nada é enviado a outros usuários. */
export function Welcome({ settings, onUse, onClose, onNotice, onError }: { settings: Settings; onUse: (profile: Profile) => void; onClose: () => void; onNotice: (s: string) => void; onError: (s: string) => void }) {
  const [step, setStep] = useState(0), [name, setName] = useState(''), [checking, setChecking] = useState(false), [found, setFound] = useState<Profile | null>(null), [error, setError] = useState('');
  const steps = ['Boas-vindas', 'Conta Last.fm', 'Conectar o player', 'Seu perfil'];
  const verify = async () => {
    const user = name.trim(); setError(''); setFound(null);
    if (!/^[\w.-]{2,100}$/.test(user)) { setError('Digite o nome de usuário do Last.fm (sem espaços).'); return; }
    setChecking(true);
    try { setFound(await getProfile({ user, apiKey: settings.apiKey })); }
    catch (e) { setError(e instanceof ApiError && e.code === 6 ? 'Usuário não encontrado no Last.fm. Confira a grafia.' : e instanceof Error ? e.message : 'Não foi possível verificar agora.'); }
    finally { setChecking(false); }
  };
  return <Modal title="Use o LastChart com a sua música" subtitle={`Passo ${step + 1} de ${steps.length} · ${steps[step]}`} onClose={onClose} className="welcome-dialog">
    <div className="welcome">
      <ol className="welcome-progress" aria-hidden="true">{steps.map((s, i) => <li key={s} className={i <= step ? 'on' : ''} />)}</ol>
      <div className="welcome-slide" key={step}>
        {step === 0 && <>
          <img className="welcome-logo" src="/favicon.svg" alt="" width="88" height="88" />
          <h3>Seus charts, prêmios e perfil musical</h3>
          <p>O LastChart transforma o seu histórico do <strong>Last.fm</strong> em paradas semanais, vídeos animados, premiação com júri, perfil musical e signo. Cada pessoa usa o próprio perfil e os dados ficam no aparelho dela.</p>
          <ul className="welcome-points"><li><Check size={15} /> Grátis e sem senha: só o nome de usuário público</li><li><Check size={15} /> Funciona no celular, tablet e computador</li><li><Check size={15} /> Você pode voltar ao perfil de exemplo quando quiser</li></ul>
        </>}
        {step === 1 && <>
          <span className="welcome-icon"><UserRound size={30} /></span>
          <h3>Tenha uma conta no Last.fm</h3>
          <p>O Last.fm registra cada música que você ouve (o “scrobble”). É dele que o LastChart lê o seu histórico.</p>
          <a className="button" href="https://www.last.fm/join" target="_blank" rel="noreferrer"><span>Criar conta grátis no Last.fm</span><ExternalLink size={15} /></a>
          <small>Já tem conta? Toque em Próximo.</small>
        </>}
        {step === 2 && <>
          <span className="welcome-icon"><Link2 size={30} /></span>
          <h3>Conecte o seu player ao Last.fm</h3>
          <ol className="welcome-how">
            <li><strong>Spotify:</strong> no Last.fm, abra <em>Configurações › Aplicativos</em> e conecte o Spotify. Daí em diante, cada música entra sozinha.</li>
            <li><strong>Outros players:</strong> use um app ou extensão de scrobbling compatível com o seu serviço (por exemplo, extensões de navegador como o Web Scrobbler).</li>
            <li><strong>Histórico antigo:</strong> depois, em <em>Spotify & YT Music</em>, você pode importar os arquivos de histórico desses serviços.</li>
          </ol>
          <a className="button small" href="https://www.last.fm/settings/applications" target="_blank" rel="noreferrer"><span>Abrir aplicativos do Last.fm</span><ExternalLink size={14} /></a>
        </>}
        {step === 3 && <>
          <span className="welcome-icon"><Music2 size={30} /></span>
          <h3>Qual é o seu usuário no Last.fm?</h3>
          <form className="welcome-form" onSubmit={e => { e.preventDefault(); void verify(); }}>
            <input aria-label="Usuário do Last.fm" placeholder="seu_usuario" value={name} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={100} onChange={e => setName(e.target.value)} />
            <button type="submit" className="button" disabled={checking}>{checking ? <MusicLoader size="sm" /> : <Check size={15} />}<span>Verificar</span></button>
          </form>
          {error && <p className="alert error" role="alert">{error}</p>}
          {found && <div className="welcome-found">{found.image ? <img src={found.image} alt="" width="56" height="56" /> : <span className="welcome-icon small"><UserRound size={22} /></span>}<div><strong>{found.realname || found.name}</strong><small>@{found.name} · {number(found.playcount)} scrobbles{found.registered ? ` · desde ${new Date(found.registered * 1000).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}` : ''}</small></div></div>}
          {found && <button type="button" className="button primary" onClick={() => onUse(found)}><span>Entrar e baixar meu histórico</span><ArrowRight size={16} /></button>}
          <small>O download do histórico completo pode levar alguns minutos; você já pode navegar enquanto ele acontece. Os dados de outro perfil salvo continuam no aparelho.</small>
        </>}
      </div>
      <div className="welcome-nav">
        {step > 0 ? <button type="button" className="button small" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /><span>Voltar</span></button> : <button type="button" className="text-button" onClick={onClose}>Explorar o perfil de exemplo</button>}
        <button type="button" className="text-button" onClick={() => void shareInvite(onNotice, onError)}><Share2 size={14} /> Convidar amigos</button>
        {step < steps.length - 1 && <button type="button" className="button small primary" onClick={() => setStep(step + 1)}><span>{step === 0 ? 'Começar' : 'Próximo'}</span><ArrowRight size={15} /></button>}
      </div>
    </div>
  </Modal>;
}
