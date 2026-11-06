import { createClient } from "@supabase/supabase-js";
// Publishable key: designed to be public. Private data is protected by Auth + database/Storage RLS.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ||
    "https://qyzelexnjoquhrlcelvz.supabase.co",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_nmcr3oTT40jamGIeP9Vgvw_RP4CaNEB",
  {
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(120000)])
            : AbortSignal.timeout(120000),
        }),
    },
    auth: {
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: "lastchart-auth:v1",
    },
  },
);
// A signup code confirms the email without opening the main app session.
export const verificationClient = () => createClient(
  import.meta.env.VITE_SUPABASE_URL || "https://qyzelexnjoquhrlcelvz.supabase.co",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_nmcr3oTT40jamGIeP9Vgvw_RP4CaNEB",
  { auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:"lastchart-verification-only"},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(30000)})} },
);
export const authRedirect = () => `${location.origin}/?account=callback`;
export function accountError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const known: Record<string, string> = {
    invalid_credentials: "E-mail ou senha incorretos.",
    email_not_confirmed:
      "Confirme seu e-mail antes de entrar. Confira também o spam.",
    user_already_exists:
      "Esse e-mail já tem conta. Entre ou recupere sua senha.",
    weak_password: "Escolha uma senha com pelo menos 12 caracteres.",
    over_email_send_rate_limit:
      "Muitos pedidos de e-mail. Aguarde um pouco antes de tentar novamente.",
    signup_disabled: "Novos cadastros estão temporariamente indisponíveis.",
    same_password: "Escolha uma senha diferente da anterior.",
    session_not_found: "Sua sessão expirou. Entre novamente.",
    otp_expired: "Esse link expirou. Solicite um novo e-mail.",
  };
  return (
    known[code ?? ""] ||
    (error instanceof TypeError
      ? "Sem conexão. Seus dados continuam neste aparelho."
      : "Não foi possível concluir. Tente novamente em instantes.")
  );
}
