import { BarChart3, CalendarCheck2, Clock3, Crown, Palette, TrendingUp } from 'lucide-react';
import type { JudgeId } from '../lib/jury';

/** Cor de cada perfil derivada do código (estável), sempre dentro da paleta verde/ciano/dourado do app. */
const hues: Record<string, number> = { F: 150, X: 195 };
export function personaHue(code: string) { return (hues[code[0]] ?? 160) + (code[1] === 'N' ? 0 : 22) + (code[2] === 'R' ? 0 : -14) + (code[3] === 'A' ? 0 : 8); }

/** Brasão original: quatro símbolos, um por eixo, em volta de um disco. */
export function PersonaCrest({ code, size = 132, animate = true, title }: { code: string; size?: number; animate?: boolean; title?: string }) {
  const hue = personaHue(code), id = `crest-${code}-${size}`;
  const glyph = (letter: string) => {
    switch (letter) {
      case 'F': return <g><circle r="9" fill="none" stroke="currentColor" strokeWidth="2.4" /><circle r="4" fill="currentColor" /></g>;
      case 'X': return <g fill="currentColor"><circle cx="-6" cy="-5" r="2.6" /><circle cx="6" cy="-6" r="2" /><circle cx="0" cy="6" r="3" /><circle cx="8" cy="5" r="1.6" /><circle cx="-8" cy="6" r="1.4" /></g>;
      case 'N': return <path d="M0-10 2.6-2.6 10 0 2.6 2.6 0 10-2.6 2.6-10 0-2.6-2.6Z" fill="currentColor" />;
      case 'T': return <path d="M-7-10h14M-7 10h14M-5-10c0 6 10 6 10 10s-10 4-10 10M5-10c0 6-10 6-10 10s10 4 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" transform="scale(.9)" />;
      case 'R': return <path d="M-8 2a8 8 0 0 1 13.5-6M8-2A8 8 0 0 1-5.5 4M5.5-8.5V-4H1M-5.5 8.5V4H-1" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />;
      case 'V': return <path d="M-9-6h4l10 12h4M-9 6h4l10-12h4M6-9l3 3-3 3M6 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />;
      case 'A': return <g><circle r="10" fill="currentColor" opacity=".9" /><circle r="6" fill="none" stroke={`hsl(${hue} 60% 12%)`} strokeWidth="1" opacity=".7" /><circle r="2.4" fill={`hsl(${hue} 60% 12%)`} /></g>;
      default: return <path d="M3-11v13.5a4.5 4.5 0 1 1-2.5-4V-11h8v4.5H3" fill="currentColor" />;
    }
  };
  const spots: Array<[number, number]> = [[0, -38], [38, 0], [0, 38], [-38, 0]];
  return <svg className={`persona-crest ${animate ? 'is-animated' : ''}`} width={size} height={size} viewBox="-64 -64 128 128" role="img" aria-label={title ?? `Emblema do perfil ${code}`}>
    <defs>
      <radialGradient id={`${id}-bg`} cx="35%" cy="30%" r="80%"><stop offset="0" stopColor={`hsl(${hue} 85% 62%)`} /><stop offset=".55" stopColor={`hsl(${hue + 20} 70% 32%)`} /><stop offset="1" stopColor={`hsl(${hue + 30} 60% 12%)`} /></radialGradient>
      <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f5c451" /><stop offset="1" stopColor={`hsl(${hue} 80% 60%)`} /></linearGradient>
    </defs>
    <circle className="crest-halo" r="62" fill={`hsl(${hue} 80% 55%)`} opacity=".18" />
    <circle className="crest-disc" r="56" fill={`url(#${id}-bg)`} stroke={`url(#${id}-ring)`} strokeWidth="3" />
    <circle r="44" fill="none" stroke="#fff" strokeOpacity=".12" strokeDasharray="2 5" />
    <circle r="16" fill="#05080e" fillOpacity=".55" stroke="#fff" strokeOpacity=".2" />
    <text y="5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" fontFamily="Plus Jakarta Sans, sans-serif" letterSpacing="1">{code.slice(0, 2)}</text>
    {code.split('').map((letter, i) => <g key={i} className="crest-glyph" style={{ animationDelay: `${220 + i * 110}ms` }} transform={`translate(${spots[i][0]} ${spots[i][1]})`} color="#fff"><circle r="15" fill="#05080e" fillOpacity=".42" />{glyph(letter)}</g>)}
  </svg>;
}

const jurorIcons: Record<JudgeId, typeof BarChart3> = { volume: BarChart3, time: Clock3, top: Crown, steady: CalendarCheck2, rise: TrendingUp, style: Palette };
const jurorHue: Record<JudgeId, number> = { volume: 150, time: 195, top: 42, steady: 170, rise: 125, style: 280 };
/** Avatar do jurado: retrato abstrato com o símbolo do critério. */
export function JurorAvatar({ id, size = 34 }: { id: JudgeId; size?: number }) {
  const Icon = jurorIcons[id], hue = jurorHue[id];
  return <span className="juror-avatar" style={{ width: size, height: size, background: `radial-gradient(circle at 30% 25%, hsl(${hue} 85% 62%), hsl(${hue + 15} 65% 26%))` }} aria-hidden="true"><Icon size={Math.round(size * 0.5)} strokeWidth={2.2} /></span>;
}
