import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAccount } from './AccountProvider';

export function AccountLogout({ disabled = false }: { disabled?: boolean }) {
  const account = useAccount();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const leave = async () => {
    if (pending) return;
    setError('');
    setPending(true);
    try { await account.signOut(); }
    catch (reason) { setError(reason instanceof Error && reason.message.startsWith('Aguarde a sincronização') ? reason.message : 'Não foi possível sair. Verifique a conexão e tente novamente.'); }
    finally { setPending(false); }
  };
  return <div className="account-logout-action">
    <button type="button" className="button account-logout-button" disabled={disabled || account.busy || pending}
      title={account.busy ? 'Aguarde o backup terminar para sair com segurança.' : 'Voltar à tela de login'}
      onClick={() => void leave()}>
      <LogOut size={17} aria-hidden="true"/><span>{pending ? 'Saindo…' : 'Sair da conta'}</span>
    </button>
    {account.busy && <small className="account-logout-hint">Aguarde o backup terminar para sair.</small>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}
