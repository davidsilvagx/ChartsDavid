import "fake-indexeddb/auto";
import { backupJSON } from "./export";
import { defaults } from "./types";
import { makeWeeks } from "./calendar";
import { expect, it } from "vitest";
import {
  mergeAccountSnapshots,
  parseAccountSnapshot,
  parseSnapshotHead,
  snapshotHashes,
  snapshotSignature,
  type AccountSnapshot,
} from "./accountSync";
import {
  captureWorkspace,
  switchWorkspacePreferences,
  workspaceOwner,
  rememberLoginIntent,
  hasLoginIntent,
} from "./accountWorkspace";
import { databaseName } from "./storage";
const snapshot = (
  local: Record<string, string> = {},
  apiKey = "",
): AccountSnapshot => ({
  version: 1,
  lastfmApiKey: apiKey,
  project: {
    app: "LastChartStudioPro",
    type: "project",
    version: 1,
    exportedAt: "now",
    device: "QA",
    local,
    meta: {},
    audio: {},
  },
});
it("merges changes to different preferences and flags simultaneous edits to the same preference", async () => {
  const a = "lastchart-studio:favorites",
    b = "lastchart-studio:view-mode";
  const original = snapshot({ [a]: "[]", [b]: "grid" }),
    base = { revision: 1, hashes: await snapshotHashes(original) };
  const local = snapshot({ [a]: '["my-favorite"]', [b]: "grid" }),
    remote = snapshot({ [a]: "[]", [b]: "list" });
  const merged = await mergeAccountSnapshots(local, remote, base);
  expect(merged.conflicts).toEqual([]);
  expect(merged.snapshot.project.local).toEqual({
    [a]: '["my-favorite"]',
    [b]: "list",
  });
  const conflict = await mergeAccountSnapshots(
    local,
    snapshot({ [a]: '["other"]', [b]: "grid" }),
    base,
  );
  expect(conflict.conflicts).toEqual([`local:${a}`]);
  expect(
    (await mergeAccountSnapshots(local, remote, base, "remote")).snapshot
      .project.local[a],
  ).toBe('["my-favorite"]');
});
it("syncs a personal API key only in the authenticated envelope and supports clearing it", async () => {
  const original = snapshot({}, "test-original"),
    base = { revision: 1, hashes: await snapshotHashes(original) };
  const merged = await mergeAccountSnapshots(snapshot({}, ""), original, base);
  expect(merged.snapshot.lastfmApiKey).toBe("");
  const parsed = parseAccountSnapshot(
    JSON.stringify(
      snapshot(
        { "lastchart-studio:settings:v1": '{"apiKey":"strip-me","user":"qa"}' },
        "private-marker",
      ),
    ),
  );
  expect(parsed.lastfmApiKey).toBe("private-marker");
  expect(parsed.project.local["lastchart-studio:settings:v1"]).not.toContain(
    "strip-me",
  );
  expect(() => parseAccountSnapshot('{"version":1}')).toThrow();
});
it("ignores export timestamps while detecting real changes and metadata deletions", async () => {
  const a = snapshot(),
    b = {
      ...snapshot(),
      project: { ...snapshot().project, device: "Other", exportedAt: "later" },
    };
  expect(await snapshotSignature(a)).toBe(await snapshotSignature(b));
  expect(await snapshotSignature(a)).not.toBe(
    await snapshotSignature(snapshot({}, "changed")),
  );
  const original = snapshot();
  original.project.meta["meta:v1:tracks:x"] = { genre: "Pop" };
  const merged = await mergeAccountSnapshots(snapshot(), original, {
    revision: 1,
    hashes: await snapshotHashes(original),
  });
  expect(merged.conflicts).toEqual([]);
  expect(merged.snapshot.project.meta).toEqual({});
});
it("keeps the same archive fingerprint after merge and device cache normalization", async () => {
  const settings = { ...defaults, user: "sync-qa", startDate: "2026-10-23", timezone: "UTC" };
  const week = makeWeeks(settings)[0];
  const original = snapshot();
  const row = { key: "device-specific-cache-key", week, cutoff: week.end, fetchedAt: week.end * 1000, duplicates: 0, scrobbles: [
    { timestamp: week.start + 100, artist: "Lady Gaga", track: "Poker Face", album: "The Fame", image: "", source: "lastfm" as const },
  ] };
  original.project.history = backupJSON(settings, [row], null);
  const merged = await mergeAccountSnapshots(original, original, null);
  expect(await snapshotSignature(merged.snapshot)).toBe(await snapshotSignature(original));
  const changed = structuredClone(original);
  changed.project.history = backupJSON(settings, [{ ...row, scrobbles: [...row.scrobbles, { ...row.scrobbles[0], timestamp: week.start + 200 }] }], null);
  expect(await snapshotSignature(changed)).not.toBe(await snapshotSignature(original));
});
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  clear() {
    this.data.clear();
  }
}
it('preserves an explicit migration choice across email confirmation, bound to the same account and time window',()=>{
 const storage=new MemoryStorage();rememberLoginIntent(true,'Fan@Example.test',storage);
 expect(hasLoginIntent('fan@example.test',storage)).toBe(true);
 expect(hasLoginIntent('another@example.test',storage)).toBe(false);
 rememberLoginIntent(false,'fan@example.test',storage);expect(hasLoginIntent('fan@example.test',storage)).toBe(false);
 storage.setItem('lastchart-account:login-intent',JSON.stringify({carry:true,email:'fan@example.test',expires:0}));expect(hasLoginIntent('fan@example.test',storage)).toBe(false);
});
it("separates account preferences and restores the original guest workspace without copying session tokens", () => {
  const storage = new MemoryStorage(),
    a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    key = "lastchart-studio:settings:v1";
  storage.setItem(key, "guest-data");
  storage.setItem("lastchart-auth:v1", "session-token");
  storage.setItem("lastchart-studio:welcome-completed", "1");
  expect(captureWorkspace(storage)).toEqual({ [key]: "guest-data" });
  switchWorkspacePreferences(a, true, storage);
  expect(storage.getItem(key)).toBe("guest-data");
  storage.setItem(key, "account-a");
  switchWorkspacePreferences(b, false, storage);
  expect(storage.getItem(key)).toBeNull();
  switchWorkspacePreferences(a, false, storage);
  expect(storage.getItem(key)).toBe("account-a");
  switchWorkspacePreferences("guest", false, storage);
  expect(storage.getItem(key)).toBe("guest-data");
  expect(workspaceOwner(storage)).toBe("guest");
  expect(storage.getItem("lastchart-studio:welcome-completed")).toBe("1");
  expect(databaseName(a)).not.toBe(databaseName(b));
});
it("combines celebration memory from both devices without inventing achievement progress", async () => {
  const key = "lastchart-achievements:v2:qa",
    left = snapshot({
      [key]: JSON.stringify({ known: ["a", "b"], unlocked: ["a"] }),
    }),
    right = snapshot({
      [key]: JSON.stringify({ known: ["a", "b", "c"], unlocked: ["b"] }),
    });
  const result = await mergeAccountSnapshots(left, right, null);
  expect(result.conflicts).toEqual([]);
  expect(JSON.parse(result.snapshot.project.local[key])).toEqual({
    known: ["a", "b", "c"],
    unlocked: ["a", "b"],
  });
});

