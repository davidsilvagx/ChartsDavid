/**
 * Catálogo de referência das 100 categorias competitivas da 69ª edição (Grammy 2027).
 * Fontes: grammy.com/awards/categories, rulebook da 69ª edição e notícia de mudanças 2027 (consultadas em 04/11/26).
 * Os nomes em inglês são oficiais; os rótulos pt-BR são traduções de interface, não traduções oficiais.
 * IDs são estáveis dentro do LastChart e independentes da numeração do catálogo.
 */
export const GRAMMY_EDITION = { id: 'grammy-2027', number: 69, year: 2027, label: '69ª edição · Grammy 2027', checkedAt: '2026-11-04' } as const;

export type GrammyArea = 'general' | 'pop' | 'rock' | 'rnb' | 'jazz' | 'country' | 'gospel' | 'latin' | 'media' | 'package' | 'production' | 'classical';
/** O que a categoria premia. Define quais itens do histórico podem ser indicados. */
export type GrammySubject = 'recording' | 'album' | 'song' | 'artist' | 'person' | 'visual';
/** Grupo de gênero usado apenas para sugerir candidatos com metadados verificados. */
export type GenreGroup = 'pop' | 'asian-pop' | 'dance' | 'rock' | 'metal' | 'alternative' | 'rnb' | 'rap' | 'spoken' | 'jazz' | 'traditional-pop' | 'instrumental' | 'musical' | 'country' | 'roots' | 'blues' | 'folk' | 'bluegrass' | 'gospel' | 'christian' | 'latin' | 'urbano' | 'mexican' | 'tropical' | 'global' | 'african' | 'reggae' | 'new-age' | 'children' | 'comedy' | 'audiobook' | 'soundtrack' | 'classical';

export interface GrammyCategory {
  id: string;
  number: number;
  area: GrammyArea;
  official: string;
  label: string;
  subject: GrammySubject;
  genre?: GenreGroup;
  /** Requisitos que o histórico de scrobbles não comprova sozinho. */
  needs: Array<'credits' | 'lineup' | 'subgenre' | 'eligibility' | 'technical' | 'visual'>;
  /** Mudança da edição 2027 em relação à anterior. */
  change?: 'new' | 'renamed';
}

export const grammyAreas: Record<GrammyArea, { official: string; label: string }> = {
  general: { official: 'General', label: 'Geral' },
  pop: { official: 'Pop & Dance/Electronic', label: 'Pop e dance/eletrônica' },
  rock: { official: 'Rock, Metal & Alternative Music', label: 'Rock, metal e música alternativa' },
  rnb: { official: 'R&B, Rap & Spoken Word Poetry', label: 'R&B, rap e poesia falada' },
  jazz: { official: 'Jazz, Traditional Pop, Contemporary Instrumental & Musical Theater', label: 'Jazz, pop tradicional, instrumental e teatro musical' },
  country: { official: 'Country & American Roots Music', label: 'Country e raízes norte-americanas' },
  gospel: { official: 'Gospel & Contemporary Christian Music', label: 'Gospel e música cristã contemporânea' },
  latin: { official: 'Latin, Global, African, Reggae & New Age, Ambient, Or Chant', label: 'Latina, global, africana, reggae, new age e canto' },
  media: { official: "Children's, Comedy, Audio Book Narration and Storytelling, Visual Media & Music Video/Film", label: 'Infantil, comédia, audiolivro, mídia visual e vídeo' },
  package: { official: 'Package, Notes & Historical', label: 'Embalagem, notas e histórico' },
  production: { official: 'Production, Engineering, Composition & Arrangement', label: 'Produção, engenharia, composição e arranjo' },
  classical: { official: 'Classical', label: 'Música clássica' },
};

