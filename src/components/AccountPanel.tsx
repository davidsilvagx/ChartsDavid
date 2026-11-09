import { passwordRules, validPassword } from "../lib/passwordPolicy";
import { useState, type FormEvent } from "react";
import {
  CloudCheck,
  CloudUpload,
  KeyRound,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { supabase, authRedirect, accountError } from "../lib/supabase";
import { DEMO_USER } from "../lib/types";
import { useAccount } from "./AccountProvider";
import { AccountLogout } from "./AccountLogout";

export function AccountPanel() {
  const account = useAccount(),
    [mode, setMode] = useState<"login" | "signup" | "reset">("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [carry, setCarry] = useState(() => { try { const saved=JSON.parse(localStorage.getItem('lastchart-studio:settings:v1')??'{}'); return Boolean(saved.user && (saved.user.toLowerCase()!==DEMO_USER.toLowerCase() || localStorage.getItem('lastchart-studio:custom-user:v1')==='1')); } catch { return false; } }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (account.recovery) {
        if (!validPassword(password) || password !== confirm) {
          setError("Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo; repita a mesma senha.");
          return;
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        account.finishRecovery();
        setPassword("");
        setConfirm("");
        setMessage("Senha atualizada. Seu backstage continua com você.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: authRedirect() },
        );
        if (error) throw error;
        setMessage(
          "Se esse e-mail tiver conta, enviaremos o link. Abra-o neste mesmo navegador; confira também o spam.",
        );
      } else if (mode === "signup") {
        if (!validPassword(password) || password !== confirm) {
          setError("Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo; repita a mesma senha.");
          return;
        }
        account.prepareLogin(carry,email);
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: authRedirect() },
        });
        if (error) throw error;
        if (!data.session) {
          setMessage(
            "Confira seu e-mail para confirmar a conta. Depois, entre com sua senha; seus dados deste aparelho continuam aqui.",
          );
          setMode("login");
        }
        setPassword("");
        setConfirm("");
      } else {
        account.prepareLogin(carry,email);
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setPassword("");
      }
    } catch (e) {
      setError(accountError(e));
    } finally {
      setBusy(false);
    }
  };
  const resend = async () => {
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: authRedirect() },
      });
      if (error) throw error;
      setMessage("Solicitação enviada. Confira a caixa de entrada e o spam.");
    } catch (e) {
      setError(accountError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="panel account-panel"
      id="minha-conta"
      aria-label="Conta LastChart"
    >
      <div className="panel-heading">
        <div>
          <h2>
            <UserRound size={19} /> Seu backstage, em todo lugar
          </h2>
          <p>
            Uma conta LastChart para levar seu histórico, sua chave Last.fm,
            ajustes, conquistas e trilhas entre aparelhos.
          </p>
        </div>
      </div>
      <div className="settings-content">
        {account.session && !account.recovery ? (
          <>
            <div className="account-identity">
              <span className="account-avatar">
                <CloudCheck size={27} />
              </span>
              <div>
                <strong>{account.session.user.email}</strong>
                <small>Conta conectada · backup privado</small>
              </div>
            </div>
            <p className="note" role="status">
              {account.status || "Preparando sincronização…"}
              {account.lastSync > 0 &&
                ` Último backup: ${new Date(account.lastSync).toLocaleString("pt-BR")}.`}
            </p>
            <div className="inline-actions account-actions">
              <button
                type="button"
                className="button primary"
                disabled={account.busy}
                onClick={() => void account.sync(undefined, true)}
              >
                <CloudUpload size={16} />
                <span>{account.busy ? "Sincronizando…" : "Sincronizar agora"}</span>
              </button>
              <AccountLogout disabled={busy}/>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setEmail(account.session!.user.email ?? "");
                  setMode("reset");
                  void supabase.auth
                    .resetPasswordForEmail(account.session!.user.email!, {
                      redirectTo: authRedirect(),
                    })
                    .then(({ error }) => {
                      if (error) setError(accountError(error));
                      else
                        setMessage(
                          "Link de recuperação enviado. Abra-o neste navegador.",
                        );
                    });
                }}
              >
                Recuperar senha
              </button>
            </div>
            {account.conflict && (
              <div className="account-conflict" role="alert">
                <h3>Dois aparelhos, duas edições</h3>
                <p>
                  O mesmo ajuste mudou nos dois lados. O histórico compatível
                  será combinado sem multiplicar reproduções. Se os perfis
                  Last.fm forem diferentes, escolha o perfil que ficará ativo.
                </p>
                <button
                  className="button"
                  disabled={account.busy}
                  onClick={() => void account.sync("local")}
                >
                  Combinar · manter ajustes deste aparelho
                </button>
                <button
                  className="button"
                  disabled={account.busy}
                  onClick={() => void account.sync("remote")}
                >
                  Combinar · manter ajustes da nuvem
                </button>
              </div>
            )}
          </>
        ) : (
          <form className="account-form" onSubmit={(e) => void submit(e)}>
            {!account.recovery && (
              <div
                className="account-tabs"
                role="group"
                aria-label="Acesso à conta"
              >
                <button
                  type="button"
                  aria-pressed={mode === "login"}
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "signup"}
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  Criar conta
                </button>
              </div>
            )}
            <h3>
              {account.recovery
                ? "Nova senha, mesma era"
                : mode === "signup"
                  ? "Seu passe para todas as telas"
                  : mode === "reset"
                    ? "Vamos recuperar seu acesso"
                    : "Bem-vinda ao seu backstage"}
            </h3>
            {!account.recovery && (
              <label>
                <span>
                  <Mail size={14} /> E-mail
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {(account.recovery || mode !== "reset") && (
              <label>
                <span>
                  <KeyRound size={14} />{" "}
                  {account.recovery ? "Nova senha" : "Senha"}
                </span>
                <input
                  type="password"
                  autoComplete={
                    mode === "signup" || account.recovery
                      ? "new-password"
                      : "current-password"
                  }
                  required
                  minLength={mode === "signup" || account.recovery ? 12 : 1}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {(account.recovery || mode === "signup") && (
              <label>
                <span>Repita a senha</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={72}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                <ul className="password-rules" aria-label="Requisitos de senha">{passwordRules(password).map(rule => <li key={rule.label} className={rule.met ? "met" : ""}>{rule.met ? "✓" : "○"} {rule.label}</li>)}</ul>
              </label>
            )}
            {!account.recovery && mode !== "reset" && (
              <label className="account-carry">
                <input
                  type="checkbox"
                  checked={carry}
                  onChange={(e) => setCarry(e.target.checked)}
                />
                <span>
                  Levar meus dados deste aparelho para a conta. Se já houver
                  backup, vou escolher como combinar.
                </span>
              </label>
            )}
            <button className="button primary" type="submit" disabled={busy}>
              {busy
                ? "Só um instante…"
                : account.recovery
                  ? "Salvar nova senha"
                  : mode === "signup"
                    ? "Criar meu backstage"
                    : mode === "reset"
                      ? "Enviar link de recuperação"
                      : "Entrar na minha conta"}
            </button>
            {!account.recovery && (
              <div className="inline-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setMode(mode === "reset" ? "login" : "reset");
                    setError("");
                  }}
                >
                  {mode === "reset"
                    ? "Voltar para entrar"
                    : "Esqueci minha senha"}
                </button>
                {mode === "login" && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy || !email.trim()}
                    onClick={() => void resend()}
                  >
                    Reenviar confirmação
                  </button>
                )}
              </div>
            )}
            <p className="account-privacy">
              <ShieldCheck size={15} /> Sua conta tem acesso apenas ao seu
              próprio backup. A senha é gerenciada pelo Supabase Auth; o backup
              privado inclui sua chave Last.fm, mas nunca sua senha ou tokens de
              Spotify e Google. A proteção usa conexão segura e permissões por
              usuário.
            </p>
          </form>
        )}
        {!account.session && account.status && (
          <p role="status">{account.status}</p>
        )}
        {message && <p role="status">{message}</p>}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