it("validates RPC composite responses and rejects another account or an invalid revision", () => {
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    row = {
      user_id: id,
      revision: 1,
      object_path: `${id}/snapshots/qa.gz`,
      sha256: "a".repeat(64),
      updated_at: "2026-11-06T12:00:00Z",
    };
  expect(parseSnapshotHead(row, id)).toEqual(row);
  expect(parseSnapshotHead([row], id)).toEqual(row);
  expect(() =>
    parseSnapshotHead(row, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
  ).toThrow();
  expect(() => parseSnapshotHead({ ...row, revision: NaN }, id)).toThrow();
  expect(() => parseSnapshotHead([], id)).toThrow();
});

it('accepts a profile changed only on the other device, without a false conflict',async()=>{
 const key='lastchart-studio:settings:v1',a={...defaults,user:'profile-a'},b={...defaults,user:'profile-b'};
 const left=snapshot({[key]:JSON.stringify(a)}),right=snapshot({[key]:JSON.stringify(b)});
 left.project.history=backupJSON(a,[],null);right.project.history=backupJSON(b,[],null);
 const result=await mergeAccountSnapshots(left,right,{revision:1,hashes:await snapshotHashes(left)});
 expect(result.conflicts).toEqual([]);expect(JSON.parse(result.snapshot.project.history!).settings.user).toBe('profile-b');
});