type Row = [id: string, official: string, label: string, subject: GrammySubject, genre?: GenreGroup | null, needs?: GrammyCategory['needs'], change?: GrammyCategory['change']];
const rows: Array<[GrammyArea, Row[]]> = [
  ['general', [
    ['record-of-the-year', 'Record Of The Year', 'Gravação do Ano', 'recording'],
    ['album-of-the-year', 'Album Of The Year', 'Álbum do Ano', 'album'],
    ['song-of-the-year', 'Song Of The Year', 'Canção do Ano', 'song', null, ['credits']],
    ['best-new-artist', 'Best New Artist', 'Artista Revelação', 'artist', null, ['eligibility']],
    ['producer-of-the-year-non-classical', 'Producer Of The Year, Non-Classical', 'Produtor do Ano, Não Clássico', 'person', null, ['credits']],
    ['songwriter-of-the-year-non-classical', 'Songwriter Of The Year, Non-Classical', 'Compositor do Ano, Não Clássico', 'person', null, ['credits']],
  ]],
  ['pop', [
    ['best-pop-solo-performance', 'Best Pop Solo Performance', 'Melhor Performance Solo de Pop', 'recording', 'pop', ['lineup']],
    ['best-pop-duo-group-performance', 'Best Pop Duo/Group Performance', 'Melhor Performance de Pop em Duo/Grupo', 'recording', 'pop', ['lineup']],
    ['best-asian-pop-music-performance', 'Best Asian Pop Music Performance', 'Melhor Performance de Música Pop Asiática', 'recording', 'asian-pop', [], 'new'],
    ['best-pop-vocal-album', 'Best Pop Vocal Album', 'Melhor Álbum Vocal de Pop', 'album', 'pop'],
    ['best-dance-electronic-recording', 'Best Dance/Electronic Recording', 'Melhor Gravação de Dance/Eletrônica', 'recording', 'dance'],
    ['best-dance-pop-recording', 'Best Dance Pop Recording', 'Melhor Gravação de Dance Pop', 'recording', 'dance', ['subgenre']],
    ['best-dance-electronic-album', 'Best Dance/Electronic Album', 'Melhor Álbum de Dance/Eletrônica', 'album', 'dance'],
    ['best-remixed-recording', 'Best Remixed Recording', 'Melhor Gravação Remixada', 'recording', null, ['credits']],
  ]],
  ['rock', [
    ['best-rock-performance', 'Best Rock Performance', 'Melhor Performance de Rock', 'recording', 'rock'],
    ['best-metal-performance', 'Best Metal Performance', 'Melhor Performance de Metal', 'recording', 'metal'],
    ['best-rock-song', 'Best Rock Song', 'Melhor Canção de Rock', 'song', 'rock', ['credits']],
    ['best-rock-album', 'Best Rock Album', 'Melhor Álbum de Rock', 'album', 'rock'],
    ['best-alternative-music-performance', 'Best Alternative Music Performance', 'Melhor Performance de Música Alternativa', 'recording', 'alternative'],
    ['best-alternative-music-album', 'Best Alternative Music Album', 'Melhor Álbum de Música Alternativa', 'album', 'alternative'],
  ]],
  ['rnb', [
    ['best-rnb-solo-performance', 'Best R&B Solo Performance', 'Melhor Performance Solo de R&B', 'recording', 'rnb', ['lineup'], 'renamed'],
    ['best-rnb-collaboration-duo-group-performance', 'Best R&B Collaboration or Duo/Group Performance', 'Melhor Colaboração ou Performance de R&B em Duo/Grupo', 'recording', 'rnb', ['lineup'], 'new'],
    ['best-traditional-rnb-performance', 'Best Traditional R&B Performance', 'Melhor Performance de R&B Tradicional', 'recording', 'rnb', ['subgenre']],
    ['best-rnb-song', 'Best R&B Song', 'Melhor Canção de R&B', 'song', 'rnb', ['credits']],
    ['best-progressive-rnb-album', 'Best Progressive R&B Album', 'Melhor Álbum de R&B Progressivo', 'album', 'rnb', ['subgenre']],
    ['best-rnb-album', 'Best R&B Album', 'Melhor Álbum de R&B', 'album', 'rnb'],
    ['best-rap-performance', 'Best Rap Performance', 'Melhor Performance de Rap', 'recording', 'rap'],
    ['best-melodic-rap-performance', 'Best Melodic Rap Performance', 'Melhor Performance de Rap Melódico', 'recording', 'rap', ['subgenre']],
    ['best-rap-song', 'Best Rap Song', 'Melhor Canção de Rap', 'song', 'rap', ['credits']],
    ['best-rap-album', 'Best Rap Album', 'Melhor Álbum de Rap', 'album', 'rap'],
    ['best-spoken-word-poetry-album', 'Best Spoken Word Poetry Album', 'Melhor Álbum de Poesia Falada', 'album', 'spoken'],
  ]],
  ['jazz', [
    ['best-jazz-performance', 'Best Jazz Performance', 'Melhor Performance de Jazz', 'recording', 'jazz'],
    ['best-jazz-vocal-album', 'Best Jazz Vocal Album', 'Melhor Álbum Vocal de Jazz', 'album', 'jazz', ['subgenre']],
    ['best-jazz-instrumental-album', 'Best Jazz Instrumental Album', 'Melhor Álbum Instrumental de Jazz', 'album', 'jazz', ['subgenre']],
    ['best-large-jazz-ensemble-album', 'Best Large Jazz Ensemble Album', 'Melhor Álbum de Grande Conjunto de Jazz', 'album', 'jazz', ['lineup']],
    ['best-latin-jazz-album', 'Best Latin Jazz Album', 'Melhor Álbum de Jazz Latino', 'album', 'jazz', ['subgenre']],
    ['best-alternative-jazz-album', 'Best Alternative Jazz Album', 'Melhor Álbum de Jazz Alternativo', 'album', 'jazz', ['subgenre']],
    ['best-traditional-pop-vocal-performance', 'Best Traditional Pop Vocal Performance', 'Melhor Performance Vocal de Pop Tradicional', 'recording', 'traditional-pop', [], 'new'],
    ['best-traditional-pop-vocal-album', 'Best Traditional Pop Vocal Album', 'Melhor Álbum Vocal de Pop Tradicional', 'album', 'traditional-pop'],
    ['best-contemporary-instrumental-album', 'Best Contemporary Instrumental Album', 'Melhor Álbum Instrumental Contemporâneo', 'album', 'instrumental'],
    ['best-musical-theater-album', 'Best Musical Theater Album', 'Melhor Álbum de Teatro Musical', 'album', 'musical'],
  ]],
  ['country', [
    ['best-country-solo-performance', 'Best Country Solo Performance', 'Melhor Performance Solo de Country', 'recording', 'country', ['lineup']],
    ['best-country-duo-group-performance', 'Best Country Duo/Group Performance', 'Melhor Performance de Country em Duo/Grupo', 'recording', 'country', ['lineup']],
    ['best-country-song', 'Best Country Song', 'Melhor Canção de Country', 'song', 'country', ['credits']],
    ['best-traditional-country-album', 'Best Traditional Country Album', 'Melhor Álbum de Country Tradicional', 'album', 'country', ['subgenre']],
    ['best-contemporary-country-album', 'Best Contemporary Country Album', 'Melhor Álbum de Country Contemporâneo', 'album', 'country', ['subgenre']],
    ['best-american-roots-performance', 'Best American Roots Performance', 'Melhor Performance de Música de Raízes Norte-Americanas', 'recording', 'roots'],
    ['best-americana-performance', 'Best Americana Performance', 'Melhor Performance de Americana', 'recording', 'roots', ['subgenre']],
    ['best-american-roots-song', 'Best American Roots Song', 'Melhor Canção de Música de Raízes Norte-Americanas', 'song', 'roots', ['credits']],
    ['best-americana-album', 'Best Americana Album', 'Melhor Álbum de Americana', 'album', 'roots', ['subgenre']],
    ['best-bluegrass-album', 'Best Bluegrass Album', 'Melhor Álbum de Bluegrass', 'album', 'bluegrass'],
    ['best-traditional-blues-album', 'Best Traditional Blues Album', 'Melhor Álbum de Blues Tradicional', 'album', 'blues', ['subgenre']],
    ['best-contemporary-blues-album', 'Best Contemporary Blues Album', 'Melhor Álbum de Blues Contemporâneo', 'album', 'blues', ['subgenre']],
    ['best-traditional-folk-album', 'Best Traditional Folk Album', 'Melhor Álbum de Folk Tradicional', 'album', 'folk', ['subgenre'], 'new'],
    ['best-contemporary-folk-album', 'Best Contemporary Folk Album', 'Melhor Álbum de Folk Contemporâneo', 'album', 'folk', ['subgenre'], 'renamed'],
    ['best-regional-roots-music-album', 'Best Regional Roots Music Album', 'Melhor Álbum de Música de Raízes Regionais', 'album', 'roots', ['subgenre']],
  ]],
  ['gospel', [
    ['best-gospel-performance-song', 'Best Gospel Performance/Song', 'Melhor Performance/Canção Gospel', 'recording', 'gospel', ['credits']],
    ['best-ccm-performance-song', 'Best Contemporary Christian Music Performance/Song', 'Melhor Performance/Canção de Música Cristã Contemporânea', 'recording', 'christian', ['credits']],
    ['best-gospel-album', 'Best Gospel Album', 'Melhor Álbum Gospel', 'album', 'gospel'],
    ['best-ccm-album', 'Best Contemporary Christian Music Album', 'Melhor Álbum de Música Cristã Contemporânea', 'album', 'christian'],
    ['best-roots-gospel-album', 'Best Roots Gospel Album', 'Melhor Álbum de Gospel de Raízes', 'album', 'gospel', ['subgenre']],
  ]],
  ['latin', [
    ['best-latin-song', 'Best Latin Song', 'Melhor Canção Latina', 'song', 'latin', ['credits'], 'new'],
    ['best-latin-pop-album', 'Best Latin Pop Album', 'Melhor Álbum de Pop Latino', 'album', 'latin', ['subgenre']],
    ['best-musica-urbana-album', 'Best Música Urbana Album', 'Melhor Álbum de Música Urbana', 'album', 'urbano'],
    ['best-latin-rock-alternative-album', 'Best Latin Rock or Alternative Album', 'Melhor Álbum de Rock Latino ou Alternativo', 'album', 'latin', ['subgenre']],
    ['best-musica-mexicana-album', 'Best Música Mexicana Album (Including Tejano)', 'Melhor Álbum de Música Mexicana (Incluindo Tejano)', 'album', 'mexican'],
    ['best-tropical-latin-album', 'Best Tropical Latin Album', 'Melhor Álbum Latino Tropical', 'album', 'tropical'],
    ['best-global-music-performance', 'Best Global Music Performance', 'Melhor Performance de Música Global', 'recording', 'global'],
    ['best-african-music-performance', 'Best African Music Performance', 'Melhor Performance de Música Africana', 'recording', 'african'],
    ['best-global-music-album', 'Best Global Music Album', 'Melhor Álbum de Música Global', 'album', 'global'],
    ['best-reggae-album', 'Best Reggae Album', 'Melhor Álbum de Reggae', 'album', 'reggae'],
    ['best-new-age-ambient-chant-album', 'Best New Age, Ambient, or Chant Album', 'Melhor Álbum de New Age, Ambient ou Canto', 'album', 'new-age'],
  ]],
  ['media', [
    ['best-childrens-music-album', "Best Children's Music Album", 'Melhor Álbum de Música Infantil', 'album', 'children'],
    ['best-comedy-album', 'Best Comedy Album', 'Melhor Álbum de Comédia', 'album', 'comedy'],
    ['best-audio-book-narration-storytelling', 'Best Audio Book, Narration, and Storytelling Recording', 'Melhor Gravação de Audiolivro, Narração e Contação de Histórias', 'album', 'audiobook'],
    ['best-compilation-soundtrack-visual-media', 'Best Compilation Soundtrack For Visual Media', 'Melhor Compilação de Trilha Sonora para Mídia Visual', 'album', 'soundtrack', ['eligibility']],
    ['best-score-soundtrack-visual-media', 'Best Score Soundtrack For Visual Media (Includes Film And Television)', 'Melhor Trilha Sonora Original para Mídia Visual (Incluindo Cinema e Televisão)', 'album', 'soundtrack', ['eligibility']],
    ['best-score-soundtrack-video-games', 'Best Score Soundtrack For Video Games and Other Interactive Media', 'Melhor Trilha Sonora Original para Videogames e Outras Mídias Interativas', 'album', 'soundtrack', ['eligibility']],
    ['best-song-written-for-visual-media', 'Best Song Written For Visual Media', 'Melhor Canção Escrita para Mídia Visual', 'song', 'soundtrack', ['credits', 'eligibility']],
    ['best-music-video', 'Best Music Video', 'Melhor Videoclipe', 'visual', null, ['visual']],
    ['best-music-film', 'Best Music Film', 'Melhor Filme Musical', 'visual', null, ['visual']],
  ]],
  ['package', [
    ['best-recording-package', 'Best Recording Package', 'Melhor Projeto de Embalagem de Gravação', 'album', null, ['visual']],
    ['best-album-cover', 'Best Album Cover', 'Melhor Capa de Álbum', 'album', null, ['visual']],
    ['best-album-notes', 'Best Album Notes', 'Melhores Notas de Álbum', 'album', null, ['credits']],
    ['best-historical-album', 'Best Historical Album', 'Melhor Álbum Histórico', 'album', null, ['eligibility']],
  ]],
  ['production', [
    ['best-engineered-album-non-classical', 'Best Engineered Album, Non-Classical', 'Melhor Álbum de Engenharia de Som, Não Clássico', 'album', null, ['technical', 'credits']],
    ['best-engineered-album-classical', 'Best Engineered Album, Classical', 'Melhor Álbum de Engenharia de Som, Clássico', 'album', 'classical', ['technical', 'credits']],
    ['producer-of-the-year-classical', 'Producer Of The Year, Classical', 'Produtor do Ano, Clássico', 'person', 'classical', ['credits']],
    ['best-immersive-audio-album', 'Best Immersive Audio Album', 'Melhor Álbum de Áudio Imersivo', 'album', null, ['technical']],
    ['best-instrumental-composition', 'Best Instrumental Composition', 'Melhor Composição Instrumental', 'song', 'instrumental', ['credits']],
    ['best-arrangement-instrumental-a-cappella', 'Best Arrangement, Instrumental or A Cappella', 'Melhor Arranjo Instrumental ou A Cappella', 'song', null, ['credits']],
    ['best-arrangement-instruments-vocals', 'Best Arrangement, Instruments and Vocals', 'Melhor Arranjo para Instrumentos e Vocais', 'song', null, ['credits']],
  ]],
  ['classical', [
    ['best-orchestral-performance', 'Best Orchestral Performance', 'Melhor Performance Orquestral', 'recording', 'classical', ['lineup']],
    ['best-opera-recording', 'Best Opera Recording', 'Melhor Gravação de Ópera', 'album', 'classical', ['subgenre']],
    ['best-choral-performance', 'Best Choral Performance', 'Melhor Performance Coral', 'recording', 'classical', ['lineup']],
    ['best-chamber-music-small-ensemble', 'Best Chamber Music/Small Ensemble Performance', 'Melhor Performance de Música de Câmara/Pequeno Conjunto', 'recording', 'classical', ['lineup']],
    ['best-classical-instrumental-solo', 'Best Classical Instrumental Solo', 'Melhor Solo Instrumental Clássico', 'recording', 'classical', ['lineup']],
    ['best-classical-solo-vocal-album', 'Best Classical Solo Vocal Album', 'Melhor Álbum Vocal Solo Clássico', 'album', 'classical', ['lineup']],
    ['best-classical-compendium', 'Best Classical Compendium', 'Melhor Compêndio Clássico', 'album', 'classical'],
    ['best-contemporary-classical-composition', 'Best Contemporary Classical Composition', 'Melhor Composição Clássica Contemporânea', 'song', 'classical', ['credits']],
  ]],
];

