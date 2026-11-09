import { mediaIsBusy, waitForMediaIdle } from "../lib/mediaActivity";
import {
  lazy,
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccountLoading } from "./AccountLoading";
import type { Session } from "@supabase/supabase-js";
import { verifiedSession } from "../lib/verifiedSession";
import { logoutWithTransition } from "../lib/logoutTransition";
import { supabase } from "../lib/supabase";
import { copyGuestDatabaseToAccount } from "../lib/storage";
import {
  switchWorkspacePreferences,
  workspaceOwner,
  rememberLoginIntent,
  hasLoginIntent,
  captureWorkspace,
} from "../lib/accountWorkspace";
import {
  AccountConflict,
  applyAccountSnapshot,
  collectAccountSnapshot,
  mergeAccountSnapshots,
  readAccountBase,
  readAccountHead,
  readAccountSnapshot,
  saveAccountBase,
  snapshotSignature,
  writeAccountSnapshot,
} from "../lib/accountSync";

const preferenceSignature = () => JSON.stringify(captureWorkspace());
const AccountGate = lazy(() => import("./AccountGate").then(m => ({default:m.AccountGate})));
interface AccountContextValue {
  session: Session | null;
  recovery: boolean;
  finishRecovery: () => void;
  prepareLogin: (carry: boolean, email: string) => void;
  sync: (preference?: "local" | "remote", force?: boolean) => Promise<void>;
  status: string;
  busy: boolean;
  conflict: AccountConflict | null;
  lastSync: number;
  signOut: () => Promise<void>;
}
const AccountContext = createContext<AccountContextValue | null>(null);
export const useAccount = () => {
  const value = useContext(AccountContext);
  if (!value) throw new Error("Conta indisponível.");
  return value;
};
export function AccountProvider({ children }: { children: ReactNode }) {
  const [signingOut, setSigningOut] = useState(false);
  const leaving = useRef(false);
  const [entering,setEntering]=useState(()=>{try{return sessionStorage.getItem("lastchart-account:entering")==="1";}catch{return false;}});
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [booting,setBooting] = useState(true),
    [authFailed,setAuthFailed] = useState(false),
    [recovery, setRecovery] = useState(
      () => { try { return sessionStorage.getItem("lastchart-account:recovery") === "1"; } catch { return false; } },
    );
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState<AccountConflict | null>(null),
    [lastSync, setLastSync] = useState(0);
  const switching = useRef(false),
    running = useRef(false),
    initializing = useRef(true),
    dirty = useRef(true),
    generation = useRef(0),
    conflictRef = useRef<AccountConflict | null>(null),
    sessionRef = useRef<Session | null>(null),
    applying = useRef(false),
    alive = useRef(true),
    authGeneration = useRef(0);
  useEffect(() => {
    alive.current = true;
    const mountedOwner = workspaceOwner();
    const accept = async (_next: Session | null, event?: string) => {
      if (!alive.current || switching.current) return;
      const authAttempt=++authGeneration.current;
      setAuthFailed(false);
      // Read the current persisted session, not a queued event from another tab.
      let next: Session | null;
      try {next=await verifiedSession(supabase.auth);}
      catch {
        if(alive.current && authAttempt===authGeneration.current){setReady(false);setAuthFailed(true);setSigningOut(false);leaving.current=false;setStatus("Sua sessão não pôde ser confirmada. Verifique a conexão e tente novamente.");}
        return;
      }
      if (event === "PASSWORD_RECOVERY" && next) {
        sessionStorage.setItem("lastchart-account:recovery", "1");
        setRecovery(true);
      }
      if (!alive.current || authAttempt!==authGeneration.current) return;
      if(next && sessionStorage.getItem("lastchart-account:entering")==="1")setEntering(true);
      const owner = next?.user.id ?? "guest";
      if (workspaceOwner() !== owner) {
        switching.current = true;
        try {
          const activate = async () => {
            const current=await supabase.auth.getSession();
            if(current.error)throw current.error;
            if((current.data.session?.user.id??"guest")!==owner)throw Error("session_changed");
            if(workspaceOwner()===owner)return;
          const bring =
            hasLoginIntent(next?.user.email ?? '') && workspaceOwner() === "guest" && owner !== "guest";
          if (bring) await copyGuestDatabaseToAccount(owner);
          switchWorkspacePreferences(owner, bring);
          localStorage.removeItem('lastchart-account:login-intent');
          if (bring)
            localStorage.setItem(
              `lastchart-account:import-guest:${owner}`,
              "1",
            );
          };
          if(navigator.locks)await navigator.locks.request('lastchart-account:workspace-transition',activate);
          else await activate();
          location.reload();
        } catch (error) {
          switching.current = false;
          if(error instanceof Error && error.message==="session_changed"){void accept(null);return;}
          setReady(false);
          setSigningOut(false);
          leaving.current = false;
          setAuthFailed(true);
          setStatus(
            "Não foi possível abrir o espaço da conta. Libere espaço no aparelho e tente novamente.",
          );
        }
        return;
      }
      if(mountedOwner!==owner){location.reload();return;}
      sessionRef.current = next;
      setSession(next);
      if(!next)setBooting(false);
      setReady(true);
    };
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setTimeout(() => void accept(next, event), 0);
    });
    // INITIAL_SESSION is emitted by the SDK after initialization. Calling
    // getSession again here used to race that same event during tab reloads.
    const changed = (e: StorageEvent) => {
      if (e.key !== "lastchart-account:workspace-owner" || e.newValue === (sessionRef.current?.user.id ?? mountedOwner)) return;
      setReady(false);
      void accept(null);
    };
    window.addEventListener("storage", changed);
    return () => {
      alive.current = false;
      data.subscription.unsubscribe();
      window.removeEventListener("storage", changed);
    };
  }, []);
  const sync = useCallback(
    async (preference?: "local" | "remote", force = false) => {
      const user = sessionRef.current?.user;
      if (!user || leaving.current || running.current || (!preference && conflictRef.current))
        return;
      if (!navigator.onLine) {
        setStatus(
          "Offline · suas alterações ficam salvas aqui e serão enviadas quando a conexão voltar.",
        );
        return;
      }
      if(mediaIsBusy()&&!force){setStatus("Tudo salvo neste aparelho. O backup continua após a animação.");return;}
      running.current = true;
      setBusy(true);
      setStatus("Sincronizando seu backstage…");
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const startedAt = generation.current, startedPreferences=preferenceSignature();
          const edited = () => generation.current!==startedAt || preferenceSignature()!==startedPreferences;
          const base = await readAccountBase(),
            head = await readAccountHead(supabase, user.id);
          if (
            !force &&
            !preference &&
            !dirty.current &&
            base &&
            head?.revision === base.revision
          ) {
            setStatus("Tudo salvo na sua conta.");
            setLastSync(Date.parse(head.updated_at));
            break;
          }
          const local = await collectAccountSnapshot(),
            startSignature = await snapshotSignature(local);
          let next = local,
            remoteSignature = "";
          if (head) {
            // A matching revision and signature needs no download or upload.
            if (
              base?.revision === head.revision &&
              base.signature === startSignature
            ) {
              if (generation.current === startedAt) dirty.current = false;
              setStatus("Tudo salvo na sua conta.");
              setLastSync(Date.parse(head.updated_at));
              break;
            }
            await waitForMediaIdle();
            const remote = await readAccountSnapshot(supabase, user.id, head);
            remoteSignature = await snapshotSignature(remote);
            const importing =
              localStorage.getItem(
                `lastchart-account:import-guest:${user.id}`,
              ) === "1";
            if (!base && !importing && !preference) next = remote;
            else {
              const merged = await mergeAccountSnapshots(
                local,
                remote,
                base ?? null,
                preference,
              );
              if (merged.conflicts.length)
                throw new AccountConflict(
                  local,
                  remote,
                  head,
                  merged.conflicts,
                );
              next = merged.snapshot;
            }
          }
          if (
            edited()
          ) {
            if (attempt < 2) continue;
            throw new Error(
              "Você está editando o projeto. Vamos sincronizar quando as mudanças terminarem.",
            );
          }
          let saved = head;
          if (!head || (await snapshotSignature(next)) !== remoteSignature) {
            try {
              saved = await writeAccountSnapshot(
                supabase,
                user.id,
                head?.revision ?? 0,
                next,
              );
            } catch (error) {
              if (["PT409", "40001"].includes((error as { code?: string }).code ?? "") && attempt < 2)
                continue;
              throw error;
            }
          }
          if (!saved) throw new Error("Não foi possível confirmar o backup.");
          // New writes while the upload was running remain local and are merged on the next attempt.
          if (
            edited()
          ) {
            if (attempt < 2) continue;
            throw new Error(
              "Há novas alterações locais. O backup anterior foi salvo; tentaremos combinar as novas em instantes.",
            );
          }
          if (startSignature !== (await snapshotSignature(next))) {
            await waitForMediaIdle();
            applying.current = true;
            try {
              await applyAccountSnapshot(supabase, user.id, next);
            } finally {
              applying.current = false;
            }
          }
          await saveAccountBase(next, saved.revision);
          localStorage.removeItem(`lastchart-account:import-guest:${user.id}`);
          conflictRef.current = null;
          setConflict(null);
          setLastSync(Date.parse(saved.updated_at));
          if (generation.current === startedAt) dirty.current = false;
          setStatus("Tudo salvo na sua conta.");
          break;
        }
      } catch (error) {
        if (error instanceof AccountConflict) {
          conflictRef.current = error;
          setConflict(error);
          setStatus(error.message);
        } else {
          const message = error instanceof Error ? error.message : "";
          setStatus(
            message && !(error as { code?: string })?.code
              ? message
              : "Backup indisponível agora. Seus dados locais estão preservados; tentaremos novamente.",
          );
        }
      } finally {
        running.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [],
  );
  useEffect(() => {
    if (!ready || !session || recovery) return;
    let debounce: ReturnType<typeof setTimeout> | undefined,
      preferences = preferenceSignature();
    const schedule = () => {
      if (applying.current) return;
      dirty.current = true;
      generation.current++;
      clearTimeout(debounce);
      debounce = setTimeout(() => void sync(), 8000);
    };
    const changed = () => schedule();
    const online = () => { if(!initializing.current)void sync(); };
    const visible = () => {
      if (!initializing.current && document.visibilityState === "visible") void sync();
    };
    const poll = setInterval(() => {
      if (!initializing.current && document.visibilityState === "visible") void sync();
    }, 60000);
    const localPoll = setInterval(() => {
      const next = preferenceSignature();
      if (preferences && preferences !== next) schedule();
      preferences = next;
    }, 4000);
    const initial = setTimeout(async () => {
      try {
        const base=await readAccountBase();
        if(base)setBooting(false);
        await sync();
        // Keep any edits made after a failed/offline first restore for an explicit merge later.
        if(!base&&!await readAccountBase()&&!conflictRef.current)localStorage.setItem(`lastchart-account:import-guest:${session.user.id}`,'1');
      } catch {setStatus('Não foi possível receber o backup agora. Seus dados locais continuam preservados.');}
      finally {initializing.current=false;if(alive.current)setBooting(false);}
    }, 0);
    window.addEventListener("lastchart-data-changed", changed);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(initial);
      clearTimeout(debounce);
      clearInterval(poll);
      clearInterval(localPoll);
      window.removeEventListener("lastchart-data-changed", changed);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [ready, session?.user.id, sync, recovery]);
  useEffect(()=>{if(!entering||!ready||!session||booting)return;const timer=setTimeout(()=>{sessionStorage.removeItem("lastchart-account:entering");setEntering(false);},950);return()=>clearTimeout(timer);},[entering,ready,session?.user.id,booting]);
  useEffect(() => { if (ready && !session && signingOut) { leaving.current = false; setSigningOut(false); } }, [ready, session, signingOut]);
  const signOut = async () => {
    if (leaving.current) return;
    if (running.current)
      throw new Error("Aguarde a sincronização terminar antes de sair.");
    leaving.current = true;
    setSigningOut(true);
    try {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
      await logoutWithTransition(supabase.auth, reduced ? 0 : 450);
      sessionStorage.removeItem('lastchart-account:entering');
    } catch (error) {
      leaving.current = false;
      setSigningOut(false);
      throw error;
    }
  };
  return (
    <AccountContext.Provider
      value={{
        session,
        recovery,
        finishRecovery: () => {
          sessionStorage.removeItem("lastchart-account:recovery");
          setRecovery(false);
        },
        prepareLogin: (value, email) => {
          rememberLoginIntent(value,email);
        },
        sync,
        status,
        busy,
        conflict,
        lastSync,
        signOut,
      }}
    >
      <div className="account-content" inert={signingOut} aria-hidden={signingOut || undefined}>
      {ready && (!session || recovery) ? (
        <Suspense fallback={<AccountLoading/>}><AccountGate/></Suspense>
      ) : ready && !booting ? (
        <>{children}{entering&&<AccountLoading overlay message="Seu palco está pronto ✦"/>}</>
      ) : (
        <AccountLoading message={status || "Afinando seu backstage…"} onRetry={authFailed?()=>location.reload():undefined}/>
      )}
      </div>
      {signingOut && <AccountLoading overlay exit message="Até o próximo play ✦"/>}
    </AccountContext.Provider>
  );
}
