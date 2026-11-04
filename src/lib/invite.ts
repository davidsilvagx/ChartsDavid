/** Convite: cada pessoa abre o app e usa o próprio Last.fm; nada é compartilhado entre aparelhos. */
export const inviteUrl = () => `${location.origin}/?convite=1`;
export async function shareInvite(onNotice: (s: string) => void, onError: (s: string) => void) {
  const url = inviteUrl(), text = 'Crie seus charts, premiações e perfil musical com o seu Last.fm no LastChart.';
  try {
    if (navigator.share) { await navigator.share({ title: 'LastChart', text, url }); return; }
    await navigator.clipboard.writeText(url); onNotice('Link de convite copiado. Cada pessoa usa o próprio Last.fm, e os dados ficam no aparelho dela.');
  } catch (e) { if ((e as DOMException)?.name !== 'AbortError') onError(`Copie o link: ${url}`); }
}