let counter = 0;
export const grammyCategories: GrammyCategory[] = rows.flatMap(([area, list]) => list.map(([id, official, label, subject, genre, needs, change]) => ({
  id, number: ++counter, area, official, label, subject, ...(genre ? { genre } : {}), needs: needs ?? [], ...(change ? { change } : {}),
})));
export const grammyById = new Map(grammyCategories.map(category => [category.id, category]));

export const subjectLabels: Record<GrammySubject, string> = {
  recording: 'Gravação/performance', album: 'Álbum', song: 'Composição (canção)', artist: 'Artista', person: 'Pessoa (créditos)', visual: 'Vídeo ou filme',
};
export const needLabels: Record<GrammyCategory['needs'][number], string> = {
  credits: 'créditos de composição/produção não vêm dos scrobbles',
  lineup: 'formação (solo, duo, grupo ou conjunto) precisa ser confirmada',
  subgenre: 'o subgênero não é comprovado pelo gênero geral do catálogo',
  eligibility: 'a elegibilidade oficial não é verificada pelo histórico',
  technical: 'qualidade técnica não é medida por reproduções',
  visual: 'avaliação visual: o histórico de áudio não informa vídeos ou embalagens',
};

/** Normaliza nomes para busca sem acentos. */
export const foldText = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchCategories(query: string, area: GrammyArea | 'all' = 'all', favorites?: Set<string>) {
  const q = foldText(query.trim());
  return grammyCategories.filter(category => (area === 'all' || category.area === area) && (!favorites || favorites.has(category.id)) &&
    (!q || foldText(`${category.label} ${category.official}`).includes(q)));
}

