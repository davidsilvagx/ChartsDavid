import { normalize, selectScrobblesForFilter } from "./charts";
import { metaKey, type EffectiveMeta } from "./metadata";
import type {
  CachedWeek,
  Item,
  Settings,
  SourceFilter,
  Scrobble,
} from "./types";
import type { Mission } from "./missions";

// Authored bingo cards: each slot must be heard, extra replays never fill a missing slot.
const casts: Array<[string, string[]]> = [
  ["Telephone sem chamada perdida", ["Lady Gaga", "Beyoncé"]],
  ["Rainha da chuva", ["Lady Gaga", "Ariana Grande"]],
  ["Do country à pista", ["Taylor Swift", "Dua Lipa", "Beyoncé"]],
  ["Onda de 2010", ["Katy Perry", "Rihanna", "Kesha"]],
  ["Ex-acts no comando", ["Miley Cyrus", "Demi Lovato", "Selena Gomez"]],
  ["Passagem para Chromatica", ["Lady Gaga", "Charli XCX", "Rina Sawayama"]],
  ["BR de camarote", ["Anitta", "Pabllo Vittar", "Gloria Groove"]],
  ["Vozes do pagode", ["Ludmilla", "Thiaguinho", "Péricles"]],
  ["Ponte Salvador-Rio", ["Ivete Sangalo", "Daniela Mercury", "Ludmilla"]],
  ["Da Bahia para o mundo", ["Gal Costa", "Maria Bethânia", "Caetano Veloso"]],
  ["Vozes que abraçam", ["Whitney Houston", "Mariah Carey", "Céline Dion"]],
  ["Realeza do videoclipe", ["Madonna", "Michael Jackson", "Janet Jackson"]],
  ["Boyband encontrou girlband", ["One Direction", "Little Mix"]],
  [
    "Harmonizer solo também",
    ["Fifth Harmony", "Lauren Jauregui", "Normani", "Camila Cabello"],
  ],
  ["Seoul em três palcos", ["BLACKPINK", "BTS", "TWICE"]],
  ["Novo girl power", ["NewJeans", "aespa", "IVE"]],
  ["Fronteiras abertas", ["Rosalía", "Karol G", "Shakira"]],
  ["Latina de estádio", ["Bad Bunny", "J Balvin", "Anitta"]],
  ["After de glitter", ["The Weeknd", "Dua Lipa", "Jessie Ware"]],
  ["Piano e coração", ["Adele", "Alicia Keys", "Sara Bareilles"]],
  ["Rock de delineador", ["Paramore", "Evanescence", "Avril Lavigne"]],
  [
    "Indie de fone grande",
    ["Lana Del Rey", "Florence + the Machine", "Marina"],
  ],
  [
    "As novas headliners",
    ["Olivia Rodrigo", "Sabrina Carpenter", "Chappell Roan"],
  ],
  ["Sad girls em reunião", ["Billie Eilish", "Lorde", "Phoebe Bridgers"]],
  ["Disco nunca morreu", ["ABBA", "Donna Summer", "Kylie Minogue"]],
  ["Lendas de guitarra", ["Queen", "David Bowie", "Prince"]],
  ["R&B na varanda", ["SZA", "Victoria Monét", "Jhené Aiko"]],
  ["Mulheres no flow", ["Nicki Minaj", "Doja Cat", "Megan Thee Stallion"]],
  ["Raízes e futuro", ["Elza Soares", "Liniker", "Luedji Luna"]],
  [
    "Sertanejo de milhões",
    ["Marília Mendonça", "Maiara & Maraisa", "Simone Mendes"],
  ],
];
const setlists: Array<[string, string, string[]]> = [
  [
    "Gaga: ato de abertura",
    "Lady Gaga",
    ["Just Dance", "Poker Face", "Paparazzi"],
  ],
  [
    "Gaga: romance em alta",
    "Lady Gaga",
    ["Bad Romance", "Alejandro", "Telephone"],
  ],
  [
    "Gaga: sem pedir licença",
    "Lady Gaga",
    ["Born This Way", "Judas", "The Edge of Glory"],
  ],
  ["Gaga: outra galáxia", "Lady Gaga", ["Stupid Love", "Rain On Me", "911"]],
  [
    "Taylor: mapa de 1989",
    "Taylor Swift",
    ["Shake It Off", "Blank Space", "Style"],
  ],
  [
    "Taylor: floresta encantada",
    "Taylor Swift",
    ["cardigan", "august", "willow"],
  ],
  [
    "Taylor: noite em neon",
    "Taylor Swift",
    ["Anti-Hero", "Lavender Haze", "Karma"],
  ],
  [
    "Bey: palco principal",
    "Beyoncé",
    ["Crazy In Love", "Halo", "Single Ladies (Put a Ring on It)"],
  ],
  [
    "Bey: ballroom em casa",
    "Beyoncé",
    ["BREAK MY SOUL", "ALIEN SUPERSTAR", "CUFF IT"],
  ],
  [
    "Katy: céu de algodão",
    "Katy Perry",
    ["Teenage Dream", "California Gurls", "Firework"],
  ],
  [
    "Katy: modo prisma",
    "Katy Perry",
    ["Roar", "Dark Horse", "Unconditionally"],
  ],
  [
    "Rihanna: rádio da Navy",
    "Rihanna",
    ["Umbrella", "Diamonds", "We Found Love"],
  ],
  [
    "Ariana: três desejos",
    "Ariana Grande",
    ["7 rings", "thank u, next", "positions"],
  ],
  [
    "Ariana: lua e sol",
    "Ariana Grande",
    [
      "we can’t be friends (wait for your love)",
      "yes, and?",
      "the boy is mine",
    ],
  ],
  [
    "Britney: memória muscular",
    "Britney Spears",
    ["...Baby One More Time", "Oops!... I Did It Again", "Toxic"],
  ],
  [
    "Madonna: passarela lendária",
    "Madonna",
    ["Vogue", "Like a Prayer", "Hung Up"],
  ],
  [
    "Dua: clube da nostalgia",
    "Dua Lipa",
    ["Don’t Start Now", "Physical", "Levitating"],
  ],
  [
    "Sabrina: cafezinho completo",
    "Sabrina Carpenter",
    ["Espresso", "Please Please Please", "Taste"],
  ],
  [
    "Olivia: licença para sentir",
    "Olivia Rodrigo",
    ["drivers license", "deja vu", "good 4 u"],
  ],
  [
    "Chappell: clube rosa",
    "Chappell Roan",
    ["Pink Pony Club", "HOT TO GO!", "Good Luck, Babe!"],
  ],
  [
    "Billie: quarto em silêncio",
    "Billie Eilish",
    ["bad guy", "everything i wanted", "Happier Than Ever"],
  ],
  [
    "Miley: flores e espelhos",
    "Miley Cyrus",
    ["Flowers", "Midnight Sky", "Wrecking Ball"],
  ],
  [
    "Shakira: quadril e coração",
    "Shakira",
    ["Hips Don’t Lie", "Whenever, Wherever", "She Wolf"],
  ],
  [
    "Anitta: passaporte carimbado",
    "Anitta",
    ["Envolver", "Vai Malandra", "Show das Poderosas"],
  ],
  [
    "Pabllo: brilho tropical",
    "Pabllo Vittar",
    ["K.O.", "Corpo Sensual", "Amor de Que"],
  ],
  [
    "Ludmilla: hoje tem baile",
    "Ludmilla",
    ["Cheguei", "Hoje", "Rainha da Favela"],
  ],
  [
    "Little Mix: poder em grupo",
    "Little Mix",
    ["Black Magic", "Shout Out to My Ex", "Power"],
  ],
  [
    "BLACKPINK: luzes acesas",
    "BLACKPINK",
    ["DDU-DU DDU-DU", "How You Like That", "Pink Venom"],
  ],
  [
    "ABBA: pista de herança",
    "ABBA",
    [
      "Dancing Queen",
      "Gimme! Gimme! Gimme! (A Man After Midnight)",
      "Mamma Mia",
    ],
  ],
  [
    "Mariah: registro de diva",
    "Mariah Carey",
    ["Fantasy", "Hero", "We Belong Together"],
  ],
];
const albums: Array<[string, string, string[]]> = [
  ["Da fama ao monstro", "Lady Gaga", ["The Fame", "The Fame Monster"]],
  ["Do country a Chromatica", "Lady Gaga", ["Joanne", "Chromatica"]],
  ["Taylor troca de pele", "Taylor Swift", ["Red", "Reputation", "Folklore"]],
  [
    "Bey sem fronteiras",
    "Beyoncé",
    ["Lemonade", "Renaissance", "Cowboy Carter"],
  ],
  [
    "Katy atravessa eras",
    "Katy Perry",
    ["One of the Boys", "Teenage Dream", "Prism"],
  ],
  ["Rihanna em três cores", "Rihanna", ["Loud", "Unapologetic", "Anti"]],
  [
    "Ariana: diário aberto",
    "Ariana Grande",
    ["Sweetener", "Thank U, Next", "Eternal Sunshine"],
  ],
  ["Britney: antes e depois", "Britney Spears", ["In the Zone", "Blackout"]],
  [
    "Madonna em movimento",
    "Madonna",
    ["Ray of Light", "Music", "Confessions on a Dance Floor"],
  ],
  [
    "Dua em três capítulos",
    "Dua Lipa",
    ["Dua Lipa", "Future Nostalgia", "Radical Optimism"],
  ],
  ["De SOUR a GUTS", "Olivia Rodrigo", ["Sour", "Guts"]],
  [
    "Billie muda o quarto",
    "Billie Eilish",
    [
      "When We All Fall Asleep, Where Do We Go?",
      "Happier Than Ever",
      "Hit Me Hard and Soft",
    ],
  ],
  [
    "Lana: cinema em três atos",
    "Lana Del Rey",
    ["Born to Die", "Ultraviolence", "Norman Fucking Rockwell!"],
  ],
  [
    "Miley sem roteiro",
    "Miley Cyrus",
    ["Bangerz", "Plastic Hearts", "Endless Summer Vacation"],
  ],
  [
    "Anitta em circulação",
    "Anitta",
    ["Bang", "Versions of Me", "Funk Generation"],
  ],
  [
    "Pabllo muda a estação",
    "Pabllo Vittar",
    ["Vai Passar Mal", "Batidão Tropical", "Noitada"],
  ],
  [
    "MARINA em metamorfose",
    "Marina",
    ["The Family Jewels", "Electra Heart", "Froot"],
  ],
  [
    "The Weeknd após o pôr do sol",
    "The Weeknd",
    ["Starboy", "After Hours", "Dawn FM"],
  ],
  ["Rosalía: dois universos", "Rosalía", ["El Mal Querer", "Motomami"]],
  [
    "Paramore cresce junto",
    "Paramore",
    ["Riot!", "After Laughter", "This Is Why"],
  ],
];
const words: Array<[string, string[]]> = [
  ["Céu de playlist", ["sun", "moon", "star"]],
  ["Previsão: drama", ["rain", "storm", "thunder"]],
  ["Arco-íris no fone", ["red", "blue", "gold"]],
  ["Animal de palco", ["cat", "dog", "wolf"]],
  ["Roteiro de viagem", ["paris", "london", "new york"]],
  ["Corpo que dança", ["heart", "eyes", "hands"]],
  ["Sentimentos à flor", ["love", "hate", "cry"]],
  ["Tempo é uma diva", ["yesterday", "today", "tomorrow"]],
  ["Festa com endereço", ["party", "club", "dance"]],
  ["Quem apagou a luz?", ["night", "dark", "midnight"]],
  ["Natureza no refrão", ["flower", "ocean", "river"]],
  ["Banquete musical", ["sugar", "honey", "sweet"]],
  ["Filme de ação pop", ["fire", "gun", "run"]],
  ["Guarda-roupa de estrela", ["dress", "shirt", "shoes"]],
  ["Cartas na mesa", ["kiss", "goodbye", "sorry"]],
  ["Espelho da diva", ["beautiful", "pretty", "perfect"]],
  ["Coroa, fama e fortuna", ["queen", "fame", "money"]],
  ["Família de refrões", ["mother", "father", "baby"]],
  ["Sinais do universo", ["angel", "heaven", "dream"]],
  ["Mais que números", ["one", "two", "three"]],
];

