import { useEffect, useState, type CSSProperties } from "react";
import {
  BadgeCheck,
  Crown,
  Gem,
  Disc3,
  Flame,
  Heart,
  Mic2,
  Moon,
  Music2,
  Orbit,
  Radio,
  Sparkles,
  Ticket,
  Zap,
} from "lucide-react";
import { artistPhoto, peekArtistPhoto } from "../lib/artistPhoto";
import type { Mission } from "../lib/missions";

export const missionProgress = (m: Mission) =>
  Math.max(0, Math.min(100, m.target > 0 ? (m.value / m.target) * 100 : 0));
export function MissionSeal({
  mission: m,
  compact = false,
}: {
  mission: Mission;
  compact?: boolean;
}) {
  const [photo, setPhoto] = useState(() =>
    m.artArtist ? peekArtistPhoto(m.artArtist) : "",
  );
  useEffect(() => {
    let active = true;
    setPhoto(m.artArtist ? peekArtistPhoto(m.artArtist) : "");
    if (m.artArtist)
      void artistPhoto(m.artArtist).then((url) => {
        if (active) setPhoto(url);
      });
    return () => {
      active = false;
    };
  }, [m.artArtist]);
  const progress = missionProgress(m),
    hash = [...m.id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  const Icon = [
    Disc3,
    Flame,
    Heart,
    Mic2,
    Moon,
    Music2,
    Orbit,
    Radio,
    Sparkles,
    Ticket,
    Zap,
  ][hash % 11];
  const art = (
    <>
      <span className="seal-orbit" />
      <span className="seal-spark one">✦</span>
      <span className="seal-spark two">✧</span>
      {photo ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setPhoto("")}
        />
      ) : (
        <Icon size={compact ? 30 : 56} strokeWidth={1.4} />
      )}
      <span className="seal-index">
        {m.level === 4 ? "POP QUEST" : ["I", "II", "III", "IV"][m.level]}
      </span>
    </>
  );
  return (
    <div
      className={`collectible-seal seal-tier-${m.level} ${compact ? "compact" : ""} ${progress === 100 ? "complete" : ""}`}
      style={
        {
          "--seal-hue": `${hash % 360}`,
          "--seal-progress": `${progress}%`,
        } as CSSProperties
      }
      role="img"
      aria-label={`${photo && m.artArtist ? `Foto de ${m.artArtist}, ` : "Ilustração da missão, "}${Math.floor(progress)}% colorido${progress === 100 ? ", selo dourado de conquista desbloqueada" : ""}`}
    >
      <div className="seal-art seal-monochrome" aria-hidden="true">
        {art}
      </div>
      <div className="seal-art seal-color" aria-hidden="true">
        {art}
      </div>
      <span className="seal-tier-emblem" aria-hidden="true">{m.level === 3 ? <Gem size={compact ? 13 : 22}/> : m.level === 2 ? <Crown size={compact ? 13 : 22}/> : m.level === 1 ? '✦ ✦' : m.level === 0 ? '★' : '✧'}</span>
      {!compact && <span className="seal-tier-name" aria-hidden="true">{['BRONZE','PRATA','OURO','DIAMANTE','POP QUEST'][m.level]}</span>}
      {progress === 100 && (
        <span className="seal-gold" aria-hidden="true">
          <BadgeCheck size={compact ? 18 : 24} />
        </span>
      )}
    </div>
  );
}