/**
 * Gêneros do catálogo (iTunes, em inglês ou português) → grupo de gênero.
 * Apenas correspondência explícita do nome do gênero informado pela fonte; nada é inferido do artista ou do título.
 */
const genreRules: Array<[RegExp, GenreGroup]> = [
  [/\bk-?pop\b|\bj-?pop\b|c-?pop|mandopop|cantopop|\bt-?pop\b/, 'asian-pop'],
  [/dance|electronic|eletr[oô]nica|house|techno|edm/, 'dance'],
  [/metal/, 'metal'],
  [/alternative|alternativ[ao]|indie/, 'alternative'],
  [/r&b|rnb|soul/, 'rnb'],
  [/hip-?hop|\brap\b/, 'rap'],
  [/spoken word|poesia/, 'spoken'],
  [/vocal jazz|jazz/, 'jazz'],
  [/standards|traditional pop|vocal pop|easy listening/, 'traditional-pop'],
  [/instrumental/, 'instrumental'],
  [/musicals?|broadway|teatro musical|cast recording/, 'musical'],
  [/bluegrass/, 'bluegrass'],
  [/country/, 'country'],
  [/americana|roots/, 'roots'],
  [/blues/, 'blues'],
  [/\bfolk\b/, 'folk'],
  [/christian|crist[aã]|ccm|worship/, 'christian'],
  [/gospel/, 'gospel'],
  [/urbano|reggaeton|latin urban/, 'urbano'],
  [/mexican|mexicana|regional mexicano|tejano|banda|norte[nñ]o/, 'mexican'],
  [/tropical|salsa|merengue|bachata|cumbia/, 'tropical'],
  [/latin|latino|latina/, 'latin'],
  [/afro|african|africana|amapiano/, 'african'],
  [/reggae|dancehall/, 'reggae'],
  [/new age|ambient|meditation|chant/, 'new-age'],
  [/children|infantil|kids/, 'children'],
  [/comedy|com[eé]dia/, 'comedy'],
  [/audiobook|audiolivro|narration|storytelling/, 'audiobook'],
  [/soundtrack|trilha sonora|score|video game/, 'soundtrack'],
  [/classical|cl[aá]ssic|opera|[oó]pera|orchestral|chamber/, 'classical'],
  [/world|worldwide|global|m[uú]sica do mundo/, 'global'],
  [/\brock\b|punk|grunge|hard rock/, 'rock'],
  [/\bpop\b|pop$/, 'pop'],
];
export function genreGroupsOf(genre: string | undefined): GenreGroup[] {
  if (!genre) return [];
  const g = foldText(genre);
  const groups = new Set<GenreGroup>();
  for (const [pattern, group] of genreRules) if (pattern.test(g)) groups.add(group);
  return [...groups];
}
