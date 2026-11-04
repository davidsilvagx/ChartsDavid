import { grammyById } from './grammy';
import { normalize } from './charts';
import { sanitizeBallot } from './ballot';
import type { Item } from './types';

export interface AwardMention { key: string; period: string; category: string; official: string; result: 'win' | 'nominee'; method: string; via: 'obra' | 'artista'; work?: string }
/**
 * Prêmios pessoais de um item em todas as edições salvas deste perfil (vitórias e indicações).
 * Para artistas, inclui as músicas e álbuns dele que ganharam ou foram indicados.
 */
export function personalAwards(item: Pick<Item, 'id' | 'name' | 'artist'>, profile: string, storage: Storage = localStorage): AwardMention[] {
  const prefix = `lastchart-awards:v1:${profile.trim().toLowerCase()}:`;
  const isArtist = item.id.startsWith('["artists"');
  const out: AwardMention[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const period = key.slice(prefix.length).split(':').slice(1).join(':') || 'all';
    let ballot; try { ballot = sanitizeBallot(JSON.parse(storage.getItem(key) ?? 'null'), profile, period); } catch { continue; }
    for (const entry of Object.values(ballot.entries)) {
      const category = grammyById.get(entry.categoryId); if (!category) continue;
      for (const n of entry.nominees) {
        const own = n.id === item.id, byArtist = isArtist && n.kind !== 'artists' && normalize(n.artist) === normalize(item.artist);
        if (!own && !byArtist) continue;
        out.push({ key: `${key}:${entry.categoryId}:${n.id}`, period: period === 'all' ? 'Todo o histórico' : period, category: category.label, official: category.official, result: entry.winners.includes(n.id) ? 'win' : 'nominee', method: entry.method === 'jury' ? 'júri' : entry.method === 'suggestion' ? 'sugestão aceita' : 'voto pessoal', via: own ? 'obra' : 'artista', work: own ? undefined : n.name });
      }
    }
  }
  return out.sort((a, b) => (a.result === b.result ? b.period.localeCompare(a.period) : a.result === 'win' ? -1 : 1));
}
