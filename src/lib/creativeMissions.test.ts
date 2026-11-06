import "fake-indexeddb/auto";
import { describe, expect, it, vi, afterEach } from "vitest";
import { buildMissions } from "./missions";
import { detectUnlocks } from "./achievementUnlocks";
import { defaults, type CachedWeek, type Scrobble } from "./types";
import { makeWeeks } from "./calendar";
const settings = {
    ...defaults,
    user: "mission-qa",
    startDate: "2026-01-02",
    timezone: "UTC",
  },
  now = Date.parse("2026-04-03T12:00Z");
const weeks = makeWeeks(settings, now);
const play = (
  i: number,
  artist: string,
  track = "Song",
  album = "Album",
  hour = 12,
): Scrobble => ({
  artist,
  track,
  album,
  timestamp: weeks[i].start + hour * 3600,
  image: "",
});
const cached = (i: number, rows: Scrobble[]): CachedWeek => ({
  key: weeks[i].id,
  week: weeks[i],
  scrobbles: rows,
  fetchedAt: 1,
  cutoff: weeks[i].end,
  duplicates: 0,
});
const find = (rows: CachedWeek[], id: string) =>
  buildMissions(rows, settings, "all", new Map()).find(
    (m) => m.id === `creative-${id}`,
  )!;
afterEach(() => vi.useRealTimers());
describe("150 authored pop quests", () => {
  it("preserves 280 legacy IDs and adds 150 uniquely named, non-tiered quests", () => {
    const missions = buildMissions([], settings, "all", new Map()),
      added = missions.filter((m) => m.id.startsWith("creative-"));
    expect(
      missions.slice(0, 280).every((m) => !m.id.startsWith("creative-")),
    ).toBe(true);
    expect(added).toHaveLength(150);
    expect(new Set(added.map((m) => m.name)).size).toBe(150);
    expect(new Set(added.map((m) => m.criterion)).size).toBe(150);
    expect(added.every((m) => m.value === 0 && m.target > 0)).toBe(true);
  });
  it("requires every bingo slot; artist repeats cannot complete a missing artist", () => {
    expect(
      find(
        [cached(0, [play(0, "Lady Gaga"), play(0, "Lady Gaga", "Another")])],
        "cast-0",
      ).value,
    ).toBe(1);
    expect(
      find([cached(0, [play(0, "Lady Gaga"), play(0, "Beyoncé")])], "cast-0")
        .value,
    ).toBe(2);
  });
  it("matches artist AND setlist title and does not confuse deluxe album editions", () => {
    expect(
      find(
        [
          cached(0, [
            play(0, "Lady Gaga", "Just Dance"),
            play(0, "Someone Else", "Poker Face"),
            play(0, "Lady Gaga", "Paparazzi"),
          ]),
        ],
        "setlist-0",
      ).value,
    ).toBe(2);
    expect(
      find(
        [
          cached(0, [
            play(0, "Lady Gaga", "A", "The Fame"),
            play(0, "Lady Gaga", "B", "The Fame Monster (Deluxe)"),
          ]),
        ],
        "eras-0",
      ).value,
    ).toBe(1);
  });
  it("does not award open weeks or partial word matches", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(
      find(
        [
          cached(weeks.length - 1, [
            play(weeks.length - 1, "Lady Gaga"),
            play(weeks.length - 1, "Beyoncé"),
          ]),
        ],
        "cast-0",
      ).value,
    ).toBe(0);
    expect(
      find([cached(0, [play(0, "X", "Sunday Moonstone Superstar")])], "title-0")
        .value,
    ).toBe(0);
  });
  it("does not bridge missing weeks to invent a leadership streak", () => {
    const rows = [0, 2, 3].map((i) =>
      cached(i, [play(i, "X", "Leader"), play(i, "X", "Leader", "Album", 13)]),
    );
    expect(find(rows, "crown-streak").value).toBe(2);
    expect(
      find(
        [0, 1, 2].map((i) => cached(i, [play(i, "X", "Leader")])),
        "crown-streak",
      ).value,
    ).toBe(3);
  });
  it("uses actual local calendar windows for same-day rituals", () => {
    expect(
      find(
        [
          cached(0, [
            play(0, "X", "Dawn", "A", 1),
            play(0, "Y", "Coffee", "B", 8),
          ]),
        ],
        "dawn-duo",
      ).value,
    ).toBe(2);
    expect(
      find(
        [
          cached(0, [
            play(0, "X", "Dawn", "A", 1),
            play(0, "Y", "Coffee", "B", 32),
          ]),
        ],
        "dawn-duo",
      ).value,
    ).toBe(1);
  });
});
it("celebrates transitions once, baselines imported history and new catalogue entries", () => {
  const mission = buildMissions([], settings, "all", new Map())[0],
    complete = { ...mission, value: mission.target };
  const first = detectUnlocks([mission], null);
  expect(first.fresh).toEqual([]);
  const earned = detectUnlocks([complete], first.memory);
  expect(earned.fresh).toHaveLength(1);
  expect(detectUnlocks([complete], earned.memory).fresh).toEqual([]);
  expect(detectUnlocks([complete], null).fresh).toEqual([]);
  expect(
    detectUnlocks(
      [complete, { ...complete, id: "new-catalogue" }],
      earned.memory,
    ).fresh,
  ).toEqual([]);
});
