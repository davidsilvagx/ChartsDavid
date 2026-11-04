import type { RevealCard } from './ballot';
import { judges, type JudgeVote } from './jury';
import type { ChartWeek } from './types';

/**
 * “Imprensa LastChart”: manchetes e comentários fictícios, escritos SÓ com números reais do seu histórico.
 * Servem para brincar de indústria musical; nada aqui é notícia real nem opinião de pessoas reais.
 */
const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const pick = <T,>(list: T[], seed: number) => list[Math.abs(seed) % list.length];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

export function juryQuote(vote: JudgeVote, card: RevealCard): string {
  const winner = card.winners[0], name = (id: string) => card.nominees.find(x => x.id === id)?.name ?? '—';
  if (vote.abstain) return pick(['“Prefiro não opinar sem números completos.”', '“Sem dados para todos, eu me abstenho.”', '“Fico de fora desta: faltou informação.”'], hash(vote.judge + card.category.id));
  const mine = vote.ranking[0], score = vote.scores[winner.id], top = vote.scores[mine], agrees = mine === winner.id;
  const lines: Record<string, (v: number) => string[]> = {
    volume: v => [`“${n(v)} reproduções. Não tem como discutir com a plateia.”`, `“O público votou com o play: ${n(v)} vezes.”`],
    time: v => [`“${n(v / 3600000)} horas de escuta estimada. Isso é devoção.”`, `“Medi o tempo: ${n(v / 60000)} minutos de pura entrega.”`],
    top: v => [`“Pontuação de chart ${n(v)}. O topo tem dono.”`, `“Semanas em #1 e no Top 10 falam por si: ${n(v)} pontos.”`],
    steady: v => [`“Esteve presente em ${n(v)} semanas. Constância vence.”`, `“Nunca saiu de cena: ${n(v)} semanas seguidas no seu fone.”`],
    rise: v => [v > 0 ? `“Cresceu ${n(v)} plays da primeira para a segunda metade. Fenômeno em ascensão.”` : `“A curva caiu, mas a história pesa.”`],
    style: v => [v ? '“É exatamente o gênero da categoria. Coerência total.”' : '“Fora do gênero, mas o conjunto convenceu.”'],
  };
  if (agrees) return pick(lines[vote.judge]?.(score) ?? ['“Meu voto foi para o vencedor.”'], hash(vote.judge + winner.id));
  return pick([`“Meu voto foi para ${name(mine)} (${n(top)}), mas respeito o resultado.”`, `“Votei em ${name(mine)}. Fui voto vencido.”`], hash(vote.judge + mine));
}

export const judgeName = (id: string) => judges.find(j => j.id === id)?.name ?? id;

export interface Headline { id: string; title: string; dek: string; tone: 'gold' | 'green' | 'cyan' }
export function ceremonyHeadlines(cards: RevealCard[]): Headline[] {
  const out: Headline[] = [];
  const byArtist = new Map<string, string[]>();
  for (const c of cards) for (const w of c.winners) byArtist.set(w.artist, [...(byArtist.get(w.artist) ?? []), c.category.label]);
  const [artist, wins] = [...byArtist].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  if (artist && wins.length >= 2) out.push({ id: 'sweep', tone: 'gold', title: `${artist} domina a noite com ${wins.length} gramofones`, dek: `Levou ${wins.slice(0, 3).join(', ')}${wins.length > 3 ? ' e mais' : ''}.` });
  for (const c of cards) {
    if (!c.jury) continue;
    const ranked = Object.entries(c.jury.totals).sort((a, b) => b[1] - a[1]);
    const w = c.winners[0];
    if (ranked.length > 1 && ranked[0][1] - ranked[1][1] <= 1) out.push({ id: `close-${c.category.id}`, tone: 'cyan', title: `Decisão apertada em ${c.category.label}`, dek: `${w.name} venceu por ${n(ranked[0][1] - ranked[1][1])} ponto(s) de diferença no júri.` });
    const mostPlayed = [...c.nominees].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0))[0];
    if (mostPlayed && mostPlayed.id !== w.id && (mostPlayed.plays ?? 0) > (w.plays ?? 0)) out.push({ id: `upset-${c.category.id}`, tone: 'green', title: `Zebra! ${w.name} supera ${mostPlayed.name}`, dek: `Mesmo com ${n(w.plays ?? 0)} contra ${n(mostPlayed.plays ?? 0)} reproduções, o júri preferiu constância e chart.` });
    const unanimous = c.jury.judges.filter(v => !v.abstain);
    if (unanimous.length >= 3 && unanimous.every(v => v.ranking[0] === w.id)) out.push({ id: `unanimous-${c.category.id}`, tone: 'gold', title: `Unanimidade: ${w.name} leva ${c.category.label}`, dek: `Todos os ${unanimous.length} jurados que votaram escolheram o mesmo vencedor.` });
  }
  return out.slice(0, 6);
}

export function weekHeadlines(week: ChartWeek | undefined, previous: ChartWeek | undefined): Headline[] {
  if (!week || week.status !== 'loaded' || !week.entries.length) return [];
  const out: Headline[] = [];
  const top = week.entries[0];
  const wasTop = previous?.status === 'loaded' && previous.entries[0]?.id === top.id;
  if (!wasTop) out.push({ id: 'new-one', tone: 'gold', title: top.change === 'NEW' ? `${top.name} estreia direto no #1` : `${top.name} chega ao topo`, dek: `${top.artist} lidera a semana ${week.number} com ${n(top.plays)} reproduções.` });
  else if ((top.weeksAtOne ?? 0) >= 2) out.push({ id: 'reign', tone: 'gold', title: `${top.name} segura o #1 pela ${top.weeksAtOne}ª semana`, dek: `Reinado de ${top.artist} continua com ${n(top.plays)} reproduções.` });
  const jump = week.entries.filter(e => typeof e.change === 'number' && e.change > 0).sort((a, b) => Number(b.change) - Number(a.change))[0];
  if (jump && Number(jump.change) >= 10) out.push({ id: 'jump', tone: 'green', title: `${jump.name} dispara ${jump.change} posições`, dek: `Agora em #${jump.rank}; pico pessoal #${jump.peak}.` });
  const debut = week.entries.find(e => e.change === 'NEW' && e.rank > 1 && e.rank <= 10);
  if (debut) out.push({ id: 'debut', tone: 'cyan', title: `${debut.name} estreia no Top 10`, dek: `Entra em #${debut.rank} com ${n(debut.plays)} reproduções.` });
  const comeback = week.entries.filter(e => e.change === 'RE' && (e.hiatusWeeks ?? 0) >= 8).sort((a, b) => (b.hiatusWeeks ?? 0) - (a.hiatusWeeks ?? 0))[0];
  if (comeback) out.push({ id: 'comeback', tone: 'green', title: `Retorno triunfal: ${comeback.name}`, dek: `Volta ao chart em #${comeback.rank} depois de ${comeback.hiatusWeeks} semanas fora.` });
  const artistCount = new Map<string, number>();
  for (const e of week.entries.slice(0, 10)) artistCount.set(e.artist, (artistCount.get(e.artist) ?? 0) + 1);
  const [dominant, count] = [...artistCount].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (dominant && count >= 3) out.push({ id: 'dominant', tone: 'cyan', title: `${dominant} ocupa ${count} lugares do Top 10`, dek: 'Domínio raro na sua parada desta semana.' });
  return out.slice(0, 4);
}
