import { Disc3, Music2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
export function AccountLoading({message='Afinando seu backstage…',overlay=false,exit=false,onRetry}:{message?:string;overlay?:boolean;exit?:boolean;onRetry?:()=>void}) {
  const departure = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = departure.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [overlay, exit]);
  const content = <><div className="loading-record" aria-hidden="true"><Disc3 size={72} strokeWidth={1}/><Music2 className="loading-note" size={20}/></div><div className="loading-equalizer" aria-hidden="true">{[0,1,2,3,4].map(i=><i key={i} style={{animationDelay:`${i*-.13}s`}}/>)}</div><p>{message}</p>{onRetry&&<button className="button primary" onClick={onRetry}>Tentar novamente</button>}</>;
  return overlay && exit
    ? <dialog ref={departure} className="account-loading musical-loading account-departure" aria-label={message} onCancel={event => event.preventDefault()}>{content}</dialog>
    : <div className={`account-loading musical-loading ${overlay?'account-entrance':''}`} role="status" aria-live="polite">{content}</div>;
}
