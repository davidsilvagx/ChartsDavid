import { useState } from 'react';
import { Check, Copy, ExternalLink, Layers, Link2, RefreshCw, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import type { Settings, SourceFilter } from '../lib/types';
import {
  clearPlatformScrobbles,
  getSpotifyRedirectUri,
  mergePlatformScrobbles,
  parseSpotifyHistoryJSON,
  parseYouTubeMusicHistory,
  readSpotifyAccount,
  readYouTubeAccount,
  saveSpotifyAccount,
  saveYouTubeAccount,
  startSpotifyPKCE,
  startYouTubeOAuth,
  syncConnectedSpotify,
  type ConnectedPlatformAccount,
} from '../lib/platforms';
import { Modal, MusicLoader, number } from './UI';

export function PlatformLogo({
  platform,
  size = 16,
}: {
  platform: SourceFilter;
  size?: number;
}) {
  if (platform === 'spotify') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#1ED760" fillOpacity="0.18" stroke="#1ED760" strokeWidth="1.6" />
        <path d="M7.4 9.7c3.1-.95 6.6-.72 9.4.85" stroke="#1ED760" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M8.1 12.6c2.5-.72 5.25-.52 7.55.7" stroke="#1ED760" strokeWidth="1.55" strokeLinecap="round" />
        <path d="M8.9 15.3c1.95-.52 4.05-.36 5.8.54" stroke="#1ED760" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (platform === 'ytmusic') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#FF3B5C" fillOpacity="0.18" stroke="#FF3B5C" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="5.5" stroke="#FF3B5C" strokeOpacity="0.7" strokeWidth="1.2" />
        <path d="M10.4 9.5L15 12l-4.6 2.5V9.5Z" fill="#FF3B5C" />
      </svg>
    );
  }
  if (platform === 'lastfm') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#FB7185" fillOpacity="0.16" stroke="#FB7185" strokeWidth="1.6" />
        <path
          d="M6.8 14.5c-.9 0-1.6-.7-1.6-1.9 0-1.3.75-2.1 1.75-2.1.85 0 1.35.48 1.75 1.48l.55 1.35c.55 1.35 1.4 2.15 3.1 2.15 1.65 0 2.75-.75 2.75-1.95 0-1.1-.7-1.6-2.05-1.9l-.95-.2c-.8-.18-1.08-.45-1.08-.92 0-.52.45-.86 1.18-.86.78 0 1.22.3 1.45.88"
          stroke="#FB7185"
          strokeWidth="1.55"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (platform === 'streaming') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="9.5" cy="12" r="6.8" fill="#1ED760" fillOpacity="0.2" stroke="#1ED760" strokeWidth="1.5" />
        <circle cx="14.5" cy="12" r="6.8" fill="#FF3B5C" fillOpacity="0.2" stroke="#FF3B5C" strokeWidth="1.5" />
      </svg>
    );
  }
  return <Layers size={size} aria-hidden="true" />;
}

export function SourceFilterBar({
  value,
  counts,
  computing,
  onChange,
  onOpenConnect,
}: {
  value: SourceFilter;
  counts: Record<SourceFilter, number>;
  computing?: boolean;
  onChange: (next: SourceFilter) => void;
  onOpenConnect: () => void;
}) {
  const options: Array<{ id: SourceFilter; label: string; shortLabel: string }> = [
    { id: 'all', label: 'Todas', shortLabel: 'Todas' },
    { id: 'lastfm', label: 'Last.fm', shortLabel: 'Last.fm' },
    { id: 'spotify', label: 'Spotify', shortLabel: 'Spotify' },
    { id: 'ytmusic', label: 'YouTube Music', shortLabel: 'YT Music' },
    { id: 'streaming', label: 'Ambos (Spotify + YT)', shortLabel: 'Spotify + YT' },
  ];

  return (
    <div className="source-filter-bar" role="region" aria-label="Filtro por plataforma de música">
      <div className="source-pills" role="group" aria-label="Filtrar fonte dos charts">
        {options.map(opt => {
          const active = value === opt.id;
          const c = counts[opt.id];
          return (
            <button
              type="button"
              key={opt.id}
              className={`source-pill ${active ? 'active' : ''}`}
              aria-pressed={active}
              onClick={() => onChange(opt.id)}
            >
              <PlatformLogo platform={opt.id} size={15} />
              <span className="source-pill-label">{opt.shortLabel}</span>
              {c > 0 && <small className="source-count">{c > 9999 ? `${Math.round(c / 1000)}k` : number(c)}</small>}
            </button>
          );
        })}
      </div>

      <div className="source-bar-right">
        {computing && (
          <span className="computing-pill" role="status">
            <MusicLoader size="sm" />
            <span>Atualizando…</span>
          </span>
        )}
        <button type="button" className="chip-btn accent connect-platforms-btn" onClick={onOpenConnect}>
          <Link2 size={14} />
          <span>Conectar Spotify / YT Music</span>
        </button>
      </div>
    </div>
  );
}

