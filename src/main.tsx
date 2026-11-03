import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main style={{fontFamily:'system-ui',padding:32,maxWidth:600,margin:'auto'}}><h1>Vamos retomar sua história.</h1><p>O aplicativo encontrou um problema. Os dados já salvos continuam no navegador.</p><button onClick={()=>window.location.reload()}>Recarregar</button></main>:this.props.children;}
}
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) {
        window.location.reload();
      }
    });

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(reg => {
        if (reg.waiting) {
          reg.waiting.postMessage('SKIP_WAITING');
        }
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (installing) {
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                installing.postMessage('SKIP_WAITING');
              }
            });
          }
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            void reg.update();
          }
        });
      })
      .catch(() => {
        /* App remains available without offline installation. */
      });
  });
}
