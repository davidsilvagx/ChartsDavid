import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { copyGuestDatabaseToAccount } from "../lib/storage";
import {
  switchWorkspacePreferences,
  workspaceOwner,
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

interface AccountContextValue {
  session: Session | null;
  recovery: boolean;
  finishRecovery: () => void;
  prepareLogin: (carry: boolean) => void;
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
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [booting,setBooting] = useState(true),
    [recovery, setRecovery] = useState(
      () => { try { return sessionStorage.getItem("lastchart-account:recovery") === "1"; } catch { return false; } },
    );
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [conflict, setConflict] = useState<AccountConflict | null>(null),
    [lastSync, setLastSync] = useState(0);
  const carry = useRef(false),
    switching = useRef(false),
    running = useRef(false),
    initializing = useRef(true),
    dirty = useRef(true),
    generation = useRef(0),
    conflictRef = useRef<AccountConflict | null>(null),
    sessionRef = useRef<Session | null>(null),
    applying = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const accept = async (next: Session | null, event?: string) => {
      if (!alive.current || switching.current) return;
      if (event === "PASSWORD_RECOVERY") {
        sessionStorage.setItem("lastchart-account:recovery", "1");
        setRecovery(true);
      }
      const owner = next?.user.id ?? "guest";
      if (workspaceOwner() !== owner) {
        switching.current = true;
        try {
          const bring =
            carry.current && workspaceOwner() === "guest" && owner !== "guest";
          if (bring) await copyGuestDatabaseToAccount(owner);
          switchWorkspacePreferences(owner, bring);
          if (bring)
            localStorage.setItem(
              `lastchart-account:import-guest:${owner}`,
              "1",
            );
          location.reload();
        } catch {
          switching.current = false;
          setStatus(
            "Não foi possível abrir o espaço da conta. Libere espaço no aparelho e tente novamente.",
          );
        }
        return;
      }
      sessionRef.current = next;
      setSession(next);
      if(!next)setBooting(false);
      setReady(true);
    };
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setTimeout(() => void accept(next, event), 0);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setStatus("Entre novamente para retomar sua conta.");
      void accept(data.session);
    });
    const changed = (e: StorageEvent) => {
      if (e.key === "lastchart-account:workspace-owner") location.reload();
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
      if (!user || running.current || (!preference && conflictRef.current))
        return;
      if (!navigator.onLine) {
        setStatus(
          "Offline · suas alterações ficam salvas aqui e serão enviadas quando a conexão voltar.",
        );
        return;
      }
      running.current = true;
      setBusy(true);
      setStatus("Sincronizando seu backstage…");
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const startedAt = generation.current;
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
            (await snapshotSignature(await collectAccountSnapshot())) !==
            startSignature
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
            (await snapshotSignature(await collectAccountSnapshot())) !==
            startSignature
          ) {
            if (attempt < 2) continue;
            throw new Error(
              "Há novas alterações locais. O backup anterior foi salvo; tentaremos combinar as novas em instantes.",
            );
          }
          if (startSignature !== (await snapshotSignature(next))) {
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
    if (!ready || !session) return;
    const preferenceSignature = () =>
      JSON.stringify(
        Object.entries(localStorage).filter(([key]) =>
          /^(lastchart-studio:|lastchart-awards:|lastchart-compare:|saved-eras:|spotlight-name:|lastchart-achievements:)/.test(
            key,
          ),
        ),
      );
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
  }, [ready, session?.user.id, sync]);
  const signOut = async () => {
    if (running.current)
      throw new Error("Aguarde a sincronização terminar antes de sair.");
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
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
        prepareLogin: (value) => {
          carry.current = value;
        },
        sync,
        status,
        busy,
        conflict,
        lastSync,
        signOut,
      }}
    >
      {ready && (!session || !booting) ? (
        children
      ) : (
        <main className="account-loading" role="status">
          {status || "Abrindo seu backstage…"}
        </main>
      )}
    </AccountContext.Provider>
  );
}
