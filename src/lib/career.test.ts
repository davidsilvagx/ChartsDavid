import { describe, expect, it } from 'vitest';
import { handleCareer, pickArtist, summarizeGrammys, summarizeReleaseGroups } from '../../server/career.mjs';
import { newArtistCheck, type Eligibility } from './ballot';
import type { EffectiveMeta } from './metadata';

describe('Carreira e Grammys oficiais', () => {
  it('só associa nome exato; dois exatos empatados = ambíguo', () => {
    expect(pickArtist([{ id: '1', name: 'Lady Gaga', score: 100 }, { id: '2', name: 'Lady Gagas', score: 80 }], 'lady gaga')).toMatchObject({ status: 'matched', artist: { id: '1' } });
    expect(pickArtist([{ id: '1', name: 'Jade', score: 100 }, { id: '2', name: 'Jade', score: 100 }], 'Jade').status).toBe('ambiguous');
    expect(pickArtist([{ id: '1', name: 'Outro', score: 100 }], 'FLO').status).toBe('not-found');
    expect(pickArtist([{ id: '9', name: 'Beyoncé Knowles', aliases: [{ name: 'Beyonce' }], score: 100 }], 'Beyoncé').status).toBe('matched');
    expect(pickArtist([{ id: 'alias', name: 'Miley Cyrus', score: 100, disambiguation: '7FORM alias' }, { id: 'real', name: 'MILEY', score: 82, type: 'Person', country: 'US', aliases: [{ name: 'Miley Cyrus' }] }], 'Miley Cyrus')).toMatchObject({ artist: { id: 'real' } });
  });
  it('carreira: primeiro lançamento e álbuns de estúdio (sem compilações/ao vivo)', () => {
    expect(summarizeReleaseGroups([
      { title: 'Debut', 'primary-type': 'Album', 'secondary-types': [], 'first-release-date': '2008-08-19' },
      { title: 'Live', 'primary-type': 'Album', 'secondary-types': ['Live'], 'first-release-date': '2009-01-01' },
      { title: 'Single', 'primary-type': 'Single', 'secondary-types': [], 'first-release-date': '2008-04-08' },
    ])).toEqual({ firstRelease: '2008-04-08', albums: 1 });
  });
  it('Grammys: filtra pelo nome oficial em inglês e separa vitórias e indicações', () => {
    const r = (award: string, en: string, kind: string, date?: string, pt?: string) => ({ entity: { value: 'https://www.wikidata.org/entity/Q1' }, award: { value: award }, en: { value: en }, kind: { value: kind }, ...(date ? { date: { value: date } } : {}), ...(pt ? { pt: { value: pt } } : {}) });
    const g = summarizeGrammys([r('Q2', 'Grammy Award for Album of the Year', 'win', '2021-03-14T00:00:00Z', 'Prêmio Grammy de Álbum do Ano'), r('Q3', 'MTV Video Music Award', 'win', '2020-01-01'), r('Q4', 'Grammy Award for Best New Artist', 'nomination', '2009-01-01')]);
    expect(g.wins).toEqual([{ kind: 'win', label: 'Álbum do Ano', year: 2021 }]);
    expect(g.nominations[0]).toMatchObject({ year: 2009 });
    expect(g.entity).toMatch(/Q1/);
  });
  it('Artista Revelação: quem já concorreu ao Grammy ou estreou cedo (MusicBrainz) fica de fora', () => {
    const rules: Eligibility = { mode: 'release', start: 0, end: 1, year: 2026 };
    const rec = (extra: Partial<EffectiveMeta>) => ({ key: '', kind: 'artists', artist: 'A', name: 'A', album: '', status: 'matched', source: 'itunes', fetchedAt: 1, versions: [], reviewed: false, ...extra }) as EffectiveMeta;
    expect(newArtistCheck(rec({ firstRelease: '2025-01-01', albumCount: 1, grammyYears: [2024] }), rules)).toMatchObject({ ok: false });
    expect(newArtistCheck(rec({ firstRelease: '2025-01-01', albumCount: 1, mbFirstRelease: '2012-05-01' }), rules).ok).toBe(false);
    expect(newArtistCheck(rec({ firstRelease: '2025-01-01', albumCount: 1, mbFirstRelease: '2024-05-01', grammyYears: [2026] }), rules)).toMatchObject({ ok: true });
  });
  it('rota valida entrada e trata falha das fontes', async () => {
    expect((await handleCareer(new Request('http://x/api/career'))).status).toBe(400);
    const down = async () => new Response('x', { status: 500 });
    expect((await handleCareer(new Request('http://x/api/career?artist=FLO'), down as typeof fetch)).status).toBe(502);
  });
});
