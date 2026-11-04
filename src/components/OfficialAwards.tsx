import { useEffect, useState } from 'react';
import { Award, ExternalLink } from 'lucide-react';
import { fetchCareer, type CareerInfo, type GrammyEntry } from '../lib/career';
import type { Item } from '../lib/types';
import { MusicLoader } from './UI';

const line = (g: GrammyEntry) => `${g.year ?? 's/ano'} · ${g.label}`;
/** Grammys oficiais (Wikidata) e carreira (MusicBrainz) na tela do item. */
export function OfficialAwards({ item }: { item: Pick<Item, 'id' | 'name' | 'artist'> }) {
  const [info, setInfo] = useState<CareerInfo | null>(null), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true; setLoading(true); setInfo(null);
    void fetchCareer(item).then(r => { if (active) setInfo(r); }).catch(() => { if (active) setInfo({ status: 'error' }); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [item.id]);
  const isArtist = item.id.startsWith('["artists"');
  if (loading) return <div className="official-awards" role="status"><MusicLoader size="sm" /><span>Consultando carreira e Grammys oficiais (MusicBrainz e Wikidata)…</span></div>;
  const choose = (mbid: string) => { setLoading(true); void fetchCareer(item, mbid).then(setInfo).catch(() => setInfo({ status: 'error' })).finally(() => setLoading(false)); };
  if (info?.status === 'ambiguous') return <div className="official-awards"><h5><Award size={15} /> Qual destes é {item.artist}?</h5><small>Há artistas com o mesmo nome nas fontes públicas. Escolha o certo para ver carreira e Grammys; a escolha fica salva neste aparelho.</small><div className="ambiguous-list">{(info.candidates ?? []).map(c => <button key={c.id} type="button" className="button small" onClick={() => choose(c.id)}><span>{c.name}{c.disambiguation ? ` · ${c.disambiguation}` : ''}</span></button>)}</div></div>;
  if (!info || info.status !== 'matched') return <div className="official-awards"><small className="note">{info?.status === 'not-found' ? 'Artista não encontrado nas fontes públicas (MusicBrainz).' : info?.message ?? 'Fontes públicas indisponíveis agora. Tente mais tarde.'}</small></div>;
  const a = info.grammys?.artist, w = info.grammys?.work;
  return <div className="official-awards">
    <h5><Award size={15} /> Grammys oficiais {isArtist ? `de ${info.artist?.name}` : ''}</h5>
    {!isArtist && (w ? <p className={w.wins.length ? 'work-win' : ''}>{w.wins.length ? <>Esta obra venceu: <strong>{w.wins.map(line).join(' · ')}</strong></> : `Indicada: ${w.nominations.map(line).join(' · ')}`}</p> : <p className="note">Nenhum Grammy registrado para esta obra no Wikidata.</p>)}
    {info.grammys?.available === false ? <p className="note">Wikidata indisponível agora; carreira exibida pelo MusicBrainz.</p> : a && (a.wins.length || a.nominations.length) ? <>
      <div className="achievement-chips"><span className="gold">{a.wins.length} {a.wins.length === 1 ? 'vitória' : 'vitórias'}</span><span>{a.nominations.length} {a.nominations.length === 1 ? 'indicação' : 'indicações'} sem vitória</span></div>
      <ul className="official-list">{a.wins.slice(0, 6).map(g => <li key={`${g.label}${g.year}`}>{line(g)}</li>)}</ul>
    </> : <p className="note">{isArtist ? 'Nenhuma vitória ou indicação ao Grammy registrada no Wikidata.' : `${info.artist?.name}: nenhuma vitória ou indicação registrada.`}</p>}
    <small>Carreira: primeiro lançamento em {info.career?.firstRelease ? new Date(`${info.career.firstRelease.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'} · {info.career?.albums ?? 0} {info.career?.albums === 1 ? "álbum" : "álbuns"} de estúdio. Fontes públicas e colaborativas (podem estar incompletas):{' '}
      {info.sources?.musicbrainz && <a href={info.sources.musicbrainz} target="_blank" rel="noreferrer">MusicBrainz <ExternalLink size={11} /></a>}{info.sources?.wikidata && <> · <a href={info.sources.wikidata} target="_blank" rel="noreferrer">Wikidata <ExternalLink size={11} /></a></>}</small>
  </div>;
}
