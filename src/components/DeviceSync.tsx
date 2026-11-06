import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { CloudDownload, CloudUpload, Copy, FileDown, FileUp, KeyRound, Link2, LogOut, QrCode, ShieldCheck, Square, Trash2 } from 'lucide-react';
import { applyProject, collectProject, decryptProject, deleteRemote, deriveAccount, diffProjects, downloadClip, fetchRemote, generateSyncKey, mergeProjects, normalizeSyncKey, parseProject, pushRemote, readSyncState, sha256Hex, SyncError, uploadClip, writeSyncState, type ProjectFile, type SyncAccount, type SyncState } from '../lib/projectSync';
import { getMeta, putMeta } from '../lib/storage';
import type { ClipBank } from '../lib/leaderAudio';
import { download } from '../lib/export';
import { formatDateTimeBR } from '../lib/calendar';
import { MusicLoader } from './UI';

/** F01: projeto cifrado no aparelho; servidor só guarda bytes ilegíveis. Arquivo de projeto como alternativa. */
export function DeviceSync({ timezone, onError, onNotice }: { timezone: string; onError: (s: string) => void; onNotice: (s: string) => void }) {
  const [state, setState] = useState<SyncState | null>(readSyncState);
  const [draftKey, setDraftKey] = useState(''), [newKey, setNewKey] = useState(''), [busy, setBusy] = useState(''), [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [showQR, setShowQR] = useState(false), [qrImage, setQrImage] = useState('');
  useEffect(() => { let active = true; setQrImage(''); if (showQR && state?.key) void QRCode.toDataURL(`${location.origin}/?sync=${encodeURIComponent(state.key)}`, { width: 240, margin: 2, errorCorrectionLevel: 'M' }).then(url => { if(active)setQrImage(url); }).catch(() => {}); return () => { active = false; }; }, [showQR, state?.key]);
  const [remoteInfo, setRemoteInfo] = useState<{ device: string; updatedAt: number; usage: number; quota: number } | null>(null), [unavailable, setUnavailable] = useState('');
  const [conflict, setConflict] = useState<{ remote: ProjectFile; revision: number; local: ProjectFile; changes: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const update = (next: SyncState | null) => { setState(next); writeSyncState(next); };
  useEffect(() => () => controller.current?.abort(), []);

  const derived = useRef<{ key: string; account: Promise<SyncAccount> } | null>(null);
  // PBKDF2 é caro de propósito; deriva uma vez por chave.
  const account = () => { if (derived.current?.key !== state!.key) derived.current = { key: state!.key, account: deriveAccount(state!.key) }; return derived.current.account; };
  const handle = (e: unknown) => {
    if (e instanceof DOMException && e.name === 'AbortError') { onNotice('Sincronização cancelada. O que já foi enviado permanece.'); return; }
    if (e instanceof SyncError && e.code === 'not-configured') { setUnavailable(e.message); return; }
    if (e instanceof TypeError || (e instanceof SyncError && e.code === 'offline')) { if (state) update({ ...state, pending: true }); onError('Sem conexão. Tentaremos enviar o projeto quando a internet voltar.'); return; }
    onError(e instanceof Error ? e.message : 'Falha na sincronização. Seus dados locais continuam intactos.');
  };

  const uploadAudio = async (acc: SyncAccount, project: ProjectFile, signal: AbortSignal) => {
    const files: Array<{ hash: string; file: File }> = [];
    for (const bankKey of Object.keys(project.audio)) {
      const bank = await getMeta<ClipBank>(bankKey);
      for (const [itemId, entry] of Object.entries(project.audio[bankKey])) { const clip = bank?.[itemId]; if (clip && !files.some(f => f.hash === entry.hash)) files.push({ hash: entry.hash, file: clip.file }); }
    }
    const total = files.reduce((n, f) => n + f.file.size, 0); let done = 0;
    setProgress({ sent: 0, total });
    for (const { hash, file } of files) { await uploadClip(acc, hash, file, sent => setProgress({ sent: done + Math.min(sent, file.size), total }), signal); done += file.size; }
  };
  const restoreAudio = async (acc: SyncAccount, project: ProjectFile, signal: AbortSignal) => {
    let restored = 0, missing = 0;
    for (const [bankKey, entries] of Object.entries(project.audio)) {
      const bank = { ...((await getMeta<ClipBank>(bankKey)) ?? {}) };
      for (const [itemId, entry] of Object.entries(entries)) {
        if (bank[itemId] && await sha256Hex(await bank[itemId].file.arrayBuffer()) === entry.hash) continue;
        const file = await downloadClip(acc, entry, signal);
        if (!file) { missing++; continue; }
        bank[itemId] = { file, name: entry.name, duration: entry.duration, origin: entry.origin, matchedBy: entry.matchedBy }; restored++;
      }
      await putMeta(bankKey, bank);
    }
    return { restored, missing };
  };

  const push = async (force?: { base: number; project: ProjectFile }, retried = false) => {
    if (!state) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy('Cifrando e enviando o projeto…'); setUnavailable('');
    try {
      const acc = await account();
      const local = force?.project ?? await collectProject();
      let base = force?.base ?? state.revision;
      if (!force) {
        const remote = await fetchRemote(acc, abort.signal);
        // Nuvem vazia (apagada ou servidor novo): começa da revisão 0, sem conflito fantasma.
        if (!remote) base = 0;
        if (remote && remote.revision !== state.revision) {
          const decrypted = await decryptProject(acc, remote.payload, abort.signal);
          const changes = diffProjects(local, decrypted).length;
          if (changes) { setConflict({ remote: decrypted, revision: remote.revision, local, changes }); return; }
          base = remote.revision;
        }
      }
      if (state.includeAudio) await uploadAudio(acc, local, abort.signal);
      const saved = await pushRemote(acc, base, local, abort.signal);
      update({ ...state, revision: saved.revision, lastSync: saved.updatedAt, pending: false });
      setConflict(null);
      onNotice(`Projeto salvo na nuvem (revisão ${saved.revision}).`);
      void refreshInfo(acc);
    } catch (e) {
      if (e instanceof SyncError && e.code === 'conflict' && !retried) { setBusy(''); await push(undefined, true); return; }
      handle(e);
    } finally { setBusy(''); setProgress(null); }
  };

  const pull = async (project?: ProjectFile, revision?: number) => {
    if (!state) return;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy('Recebendo e decifrando…'); setUnavailable('');
    try {
      const acc = await account();
      let remoteProject = project, remoteRevision = revision ?? state.revision;
      if (!remoteProject) {
        const remote = await fetchRemote(acc, abort.signal);
        if (!remote) { onNotice('Ainda não há projeto salvo com esta chave. Toque em Enviar neste aparelho primeiro.'); return; }
        remoteProject = await decryptProject(acc, remote.payload, abort.signal); remoteRevision = remote.revision;
      }
      const audio = state.includeAudio ? await restoreAudio(acc, remoteProject, abort.signal) : { restored: 0, missing: 0 };
      const changed = await applyProject(remoteProject);
      update({ ...state, revision: remoteRevision, lastSync: Date.now(), pending: false });
      setConflict(null);
      onNotice(`Projeto recebido: ${changed} ajustes aplicados${audio.restored ? `, ${audio.restored} trechos de áudio` : ''}${audio.missing ? ` (${audio.missing} trechos não estavam na nuvem)` : ''}. Recarregando…`);
      setTimeout(() => window.location.reload(), 900);
    } catch (e) { handle(e); } finally { setBusy(''); }
  };

  const refreshInfo = async (acc?: SyncAccount) => {
    try { const remote = await fetchRemote(acc ?? await account()); setRemoteInfo(remote ? { device: remote.device, updatedAt: remote.updatedAt, usage: remote.usage, quota: remote.quota } : null); setUnavailable(''); }
    catch (e) { if (e instanceof SyncError && e.code === 'not-configured') setUnavailable(e.message); }
  };
  useEffect(() => { if (state) void refreshInfo(); }, [state?.key]);
  // Retomada: envio pendente quando a conexão volta (somente o projeto, sem áudio).
  useEffect(() => {
    if (!state?.pending) return;
    const retry = () => void push();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [state?.pending, state?.key]);

  const exportFile = async () => { try { const project = await collectProject(); download(new Blob([JSON.stringify(project)], { type: 'application/json' }), `lastchart-projeto-${new Date().toISOString().slice(0, 10)}.json`); onNotice('Projeto exportado com histórico e preferências. Chave de API, tokens e arquivos de áudio não entram no arquivo.'); } catch (e) { handle(e); } };
  const mergeAndPush = () => { if (!conflict) return; try { void push({ base: conflict.revision, project: mergeProjects(conflict.local, conflict.remote) }); } catch (e) { handle(e); } };
  const importFile = async (file?: File) => {
    if (!file) return;
    try { const project = parseProject(await file.text()); const changed = await applyProject(project); onNotice(`Projeto importado (${changed} ajustes). Recarregando…`); setTimeout(() => window.location.reload(), 900); }
    catch (e) { onError(e instanceof Error ? e.message : 'Arquivo inválido.'); }
  };

  return <div className="device-sync">
    <p className="sync-explain"><ShieldCheck size={16} /> <span><strong>Seu backstage em qualquer tela:</strong> histórico de todas as fontes, ajustes, estúdio, favoritos, atalhos, premiações e metadados. Tudo cifrado neste aparelho. Crie uma chave, toque em Enviar e use a mesma chave em outro aparelho para Receber, sem importar suas músicas de novo. Chave de API e logins de streaming ficam neste aparelho. Áudio só se você ativar. O histórico é comprimido e compartilha a cota de 64 MB com os áudios; o envio é manual.</span></p>
    {!state ? <div className="sync-setup">
      {newKey ? <div className="sync-key-box"><span>Sua chave (guarde como uma senha; sem ela os dados na nuvem não podem ser lidos):</span><code>{newKey}</code>
        <div className="inline-actions"><button type="button" className="button small" onClick={() => { void navigator.clipboard?.writeText(newKey).then(() => onNotice('Chave copiada.')).catch(() => onError('Copie a chave manualmente.')); }}><Copy size={14} /><span>Copiar</span></button><button type="button" className="button small primary" onClick={() => { update({ key: newKey, revision: 0, lastSync: 0, includeAudio: false, pending: false }); setNewKey(''); }}><span>Guardei, continuar</span></button></div></div>
        : <button type="button" className="button primary" onClick={() => setNewKey(generateSyncKey())}><KeyRound size={16} /><span>Criar chave de sincronização</span></button>}
      <form className="sync-join" onSubmit={e => { e.preventDefault(); try { update({ key: normalizeSyncKey(draftKey), revision: 0, lastSync: 0, includeAudio: false, pending: false }); setDraftKey(''); } catch (err) { onError(err instanceof Error ? err.message : 'Chave inválida.'); } }}>
        <label>Já tem uma chave de outro aparelho?<input aria-label="Chave de sincronização" placeholder="XXXX-XXXX-XXXX-XXXX-…" value={draftKey} autoComplete="off" spellCheck={false} onChange={e => setDraftKey(e.target.value)} /></label>
        <button type="submit" className="button" disabled={!draftKey.trim()}>Usar chave</button>
      </form>
    </div> : <div className="sync-active">
      <div className="sync-meta"><strong>Chave ativa ····{state.key.slice(-4)}</strong><small>{state.lastSync ? `Última sincronização ${formatDateTimeBR(state.lastSync, timezone)} · revisão ${state.revision}` : 'Ainda não sincronizado neste aparelho'}{state.pending ? ' · envio pendente' : ''}</small>
        {remoteInfo && <small>Na nuvem: {remoteInfo.device || 'aparelho'} · {formatDateTimeBR(remoteInfo.updatedAt, timezone)} · áudio {(remoteInfo.usage / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de {Math.round(remoteInfo.quota / 1048576)} MB</small>}</div>
      
      <div className="inline-actions" style={{ marginBottom: 12 }}>
        <button type="button" className="button small" onClick={() => {
          const syncUrl = `${window.location.origin}/?sync=${state.key}`;
          void navigator.clipboard?.writeText(syncUrl).then(() => onNotice('Link copiado! Abra no tablet ou celular para sincronizar na hora.')).catch(() => onError('Copie a chave manualmente.'));
        }}><Link2 size={14} /><span>Copiar link para outro aparelho</span></button>
        <button type="button" className="button small" onClick={() => setShowQR(v => !v)}><QrCode size={14} /><span>{showQR ? 'Ocultar QR Code' : 'QR Code para tablet/celular'}</span></button>
      </div>

      {showQR && (
        <div className="sync-qr-box" style={{ display: 'grid', justifyItems: 'center', gap: 10, padding: 18, background: 'var(--surface-alt)', borderRadius: 18, margin: '12px 0', border: '1px solid var(--line)' }}>
          {qrImage ? <img src={qrImage} alt="QR Code de sincronização" width="200" height="200" style={{borderRadius:14, background:'white', padding:8}}/> : <p role="status">Criando QR Code neste aparelho…</p>}
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text)', textAlign: 'center', fontWeight: 600 }}>Aponte a câmera do seu celular ou tablet para abrir e sincronizar automaticamente.</p>
          <small style={{ color: 'var(--muted)', textAlign: 'center' }}>Não precisa digitar a chave: seus charts e preferências abrem prontinhos no novo aparelho.</small>
        </div>
      )}

      <label className="switch-row"><span>Incluir trechos de áudio<small>Envia seus arquivos de trilha cifrados (até 64 MB por chave). Pode gastar dados móveis.</small></span><input type="checkbox" role="switch" checked={state.includeAudio} onChange={e => update({ ...state, includeAudio: e.target.checked })} /></label>
      {busy ? <div className="catalog-progress" role="status"><MusicLoader size="sm" /><span>{busy}{progress ? ` ${Math.round(progress.sent / Math.max(1, progress.total) * 100)}%` : ''}</span>{progress && <progress max={progress.total || 1} value={progress.sent} />}<button type="button" className="button small" onClick={() => controller.current?.abort()}><Square size={13} /><span>Cancelar</span></button></div>
        : <div className="inline-actions"><button type="button" className="button primary" onClick={() => void push()}><CloudUpload size={16} /><span>Enviar deste aparelho</span></button><button type="button" className="button" onClick={() => void pull()}><CloudDownload size={16} /><span>Receber da nuvem</span></button></div>}
      {conflict && <div className="sync-conflict" role="alertdialog" aria-label="Conflito de sincronização"><strong>Outro aparelho salvou uma versão diferente (revisão {conflict.revision}).</strong><p>{conflict.changes} ajustes diferem. Nada foi apagado; escolha como continuar:</p>
        <div className="inline-actions"><button type="button" className="button small primary" onClick={mergeAndPush}>Mesclar (manter deste aparelho + novidades)</button><button type="button" className="button small" onClick={() => void push({ base: conflict.revision, project: conflict.local })}>Manter deste aparelho</button><button type="button" className="button small" onClick={() => void pull(conflict.remote, conflict.revision)}>Usar da nuvem</button></div></div>}
      <div className="inline-actions"><button type="button" className="text-button" onClick={() => { update(null); setRemoteInfo(null); onNotice('Chave removida deste aparelho. Seus dados locais continuam aqui.'); }}><LogOut size={14} /> Sair deste aparelho</button>
        <button type="button" className="text-button danger" onClick={async () => { if (!confirm('Apagar o projeto e os áudios desta chave na nuvem? Os dados deste aparelho não serão apagados.')) return; try { await deleteRemote(await account()); update({ ...state, revision: 0, lastSync: 0 }); setRemoteInfo(null); onNotice('Dados da nuvem apagados para esta chave.'); } catch (e) { handle(e); } }}><Trash2 size={14} /> Apagar da nuvem</button></div>
    </div>}
    {unavailable && <p className="alert" role="status">{unavailable} Enquanto isso, leve o projeto em arquivo.</p>}
    <div className="inline-actions sync-file"><button type="button" className="button small" onClick={() => void exportFile()}><FileDown size={15} /><span>Exportar projeto</span></button><label className="button small"><FileUp size={15} /><span>Importar projeto</span><input type="file" accept="application/json,.json" className="sr-only" aria-label="Importar arquivo de projeto" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label></div>
  </div>;
}
