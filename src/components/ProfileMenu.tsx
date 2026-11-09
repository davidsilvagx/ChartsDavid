import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, CloudCheck, Link2, Sparkles } from 'lucide-react';
import { ProfileAvatar } from './Avatars';
import { AccountLogout } from './AccountLogout';
import type { Profile } from '../lib/types';

export function ProfileMenu({ profile, avatar, guest, username, savedWeeks, onConnect, onAvatar, onAccount }: {
  profile: Profile | null; avatar?: string; guest: boolean; username: string; savedWeeks: number;
  onConnect: () => void; onAvatar: () => void; onAccount: () => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    container.current?.querySelector<HTMLElement>('.profile-popover button')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const act = (action: () => void) => { setOpen(false); action(); };
  return <div className="profile-menu" ref={container} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className={`profile-button ${guest ? 'is-guest' : ''}`}
      aria-label="Abrir perfil e conta" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <ProfileAvatar profile={profile} avatar={avatar} className="avatar"/>
      <span className="profile-meta"><strong>{guest ? 'Convidado' : username}</strong><small>Perfil e conta</small></span>
      <ChevronDown className="profile-menu-chevron" size={13} aria-hidden="true"/>
    </button>
    {open && <section id={id} className="profile-popover" aria-label="Perfil e conta">
      <header><span>SEU BACKSTAGE</span><strong>{guest ? 'Convidado' : username}</strong><small>{savedWeeks} semanas salvas</small></header>
      <div className="profile-menu-actions">
        <button type="button" onClick={() => act(onAccount)}><CloudCheck size={17}/><span>Conta e backup</span></button>
        <button type="button" onClick={() => act(guest ? onConnect : onAvatar)}>{guest ? <Link2 size={17}/> : <Sparkles size={17}/>}<span>{guest ? 'Conectar Last.fm' : 'Trocar avatar'}</span></button>
        {!guest && <button type="button" onClick={() => act(onConnect)}><Link2 size={17}/><span>Meu Last.fm</span></button>}
      </div>
      <AccountLogout/>
      <p className="profile-exit-note">Você volta ao login. Seus dados salvos ficam preservados.</p>
    </section>}
  </div>;
}