const cleanTitle = (v: string) =>
  normalize(v)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const unique = <T>(v: T[]) => new Set(v).size;
export type MissionTimeRow = Scrobble & {
  day: string;
  hour: number;
  weekday: string;
  month: number;
  date: number;
};
export function creativeMissions(
  closed: CachedWeek[],
  settings: Settings,
  source: SourceFilter,
  tracks: Item[],
  metadata: Map<string, EffectiveMeta>,
  calendarRows?: MissionTimeRow[],
): Mission[] {
  const names = new Map<string, string>();
  const canon = (value: string) => {
    let hit = names.get(value);
    if (hit === undefined) {
      hit = cleanTitle(value);
      names.set(value, hit);
    }
    return hit;
  };
  const out: Mission[] = [];
  const add = (
    id: string,
    name: string,
    group: string,
    value: number,
    target: number,
    unit: string,
    criterion: string,
    artArtist?: string,
    needsMetadata = false,
  ) =>
    out.push({
      id: `creative-${id}`,
      name,
      group,
      value,
      target,
      unit,
      criterion,
      level: 4,
      needsMetadata,
      artArtist,
    });
  const rows =
    calendarRows ??
    closed.flatMap((w) =>
      selectScrobblesForFilter(
        w.scrobbles,
        settings.deduplicate,
        source,
        w.week.start,
        w.week.end,
      ),
    );
  const heard = new Set(rows.map((s) => canon(s.artist)));
  casts.forEach(([name, cast], i) =>
    add(
      `cast-${i}`,
      name,
      "Encontros pop",
      cast.filter((a) => heard.has(canon(a))).length,
      cast.length,
      "artistas",
      `Complete o line-up: ${cast.join(" + ")}. Uma reprodução de cada artista; replays não substituem ninguém.`,
      cast[0],
    ),
  );
  const songs = new Set(
    rows.map((s) => `${canon(s.artist)}|${canon(s.track)}`),
  );
  setlists.forEach(([name, artist, titles], i) =>
    add(
      `setlist-${i}`,
      name,
      "Setlists",
      titles.filter((t) => songs.has(`${canon(artist)}|${canon(t)}`)).length,
      titles.length,
      "faixas",
      `Ouça as três de ${artist}: ${titles.join(" • ")}. Os nomes precisam corresponder; versões com nomes extras contam à parte.`,
      artist,
    ),
  );
  const records = new Set(
    rows
      .filter((s) => s.album)
      .map((s) => `${canon(s.artist)}|${canon(s.album)}`),
  );
  albums.forEach(([name, artist, titles], i) =>
    add(
      `eras-${i}`,
      name,
      "Travessias de eras",
      titles.filter((t) => records.has(`${canon(artist)}|${canon(t)}`)).length,
      titles.length,
      "álbuns",
      `Visite estes álbuns de ${artist}, ouvindo ao menos uma faixa de cada: ${titles.join(" • ")}. A edição precisa ter esse nome no histórico.`,
      artist,
    ),
  );
  words.forEach(([name, terms], i) =>
    add(
      `title-${i}`,
      name,
      "Caça ao refrão",
      terms.filter((term) =>
        rows.some(
          (s) =>
            canon(s.track).split(" ").join(" ").split(" ").includes(term) ||
            (term.includes(" ") && ` ${canon(s.track)} `.includes(` ${term} `)),
        ),
      ).length,
      terms.length,
      "palavras",
      `Encontre títulos com cada palavra: ${terms.join(" / ")}. Vale a palavra inteira no título; não é uma análise da letra.`,
    ),
  );

  const clock = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const timed =
    calendarRows ??
    rows.map((s) => {
      const p = Object.fromEntries(
        clock
          .formatToParts(new Date(s.timestamp * 1000))
          .map((p) => [p.type, p.value]),
      );
      return {
        ...s,
        day: `${p.year}-${p.month}-${p.day}`,
        hour: Number(p.hour),
        weekday: p.weekday,
        month: Number(p.month),
        date: Number(p.day),
      };
    });
  const byDay = new Map<string, typeof timed>();
  for (const s of timed) {
    if (!byDay.has(s.day)) byDay.set(s.day, []);
    byDay.get(s.day)!.push(s);
  }
  const days = [...byDay.values()];
  const max = (values: number[]) => Math.max(0, ...values);
  const habit = (
    id: string,
    name: string,
    value: number,
    target: number,
    unit: string,
    rule: string,
  ) =>
    add(
      id,
      name,
      "Rituais musicais",
      value,
      target,
      unit,
      `${rule} Horários no seu fuso; apenas semanas encerradas.`,
    );
  habit(
    "dawn-duo",
    "Da meia-noite ao café",
    max(
      days.map(
        (d) =>
          Number(d.some((s) => s.hour < 6)) +
          Number(d.some((s) => s.hour >= 6 && s.hour < 10)),
      ),
    ),
    2,
    "momentos",
    "Ouça no mesmo dia antes das 06h e entre 06h e 09h59.",
  );
  habit(
    "four-acts",
    "Um dia em quatro atos",
    max(days.map((d) => unique(d.map((s) => Math.floor(s.hour / 6))))),
    4,
    "turnos",
    "Ouça em cada turno de seis horas de um mesmo dia.",
  );
  habit(
    "weekdays",
    "Agenda de headliner",
    unique(timed.map((s) => s.weekday)),
    7,
    "dias da semana",
    "Tenha registros em cada dia da semana, de segunda a domingo.",
  );
  habit(
    "clock-face",
    "Relógio de vinil",
    unique(timed.map((s) => s.hour)),
    24,
    "horários",
    "Complete as 24 faixas de hora ao longo do histórico; não precisa ser no mesmo dia.",
  );
  habit(
    "birthday-months",
    "Calendário com glitter",
    unique(timed.map((s) => s.month)),
    12,
    "meses",
    "Registre música em cada mês do calendário, em qualquer ano.",
  );
  habit(
    "friday-night",
    "Sextou com elenco",
    max(
      days.map((d) =>
        d[0]?.weekday === "Fri"
          ? unique(d.filter((s) => s.hour >= 18).map((s) => canon(s.artist)))
          : 0,
      ),
    ),
    5,
    "artistas",
    "Ouça cinco artistas diferentes na mesma sexta-feira após as 18h.",
  );
  habit(
    "sunday-acoustic",
    "Domingo de álbum",
    max(
      days.map((d) =>
        d[0]?.weekday === "Sun"
          ? unique(
              d
                .filter((s) => s.album)
                .map((s) => `${canon(s.artist)}|${canon(s.album)}`),
            )
          : 0,
      ),
    ),
    3,
    "álbuns",
    "Visite três álbuns diferentes em um mesmo domingo.",
  );
  habit(
    "lunch-break",
    "Intervalo com variedade",
    max(
      days.map((d) =>
        unique(
          d
            .filter((s) => s.hour >= 12 && s.hour < 14)
            .map((s) => canon(s.artist)),
        ),
      ),
    ),
    4,
    "artistas",
    "Ouça quatro artistas diferentes entre 12h e 13h59 em um dia.",
  );
  habit(
    "night-bingo",
    "After com três atos",
    max(
      days.map((d) => unique(d.filter((s) => s.hour >= 21).map((s) => s.hour))),
    ),
    3,
    "horários",
    "Registre música às 21h, 22h e 23h do mesmo dia.",
  );
  habit(
    "sunrise",
    "Nasceu o sol, nasceu a era",
    unique(timed.filter((s) => s.hour === 6).map((s) => s.weekday)),
    7,
    "dias da semana",
    "Tenha um registro entre 06h e 06h59 em cada dia da semana.",
  );
  habit(
    "month-turn",
    "Virada de página",
    Number(timed.some((s) => s.date === 1)) +
      Number(timed.some((s) => s.date === 15)) +
      Number(timed.some((s) => s.date === 28)),
    3,
    "datas",
    "Tenha registros nos dias 1, 15 e 28 de qualquer mês.",
  );
  habit(
    "leap",
    "Faixa bissexta",
    Number(timed.some((s) => s.month === 2 && s.date === 29)),
    1,
    "data",
    "Ouça em 29 de fevereiro, com a semana já encerrada.",
  );
  habit(
    "new-year",
    "Primeiro refrão do ano",
    Number(timed.some((s) => s.month === 1 && s.date === 1)),
    1,
    "data",
    "Registre música em 1º de janeiro.",
  );
  habit(
    "halloween",
    "Trilha da meia-noite",
    Number(timed.some((s) => s.month === 10 && s.date === 31 && s.hour >= 18)),
    1,
    "noite",
    "Registre música em 31 de outubro após as 18h.",
  );
  habit(
    "christmas",
    "Especial de fim de ano",
    Number(timed.some((s) => s.month === 12 && s.date === 24)) +
      Number(timed.some((s) => s.month === 12 && s.date === 25)),
    2,
    "datas",
    "Registre música em 24 e 25 de dezembro, em qualquer ano.",
  );
  habit(
    "womens-day",
    "Oito de março no fone",
    Number(timed.some((s) => s.month === 3 && s.date === 8)),
    1,
    "data",
    "Registre música em 8 de março.",
  );
  habit(
    "valentine",
    "Dois calendários do amor",
    Number(timed.some((s) => s.month === 2 && s.date === 14)) +
      Number(timed.some((s) => s.month === 6 && s.date === 12)),
    2,
    "datas",
    "Ouça em 14 de fevereiro e 12 de junho, em qualquer ano.",
  );
  habit(
    "pride",
    "Junho em todas as semanas",
    unique(
      timed
        .filter((s) => s.month === 6)
        .map((s) => Math.min(4, Math.floor((s.date - 1) / 7))),
    ),
    5,
    "faixas do mês",
    "Ouça em junho nos intervalos 1–7, 8–14, 15–21, 22–28 e 29–30.",
  );
  habit(
    "weekend-cast",
    "Fim de semana sem repetir elenco",
    max(
      days.map((d) =>
        ["Sat", "Sun"].includes(d[0]?.weekday)
          ? unique(d.map((s) => canon(s.artist)))
          : 0,
      ),
    ),
    12,
    "artistas",
    "Ouça doze artistas diferentes em um mesmo sábado ou domingo.",
  );
  habit(
    "commute",
    "Ida e volta com trilha",
    max(
      days.map(
        (d) =>
          Number(d.some((s) => s.hour >= 7 && s.hour < 9)) +
          Number(d.some((s) => s.hour >= 17 && s.hour < 19)),
      ),
    ),
    2,
    "janelas",
    "No mesmo dia, ouça entre 07h–08h59 e entre 17h–18h59.",
  );

  const weekly = closed
    .map((w) => ({
      w,
      rows: selectScrobblesForFilter(
        w.scrobbles,
        settings.deduplicate,
        source,
        w.week.start,
        w.week.end,
      ),
    }))
    .sort((a, b) => a.w.week.start - b.w.week.start);
  const week = (
    id: string,
    name: string,
    value: number,
    target: number,
    unit: string,
    rule: string,
  ) =>
    add(
      id,
      name,
      "Semana de festival",
      value,
      target,
      unit,
      `${rule} Em semanas encerradas e com dados importados.`,
    );
  const uniqueTrack = (s: (typeof rows)[number]) =>
    `${canon(s.artist)}|${canon(s.track)}`;
  const artistSets = weekly.map(
    (w) => new Set(w.rows.map((s) => canon(s.artist))),
  );
  const leaders = weekly.map((w) => {
    const counts = new Map<string, number>();
    w.rows.forEach((s) =>
      counts.set(uniqueTrack(s), (counts.get(uniqueTrack(s)) ?? 0) + 1),
    );
    const sorted = [...counts].sort((a, b) => b[1] - a[1]);
    return sorted.length && sorted[0][1] > (sorted[1]?.[1] ?? 0)
      ? sorted[0][0]
      : null;
  });
  week(
    "cast-of-ten",
    "Dez palcos, uma semana",
    max(artistSets.map((s) => s.size)),
    10,
    "artistas",
    "Ouça dez artistas diferentes na mesma semana.",
  );
  week(
    "record-shop",
    "Passeio na loja de discos",
    max(
      weekly.map((w) =>
        unique(
          w.rows
            .filter((s) => s.album)
            .map((s) => `${canon(s.artist)}|${canon(s.album)}`),
        ),
      ),
    ),
    12,
    "álbuns",
    "Visite doze álbuns identificados na mesma semana.",
  );
  week(
    "no-repeats",
    "Set sem bis",
    max(
      weekly.map((w) =>
        w.rows.length === unique(w.rows.map(uniqueTrack)) ? w.rows.length : 0,
      ),
    ),
    20,
    "faixas",
    "Complete uma semana com pelo menos vinte faixas e nenhuma repetição.",
  );
  week(
    "one-album",
    "Residência de álbum",
    max(
      weekly.map((w) => {
        const counts = new Map<string, Set<string>>();
        w.rows
          .filter((s) => s.album)
          .forEach((s) => {
            const k = `${canon(s.artist)}|${canon(s.album)}`;
            if (!counts.has(k)) counts.set(k, new Set());
            counts.get(k)!.add(canon(s.track));
          });
        return max([...counts.values()].map((s) => s.size));
      }),
    ),
    10,
    "faixas do álbum",
    "Ouça dez faixas diferentes do mesmo álbum em uma semana; não implica ouvir o disco completo.",
  );
  week(
    "same-name",
    "Homônimas no camarim",
    max(
      weekly.map((w) => {
        const names = new Map<string, Set<string>>();
        w.rows.forEach((s) => {
          const k = canon(s.track);
          if (!names.has(k)) names.set(k, new Set());
          names.get(k)!.add(canon(s.artist));
        });
        return max([...names.values()].map((s) => s.size));
      }),
    ),
    3,
    "artistas",
    "Ouça um título de música idêntico interpretado por três artistas na mesma semana.",
  );
  week(
    "three-sources",
    "Festival multiplataforma",
    max(weekly.map((w) => unique(w.rows.map((s) => s.source ?? "lastfm")))),
    3,
    "fontes",
    "Tenha registros Last.fm, Spotify e YouTube Music na mesma semana.",
  );
  week(
    "duet-week",
    "Encontro de Monsters e Hive",
    max(
      artistSets.map(
        (s) =>
          Number(s.has(canon("Lady Gaga"))) + Number(s.has(canon("Beyoncé"))),
      ),
    ),
    2,
    "artistas",
    "Ouça Gaga e Beyoncé em uma mesma semana.",
  );
  week(
    "br-week",
    "Brasil no mesmo palco",
    max(
      artistSets.map(
        (s) =>
          [
            "Anitta",
            "Pabllo Vittar",
            "Ludmilla",
            "Gloria Groove",
            "IZA",
          ].filter((a) => s.has(canon(a))).length,
      ),
    ),
    5,
    "artistas",
    "Reúna Anitta, Pabllo, Ludmilla, Gloria Groove e IZA na mesma semana.",
  );
  week(
    "girl-week",
    "Girlbands reunidas",
    max(
      artistSets.map(
        (s) =>
          ["Little Mix", "Fifth Harmony", "BLACKPINK", "TWICE"].filter((a) =>
            s.has(canon(a)),
          ).length,
      ),
    ),
    4,
    "grupos",
    "Ouça Little Mix, Fifth Harmony, BLACKPINK e TWICE na mesma semana.",
  );
  week(
    "alphabet",
    "De A a Z no repertório",
    max(
      weekly.map((w) =>
        unique(
          w.rows
            .map((s) => canon(s.track).charAt(0))
            .filter((c) => /^[a-z]$/.test(c)),
        ),
      ),
    ),
    26,
    "iniciais",
    "Complete as 26 iniciais de A a Z nos títulos em uma mesma semana.",
  );
  week(
    "new-cast",
    "Troca completa de line-up",
    max(
      artistSets.map((s, i) =>
        i > 0 &&
        weekly[i - 1].w.week.end === weekly[i].w.week.start &&
        ![...s].some((a) => artistSets[i - 1].has(a))
          ? Math.min(s.size, artistSets[i - 1].size)
          : 0,
      ),
    ),
    5,
    "artistas por semana",
    "Em duas semanas consecutivas, ouça ao menos cinco artistas em cada, sem artista em comum.",
  );
  week(
    "new-leader",
    "Passagem de coroa",
    leaders.some(
      (l, i) =>
        l &&
        i > 0 &&
        leaders[i - 1] &&
        l !== leaders[i - 1] &&
        weekly[i - 1].w.week.end === weekly[i].w.week.start,
    )
      ? 1
      : 0,
    1,
    "troca",
    "Tenha líderes únicos diferentes de reproduções em duas semanas consecutivas, sem empate.",
  );
  week(
    "crown-streak",
    "Residência no topo",
    max(
      leaders.map((l, i) => {
        let n = 0;
        for (
          let j = i;
          l &&
          j >= 0 &&
          leaders[j] === l &&
          (j === i || weekly[j].w.week.end === weekly[j + 1].w.week.start);
          j--
        )
          n++;
        return n;
      }),
    ),
    3,
    "semanas",
    "A mesma faixa lidera sozinha as reproduções por três semanas consecutivas.",
  );
  week(
    "backstage-return",
    "A coroa voltou",
    leaders.some(
      (l, i) =>
        l &&
        i >= 2 &&
        l === leaders[i - 2] &&
        leaders[i - 1] &&
        l !== leaders[i - 1] &&
        weekly[i - 2].w.week.end === weekly[i - 1].w.week.start &&
        weekly[i - 1].w.week.end === weekly[i].w.week.start,
    )
      ? 1
      : 0,
    1,
    "retorno",
    "Uma faixa lidera, perde a liderança e volta a liderar na semana seguinte; três semanas consecutivas sem empate.",
  );
  week(
    "growth",
    "Crescendo sem pausa",
    max(
      weekly.map((w, i) => {
        let n = w.rows.length ? 1 : 0;
        for (
          let j = i;
          j > 0 &&
          weekly[j - 1].w.week.end === weekly[j].w.week.start &&
          weekly[j - 1].rows.length > 0 &&
          weekly[j].rows.length > weekly[j - 1].rows.length;
          j--
        )
          n++;
        return n;
      }),
    ),
    4,
    "semanas",
    "Aumente as reproduções em quatro semanas consecutivas com música.",
  );

  const verified = tracks.flatMap((t) => {
    const m = metadata.get(metaKey("tracks", t));
    return m?.status === "matched" && (m.match === "exact" || m.reviewed)
      ? [{ t, m }]
      : [];
  });
  const catalog = (
    id: string,
    name: string,
    value: number,
    target: number,
    unit: string,
    rule: string,
  ) =>
    add(
      id,
      name,
      "Passaporte do catálogo",
      value,
      target,
      unit,
      `${rule} Usa somente metadados confirmados; sem informação, não preenche.`,
      undefined,
      true,
    );
  const years = verified
    .map(({ m }) => Number(m.releaseDate?.slice(0, 4)))
    .filter(
      (y) => Number.isInteger(y) && y >= 1900 && y <= new Date().getFullYear(),
    );
  catalog(
    "decade-tour",
    "Máquina do tempo em tournée",
    unique(years.map((y) => Math.floor(y / 10))),
    7,
    "décadas",
    "Ouça faixas de sete décadas diferentes.",
  );
  catalog(
    "centuries",
    "Dois séculos no bolso",
    Number(years.some((y) => y < 2000)) + Number(years.some((y) => y >= 2000)),
    2,
    "séculos",
    "Ouça uma faixa lançada no século XX e outra no XXI.",
  );
  catalog(
    "y2k",
    "Portal Y2K",
    Number(years.includes(1999)) +
      Number(years.includes(2000)) +
      Number(years.includes(2001)),
    3,
    "anos",
    "Ouça faixas lançadas em 1999, 2000 e 2001.",
  );
  catalog(
    "eighties-yearbook",
    "Álbum de figurinhas dos 80",
    unique(years.filter((y) => y >= 1980 && y <= 1989)),
    10,
    "anos",
    "Ouça ao menos uma faixa de cada ano de 1980 a 1989.",
  );
  catalog(
    "nineties-yearbook",
    "Anuário dos 90",
    unique(years.filter((y) => y >= 1990 && y <= 1999)),
    10,
    "anos",
    "Ouça ao menos uma faixa de cada ano de 1990 a 1999.",
  );
  const duration = verified.filter(
    ({ m }) =>
      !m.durationConflict &&
      Number.isFinite(m.durationMs) &&
      m.durationMs! >= 1000 &&
      m.durationMs! <= 14400000,
  );
  catalog(
    "short-long",
    "Do interlúdio à epopeia",
    Number(duration.some(({ m }) => m.durationMs! < 90000)) +
      Number(duration.some(({ m }) => m.durationMs! > 600000)),
    2,
    "formatos",
    "Ouça uma faixa com menos de 90 segundos e outra com mais de dez minutos.",
  );
  catalog(
    "minute-bingo",
    "Escada de minutos",
    unique(
      duration
        .map(({ m }) => Math.floor(m.durationMs! / 60000))
        .filter((n) => n >= 1 && n <= 7),
    ),
    7,
    "faixas de duração",
    "Ouça faixas nas sete durações: 1–1:59, 2–2:59, até 7–7:59.",
  );
  catalog(
    "genre-party",
    "Festa sem cerca",
    unique(verified.map(({ m }) => canon(m.genre ?? "")).filter(Boolean)),
    8,
    "gêneros",
    "Ouça faixas de oito rótulos diferentes de gênero do catálogo.",
  );
  const bridges: Array<[string, string, RegExp[]]> = [
    ["rock-dance", "Da guitarra ao strobo", [/rock/i, /dance|house/i]],
    ["country-pop", "Botas com glitter", [/country/i, /\bpop\b/i]],
    ["jazz-rap", "Do sax ao flow", [/jazz/i, /rap|hip.hop/i]],
    ["br-kpop", "Ponte Brasil–Seoul", [/mpb|samba|brazil|brasil/i, /k.pop/i]],
    [
      "classical-electronic",
      "Cordas e sintetizadores",
      [/classical|clássic/i, /electronic/i],
    ],
    ["latin-rnb", "Do reggaeton ao soul", [/reggaeton/i, /r&b|soul/i]],
    ["folk-metal", "Da fogueira ao amplificador", [/folk/i, /metal/i]],
  ];
  const bridgeLabels: Record<string, string> = {
    "rock-dance": "Rock + Dance ou House",
    "country-pop": "Country + Pop",
    "jazz-rap": "Jazz + Rap ou Hip-Hop",
    "br-kpop": "MPB, samba, Brazil ou Brasil + K-Pop",
    "classical-electronic": "Clássico + Electronic",
    "latin-rnb": "Reggaeton + R&B ou Soul",
    "folk-metal": "Folk + Metal",
  };
  bridges.forEach(([id, name, patterns]) =>
    catalog(
      id,
      name,
      patterns.filter((p) => verified.some(({ m }) => p.test(m.genre ?? "")))
        .length,
      patterns.length,
      "estilos",
      `Ouça faixas que completem cada lado desta ponte de gêneros: ${bridgeLabels[id]}.`,
    ),
  );
  return out;
}
