import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ExternalLink, Link2, Music2, Share2, UserRound, Trophy, Radio, Film, Cloud, Sparkles } from 'lucide-react';
import { ApiError, getProfile } from '../lib/api';
import { pullRemoteProject } from '../lib/projectSync';
import type { Profile, Settings } from '../lib/types';
import { Modal, MusicLoader, number } from './UI';
import { shareInvite } from '../lib/invite';

/** Mini-tutorial para qualquer pessoa usar o app com o próprio Last.fm. Nada é enviado a outros usuários. */
export function Welcome({ settings, onUse, onClose, onNotice, onError }: { settings: Settings; onUse: (profile: Profile) => void; onClose: () => void; onNotice: (s: string) => void; onError: (s: string) => void }) {
  const [step, setStep] = useState(0), [name, setName] = useState(''), [checking, setChecking] = useState(false), [found, setFound] = useState<Profile | null>(null), [error, setError] = useState('');
  const [syncKeyInput, setSyncKeyInput] = useState(''), [connectingSync, setConnectingSync] = useState(false);
  const steps = ['Seu palco', 'Sua próxima era', 'Em todo aparelho', 'Conta Last.fm', 'Conectar o player', 'Seu perfil'];
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { contentRef.current?.closest('dialog')?.scrollTo({ top: 0, behavior: 'instant' }); }, [step]);
  const verify = async () => {
    const user = name.trim(); setError(''); setFound(null);
    if (!/^[\w.-]{2,100}$/.test(user)) { setError('Digite o nome de usuário do Last.fm (sem espaços).'); return; }
    setChecking(true);
    try { setFound(await getProfile({ user, apiKey: settings.apiKey })); }
    catch (e) { setError(e instanceof ApiError && e.code === 6 ? 'Usuário não encontrado no Last.fm. Confira a grafia.' : e instanceof Error ? e.message : 'Não foi possível verificar agora.'); }
    finally { setChecking(false); }
  };
  const handleConnectSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncKeyInput.trim()) return;
    setConnectingSync(true); setError('');
    try {
      const { changed } = await pullRemoteProject(syncKeyInput);
      onNotice(`Backstage sincronizado! ${changed} semanas e preferências aplicadas.`);
      onClose();
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chave inválida ou não encontrada na nuvem.');
    } finally {
      setConnectingSync(false);
    }
  };
  return <Modal title="Bem-vinda à sua headliner era ✦" subtitle={`Passo ${step + 1} de ${steps.length} · ${steps[step]}`} onClose={onClose} className="welcome-dialog">
    <div className="welcome" ref={contentRef}>
      <ol className="welcome-progress" aria-hidden="true">{steps.map((s, i) => <li key={s} className={i <= step ? 'on' : ''} />)}</ol>
      <div className="welcome-slide" key={step}>
        {step === 0 && <>
          <img className="welcome-logo" src="/favicon.svg" alt="" width="88" height="88" />
          <h3>Você dá o play. A gente monta o show.</h3>
          <p>Seu histórico vira charts, vídeos, troféus e um perfil com a sua energia. Sem julgamento de guilty pleasure: aqui todo replay merece palco.</p>
          <div className="welcome-stage" role="img" aria-label="Ilustração de uma parada musical em crescimento"><div/><div/><div/><div/><div/><Trophy size={32}/></div>
          <ul className="welcome-points"><li><Check size={15} /> Last.fm sem senha: basta seu nome de usuário público</li><li><Check size={15} /> Funciona no celular, tablet e computador</li><li><Check size={15} /> Você pode voltar ao perfil de exemplo quando quiser</li></ul>
        </>}
        {step === 1 && <><span className="welcome-icon"><Sparkles size={30}/></span><h3>Conheça sua próxima era.</h3><div className="welcome-features"><div><Radio/><strong>Live Charts</strong><p>A corrida da semana acontece aqui. O resultado só vira oficial depois do fechamento.</p></div><div><Trophy/><strong>280 conquistas</strong><p>Seu fandom, suas décadas e seus hábitos rendem selos colecionáveis.</p></div><div><Music2/><strong>Meu eu do passado</strong><p>Descubra quem ficou no seu coração e quem chegou causando.</p></div><div><Film/><strong>Seu próprio clipe</strong><p>Anime os charts no Estúdio e escolha se quer pular as ausências.</p></div></div></>}
        {step === 2 && <>
          <span className="welcome-icon"><Cloud size={30}/></span>
          <h3>Seu backstage vai com você.</h3>
          <p>Em <strong>Ajustes › Projetos entre aparelhos</strong>, crie uma chave, envie seu projeto e use a mesma chave no celular, tablet ou computador para recebê-lo sem importar tudo de novo.</p>
          <ul className="welcome-points">
            <li><Check size={15}/> Histórico e preferências cifrados com a sua chave</li>
            <li><Check size={15}/> Seus atalhos favoritos sempre à mão, logo no topo</li>
            <li><Check size={15}/> Acervo em grid ou lista, na mesma ordem</li>
          </ul>
          <form className="welcome-form" style={{ marginTop: 14 }} onSubmit={handleConnectSync}>
            <input aria-label="Chave de sincronização de outro aparelho" placeholder="Já tem chave de outro aparelho? Cole aqui…" value={syncKeyInput} onChange={e => setSyncKeyInput(e.target.value)} />
            <button type="submit" className="button" disabled={connectingSync || !syncKeyInput.trim()}>{connectingSync ? <MusicLoader size="sm" /> : <Check size={15} />}<span>Conectar</span></button>
          </form>
          {error && <p className="alert error" role="alert">{error}</p>}
          <p className="note">Você também pode apontar a câmera do tablet para o QR Code gerado no outro aparelho para conectar na hora.</p>
        </>}
        {step === 3 && <>
          <span className="welcome-icon"><UserRound size={30} /></span>
          <h3>Tenha uma conta no Last.fm</h3>
          <p>O Last.fm registra cada música que você ouve (o “scrobble”). É dele que o LastChart lê o seu histórico.</p>
          <a className="button" href="https://www.last.fm/join" target="_blank" rel="noreferrer"><span>Criar conta grátis no Last.fm</span><ExternalLink size={15} /></a>
          <small>Já tem conta? Toque em Próximo.</small>
        </>}
        {step === 4 && <>
          <span className="welcome-icon"><Link2 size={30} /></span>
          <h3>Conecte o seu player ao Last.fm</h3>
          <ol className="welcome-how">
            <li><div><strong>Spotify</strong><p>No Last.fm, abra <em>Configurações › Aplicativos</em> e conecte o Spotify. Daí em diante, cada música entra sozinha.</p></div></li>
            <li><div><strong>Outros players</strong><p>Use um app ou extensão de scrobbling compatível com o seu serviço, como o Web Scrobbler no navegador.</p></div></li>
            <li><div><strong>Histórico antigo</strong><p>Em <em>Spotify & YT Music</em>, você também pode importar os arquivos de histórico desses serviços.</p></div></li>
          </ol>
          <a className="button small" href="https://www.last.fm/settings/applications" target="_blank" rel="noreferrer"><span>Abrir aplicativos do Last.fm</span><ExternalLink size={14} /></a>
        </>}
        {step === 5 && <>
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
        {step < steps.length - 1 ? <button type="button" className="button small primary" onClick={() => setStep(step + 1)}><span>{step === 0 ? 'Bora conhecer' : 'Próximo'}</span><ArrowRight size={15} /></button> : <button type="button" className="button small primary" onClick={onClose}>Explorar o app</button>}
      </div>
    </div>
  </Modal>;
}
