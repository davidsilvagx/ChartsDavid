import { lazy, Suspense, useEffect, useState } from "react";
import { CloudCheck, UserRound } from "lucide-react";
import { useAccount } from "./AccountProvider";
const AccountPanel = lazy(() =>
  import("./AccountPanel").then((m) => ({ default: m.AccountPanel })),
);
import { Modal } from "./UI";
export function AccountEntry() {
  const account = useAccount(),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (account.recovery || account.conflict) setOpen(true);
  }, [account.recovery,account.conflict]);
  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.get("account") === "callback") {
      setOpen(true);
      url.searchParams.delete("account");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);
  return (
    <>
      <button
        type="button"
        className={`icon-button account-entry ${account.session ? "connected" : ""}`}
        aria-label={
          account.session
            ? "Minha conta e sincronização"
            : "Entrar ou criar conta LastChart"
        }
        title={
          account.session
            ? "Minha conta e sincronização"
            : "Sua conta LastChart"
        }
        onClick={() => setOpen(true)}
      >
        {account.session ? <CloudCheck size={18} /> : <UserRound size={18} />}
      </button>
      {open && (
        <Modal
          title="Seu backstage"
          subtitle="Uma conta, todas as suas telas."
          onClose={() => setOpen(false)}
        >
          <Suspense fallback={<p role="status">Abrindo sua conta…</p>}>
            <AccountPanel />
          </Suspense>
        </Modal>
      )}
    </>
  );
}