export function PlatformsHub({
  settings,
  setSettings,
  counts,
  syncingLastfm,
  onSyncLastfm,
  onDataChanged,
  onNotice,
  onError,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  counts: Record<SourceFilter, number>;
  syncingLastfm: boolean;
  onSyncLastfm: () => void;
  onDataChanged: () => void;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [spotifyAcc, setSpotifyAcc] = useState<ConnectedPlatformAccount | null>(readSpotifyAccount);
  const [ytAcc, setYtAcc] = useState<ConnectedPlatformAccount | null>(readYouTubeAccount);
  const [busyPlatform, setBusyPlatform] = useState<'spotify' | 'ytmusic' | null>(null);
  const [showSpotifyOAuth, setShowSpotifyOAuth] = useState(false);
  const [showYtOAuth, setShowYtOAuth] = useState(false);
  const [spotifyClientDraft, setSpotifyClientDraft] = useState(
    settings.spotifyClientId || (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) || '',
  );
  const [googleClientDraft, setGoogleClientDraft] = useState(
    settings.googleClientId || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '',
  );
  const [copiedUri, setCopiedUri] = useState(false);

  const redirectUri = getSpotifyRedirectUri();

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleSpotifyFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusyPlatform('spotify');
    onError('');
    try {
      let allScrobbles = [];
      for (const file of Array.from(files)) {
        if (file.size > 120 * 1024 * 1024) throw new Error(`O arquivo ${file.name} excede 120 MB.`);
        const parsed = parseSpotifyHistoryJSON(await file.text());
        allScrobbles.push(...parsed);
      }
      if (!allScrobbles.length) {
        throw new Error('Nenhuma música válida (mínimo de 30s) foi encontrada nos arquivos do Spotify.');
      }
      const res = await mergePlatformScrobbles(settings, allScrobbles, 'spotify');
      const nextAcc: ConnectedPlatformAccount = spotifyAcc ?? {
        platform: 'spotify',
        id: 'spotify-history',
        displayName: 'Histórico Spotify',
        lastSyncedAt: Date.now(),
      };
      nextAcc.lastSyncedAt = Date.now();
      nextAcc.importedPlays = (nextAcc.importedPlays ?? 0) + res.addedPlays;
      saveSpotifyAccount(nextAcc);
      setSpotifyAcc({ ...nextAcc });
      onDataChanged();
      onNotice(
        `Spotify importado: ${number(res.addedPlays)} reproduções adicionadas em ${res.touchedWeeks} semanas${res.skippedBeforeStart ? ` (${number(res.skippedBeforeStart)} anteriores a ${settings.startDate} ignoradas)` : ''}.`,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Falha ao importar arquivo do Spotify.');
    } finally {
      setBusyPlatform(null);
    }
  };

  const handleYouTubeFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusyPlatform('ytmusic');
    onError('');
    try {
      const allScrobbles = [];
      for (const file of Array.from(files)) {
        if (file.size > 150 * 1024 * 1024) throw new Error(`O arquivo ${file.name} excede 150 MB.`);
        const parsed = parseYouTubeMusicHistory(await file.text(), file.name);
        allScrobbles.push(...parsed);
      }
      if (!allScrobbles.length) {
        throw new Error('Nenhuma reprodução do YouTube Music foi encontrada neste arquivo.');
      }
      const res = await mergePlatformScrobbles(settings, allScrobbles, 'ytmusic');
      const nextAcc: ConnectedPlatformAccount = ytAcc ?? {
        platform: 'ytmusic',
        id: 'ytmusic-history',
        displayName: 'YouTube Music',
        lastSyncedAt: Date.now(),
      };
      nextAcc.lastSyncedAt = Date.now();
      nextAcc.importedPlays = (nextAcc.importedPlays ?? 0) + res.addedPlays;
      saveYouTubeAccount(nextAcc);
      setYtAcc({ ...nextAcc });
      onDataChanged();
      onNotice(
        `YouTube Music importado: ${number(res.addedPlays)} reproduções adicionadas em ${res.touchedWeeks} semanas${res.skippedBeforeStart ? ` (${number(res.skippedBeforeStart)} anteriores a ${settings.startDate} ignoradas)` : ''}.`,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Falha ao importar histórico do YouTube Music.');
    } finally {
      setBusyPlatform(null);
    }
  };

  const handleConnectSpotifyOAuth = async () => {
    try {
      const cid = spotifyClientDraft.trim();
      if (!cid) {
        setShowSpotifyOAuth(true);
        onError('Cole o Client ID do seu app Spotify Developer (ou use Importar JSON ao lado).');
        return;
      }
      setSettings({ ...settings, spotifyClientId: cid });
      setBusyPlatform('spotify');
      await startSpotifyPKCE(cid);
    } catch (e) {
      setBusyPlatform(null);
      onError(e instanceof Error ? e.message : 'Falha ao iniciar conexão com o Spotify.');
    }
  };

  const handleRefreshSpotifyOAuth = async () => {
    setBusyPlatform('spotify');
    onError('');
    try {
      const { account, scrobbles } = await syncConnectedSpotify(spotifyClientDraft || settings.spotifyClientId);
      const res = await mergePlatformScrobbles(settings, scrobbles, 'spotify');
      setSpotifyAcc(account);
      onDataChanged();
      onNotice(`Spotify sincronizado (${account.displayName}): ${res.addedPlays} novas faixas adicionadas.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Falha ao atualizar Spotify.');
    } finally {
      setBusyPlatform(null);
    }
  };

  const handleConnectYouTubeOAuth = () => {
    const cid = googleClientDraft.trim();
    if (!cid) {
      setShowYtOAuth(true);
      onError('Cole o Google OAuth Client ID (ou importe o arquivo watch-history.json do Google Takeout).');
      return;
    }
    setSettings({ ...settings, googleClientId: cid });
    setBusyPlatform('ytmusic');
    startYouTubeOAuth(cid);
  };

  const handleClearPlatform = async (source: 'spotify' | 'ytmusic') => {
    setBusyPlatform(source);
    try {
      const removed = await clearPlatformScrobbles(settings, source);
      if (source === 'spotify') {
        saveSpotifyAccount(null);
        setSpotifyAcc(null);
      } else {
        saveYouTubeAccount(null);
        setYtAcc(null);
      }
      onDataChanged();
      onNotice(
        `${source === 'spotify' ? 'Spotify' : 'YouTube Music'} desconectado (${number(removed)} reproduções removidas do cache local).`,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Falha ao limpar plataforma.');
    } finally {
      setBusyPlatform(null);
    }
  };

  return (
    <div className="platforms-hub">
      {/* Card 1: Last.fm */}
      <article className="platform-card is-lastfm">
        <div className="platform-card-head">
          <span className="platform-icon-wrap">
            <PlatformLogo platform="lastfm" size={24} />
          </span>
          <div className="platform-meta">
            <div className="platform-title-row">
              <h3>Last.fm</h3>
              <span className={`platform-status ${counts.lastfm > 0 ? 'connected' : ''}`}>
                {counts.lastfm > 0 ? `${number(counts.lastfm)} plays` : `@${settings.user}`}
              </span>
            </div>
            <p>Sincronização direta da API oficial Last.fm (histórico completo desde 2016).</p>
          </div>
        </div>
        <div className="platform-actions">
          <button
            type="button"
            className={`button primary small ${syncingLastfm ? 'is-loading' : ''}`}
            disabled={syncingLastfm}
            onClick={onSyncLastfm}
          >
            {syncingLastfm ? <MusicLoader size="sm" tone="ink" /> : <RefreshCw size={14} />}
            <span>{syncingLastfm ? 'Sincronizando Last.fm…' : 'Sincronizar semanas recentes'}</span>
          </button>
          <a
            className="button small"
            href="https://www.last.fm/settings/applications"
            target="_blank"
            rel="noreferrer"
          >
            <span>Ponte Spotify → Last.fm</span>
            <ExternalLink size={13} />
          </a>
        </div>
      </article>

      {/* Card 2: Spotify */}
      <article className="platform-card is-spotify">
        <div className="platform-card-head">
          <span className="platform-icon-wrap">
            <PlatformLogo platform="spotify" size={24} />
          </span>
          <div className="platform-meta">
            <div className="platform-title-row">
              <h3>Spotify</h3>
              <span className={`platform-status ${counts.spotify > 0 || spotifyAcc ? 'connected' : ''}`}>
                {counts.spotify > 0
                  ? `${number(counts.spotify)} plays`
                  : spotifyAcc
                    ? spotifyAcc.displayName
                    : 'Disponível'}
              </span>
            </div>
            <p>
              Conecte via OAuth PKCE (faixas recentes) ou importe seu pacote oficial{' '}
              <code>StreamingHistory_music.json</code> para montar anos inteiros de charts.
            </p>
          </div>
        </div>

        <div className="platform-actions">
          <label className={`button primary small file-button ${busyPlatform === 'spotify' ? 'is-loading disabled' : ''}`}>
            {busyPlatform === 'spotify' ? <MusicLoader size="sm" tone="ink" /> : <Upload size={14} />}
            <span>{busyPlatform === 'spotify' ? 'Processando Spotify…' : 'Importar JSON Spotify'}</span>
            <input
              type="file"
              accept="application/json,.json"
              multiple
              disabled={busyPlatform !== null}
              onChange={e => {
                void handleSpotifyFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>

          {spotifyAcc?.accessToken ? (
            <button
              type="button"
              className="button small"
              disabled={busyPlatform !== null}
              onClick={() => void handleRefreshSpotifyOAuth()}
            >
              <RefreshCw size={14} />
              <span>Atualizar OAuth ({spotifyAcc.displayName})</span>
            </button>
          ) : (
            <button
              type="button"
              className="button small"
              disabled={busyPlatform !== null}
              onClick={() => setShowSpotifyOAuth(v => !v)}
            >
              <SlidersHorizontal size={14} />
              <span>Conectar conta OAuth</span>
            </button>
          )}

          {(counts.spotify > 0 || spotifyAcc) && (
            <button
              type="button"
              className="icon-button"
              title="Desconectar e limpar dados do Spotify"
              aria-label="Desconectar e limpar dados do Spotify"
              disabled={busyPlatform !== null}
              onClick={() => void handleClearPlatform('spotify')}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>

        {showSpotifyOAuth && (
          <div className="oauth-drawer">
            <label>
              Spotify Client ID (PKCE sem servidor)
              <input
                value={spotifyClientDraft}
                onChange={e => setSpotifyClientDraft(e.target.value)}
                placeholder="Ex: 4a8b1c9d0e2f3a4b5c6d7e8f9a0b1c2d"
                autoComplete="off"
              />
              <small>
                Crie gratuitamente em{' '}
                <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                  developer.spotify.com/dashboard
                </a>{' '}
                e adicione a Redirect URI abaixo:
              </small>
            </label>
            <div className="redirect-uri-box">
              <code>{redirectUri}</code>
              <button type="button" className="button small" onClick={() => void copyRedirect()}>
                {copiedUri ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedUri ? 'Copiado' : 'Copiar URI'}</span>
              </button>
            </div>
            <button
              type="button"
              className="button primary small"
              disabled={busyPlatform !== null}
              onClick={() => void handleConnectSpotifyOAuth()}
            >
              <span>Autorizar no Spotify</span>
              <ExternalLink size={13} />
            </button>
          </div>
        )}
      </article>

      {/* Card 3: YouTube Music */}
      <article className="platform-card is-ytmusic">
        <div className="platform-card-head">
          <span className="platform-icon-wrap">
            <PlatformLogo platform="ytmusic" size={24} />
          </span>
          <div className="platform-meta">
            <div className="platform-title-row">
              <h3>YouTube Music</h3>
              <span className={`platform-status ${counts.ytmusic > 0 || ytAcc ? 'connected' : ''}`}>
                {counts.ytmusic > 0
                  ? `${number(counts.ytmusic)} plays`
                  : ytAcc
                    ? ytAcc.displayName
                    : 'Disponível'}
              </span>
            </div>
            <p>
              Importe seu histórico do Google Takeout (<code>watch-history.json</code> /{' '}
              <code>histórico-de-visualização.json</code> ou CSV) ou conecte via Google OAuth.
            </p>
          </div>
        </div>

        <div className="platform-actions">
          <label className={`button primary small file-button ${busyPlatform === 'ytmusic' ? 'is-loading disabled' : ''}`}>
            {busyPlatform === 'ytmusic' ? <MusicLoader size="sm" tone="ink" /> : <Upload size={14} />}
            <span>{busyPlatform === 'ytmusic' ? 'Processando YT Music…' : 'Importar Takeout / CSV'}</span>
            <input
              type="file"
              accept="application/json,.json,.csv,text/csv"
              multiple
              disabled={busyPlatform !== null}
              onChange={e => {
                void handleYouTubeFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </label>

          <button
            type="button"
            className="button small"
            disabled={busyPlatform !== null}
            onClick={() => setShowYtOAuth(v => !v)}
          >
            <SlidersHorizontal size={14} />
            <span>Google OAuth / Scrobbler</span>
          </button>

          {(counts.ytmusic > 0 || ytAcc) && (
            <button
              type="button"
              className="icon-button"
              title="Desconectar e limpar dados do YouTube Music"
              aria-label="Desconectar e limpar dados do YouTube Music"
              disabled={busyPlatform !== null}
              onClick={() => void handleClearPlatform('ytmusic')}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>

        {showYtOAuth && (
          <div className="oauth-drawer">
            <label>
              Google OAuth Client ID (YouTube Data API v3)
              <input
                value={googleClientDraft}
                onChange={e => setGoogleClientDraft(e.target.value)}
                placeholder="Ex: 123456789-abc.apps.googleusercontent.com"
                autoComplete="off"
              />
              <small>
                Adicione <code>{redirectUri}</code> como URI de redirecionamento autorizado no Google Cloud Console, ou use{' '}
                <a href="https://takeout.google.com/" target="_blank" rel="noreferrer">
                  Google Takeout (YouTube e YouTube Music)
                </a>{' '}
                para exportar o histórico completo em JSON.
              </small>
            </label>
            <div className="platform-actions">
              <button
                type="button"
                className="button primary small"
                disabled={busyPlatform !== null}
                onClick={handleConnectYouTubeOAuth}
              >
                <span>Conectar com Google</span>
                <ExternalLink size={13} />
              </button>
              <a className="button small" href="https://web-scrobbler.com/" target="_blank" rel="noreferrer">
                <span>Web Scrobbler (PC)</span>
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        )}
      </article>
    </div>
  );
}

export function PlatformsModal({
  settings,
  setSettings,
  counts,
  sourceFilter,
  onSelectFilter,
  syncingLastfm,
  onSyncLastfm,
  onDataChanged,
  onNotice,
  onError,
  onClose,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  counts: Record<SourceFilter, number>;
  sourceFilter: SourceFilter;
  onSelectFilter: (f: SourceFilter) => void;
  syncingLastfm: boolean;
  onSyncLastfm: () => void;
  onDataChanged: () => void;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Conexões & Fontes de Streaming"
      subtitle="Conecte ou importe Last.fm, Spotify e YouTube Music e filtre seus rankings isolados ou combinados."
      onClose={onClose}
      wide
    >
      <div className="modal-source-preview">
        <span className="eyebrow">FILTRO ATIVO NOS CHARTS</span>
        <div className="source-pills modal-pills" role="group" aria-label="Escolher filtro de plataforma">
          {(
            [
              { id: 'all', label: 'Todas combinadas' },
              { id: 'lastfm', label: 'Só Last.fm' },
              { id: 'spotify', label: 'Só Spotify' },
              { id: 'ytmusic', label: 'Só YouTube Music' },
              { id: 'streaming', label: 'Ambos (Spotify + YT)' },
            ] as const
          ).map(opt => (
            <button
              type="button"
              key={opt.id}
              className={`source-pill ${sourceFilter === opt.id ? 'active' : ''}`}
              aria-pressed={sourceFilter === opt.id}
              onClick={() => onSelectFilter(opt.id)}
            >
              <PlatformLogo platform={opt.id} size={15} />
              <span>{opt.label}</span>
              {counts[opt.id] > 0 && <small className="source-count">{number(counts[opt.id])}</small>}
            </button>
          ))}
        </div>
        <p className="muted small-text">
          No modo combinado, músicas ouvidas simultaneamente no Spotify/YT Music e enviadas ao Last.fm (±3 min) são deduplicadas automaticamente para nunca dobrar contagens.
        </p>
      </div>

      <PlatformsHub
        settings={settings}
        setSettings={setSettings}
        counts={counts}
        syncingLastfm={syncingLastfm}
        onSyncLastfm={onSyncLastfm}
        onDataChanged={onDataChanged}
        onNotice={onNotice}
        onError={onError}
      />
    </Modal>
  );
}
