import { archiveWork } from "./archiveWork";
import { stable, snapshotFields } from "./archiveCompute";
export { snapshotFields } from "./archiveCompute";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  allowedLocal,
  applyProject,
  collectProject,
  mergeProjects,
  parseProject,
  sha256Hex,
  type ProjectFile,
} from "./projectSync";
import { deleteMeta, getMeta, putMeta, readMetaRange } from "./storage";
import type { ClipBank } from "./leaderAudio";

const BUCKET = "lastchart-private",
  BASE = "account-sync:base:v1";
const MAX_COMPRESSED = 64 * 1024 * 1024,
  MAX_EXPANDED = 256 * 1024 * 1024;
export interface AccountSnapshot {
  version: 1;
  project: ProjectFile;
  lastfmApiKey: string;
}
export interface SnapshotHead {
  user_id: string;
  revision: number;
  object_path: string;
  sha256: string;
  updated_at: string;
}
export interface SyncBase {
  revision: number;
  hashes: Record<string, string>;
}
export class AccountConflict extends Error {
  constructor(
    public local: AccountSnapshot,
    public remote: AccountSnapshot,
    public head: SnapshotHead,
    public fields: string[],
  ) {
    super(
      "Os dois aparelhos alteraram os mesmos ajustes. Escolha como combinar.",
    );
  }
}
export async function snapshotHashes(snapshot: AccountSnapshot) {
  const pairs = await Promise.all(
    Object.entries(snapshotFields(snapshot)).map(async ([key, value]) => [
      key,
      await sha256Hex(stable(value)),
    ]),
  );
  return Object.fromEntries(pairs) as Record<string, string>;
}
const fingerprints=new WeakMap<AccountSnapshot,Promise<string>>();
export function snapshotSignature(snapshot:AccountSnapshot){
 let pending=fingerprints.get(snapshot);
 if(!pending){pending=archiveWork({method:'fingerprint',snapshot});fingerprints.set(snapshot,pending);pending.catch(()=>fingerprints.delete(snapshot));}
 return pending;
}
export async function collectAccountSnapshot(): Promise<AccountSnapshot> {
  const project = await collectProject();
  let apiKey = "";
  try {
    apiKey =
      JSON.parse(localStorage.getItem("lastchart-studio:settings:v1") ?? "{}")
        .apiKey ?? "";
  } catch {
    /* No settings yet. */
  }
  return {
    version: 1,
    project,
    lastfmApiKey: typeof apiKey === "string" ? apiKey : "",
  };
}
export function parseAccountSnapshot(text: string): AccountSnapshot {
  const data = JSON.parse(text);
  if (
    data.version !== 1 ||
    typeof data.lastfmApiKey !== "string" ||
    data.lastfmApiKey.length > 1000
  )
    throw new Error("Backup de conta inválido.");
  return {
    version: 1,
    project: parseProject(JSON.stringify(data.project)),
    lastfmApiKey: data.lastfmApiKey,
  };
}
export async function mergeAccountSnapshots(
  local: AccountSnapshot,
  remote: AccountSnapshot,
  base: SyncBase | null,
  preference?: "local" | "remote",
) {
  const [left, right] = await Promise.all([
      snapshotHashes(local),
      snapshotHashes(remote),
    ]),
    conflicts: string[] = [];
  const merged: AccountSnapshot = {
    version: 1,
    project: { ...remote.project, local: {}, meta: {}, audio: {} },
    lastfmApiKey: "",
  };
  const fields = new Set([...Object.keys(left), ...Object.keys(right)]),
    valuesL = snapshotFields(local),
    valuesR = snapshotFields(remote);
  for (const key of fields) {
    const a = left[key],
      b = right[key],
      before = base?.hashes[key];
    let value: unknown;
    if (
      key.startsWith("local:lastchart-achievements:v2:") &&
      typeof valuesL[key] === "string" &&
      typeof valuesR[key] === "string"
    ) {
      try {
        const l = JSON.parse(valuesL[key] as string),
          r = JSON.parse(valuesR[key] as string);
        if (
          !Array.isArray(l.known) ||
          !Array.isArray(l.unlocked) ||
          !Array.isArray(r.known) ||
          !Array.isArray(r.unlocked)
        )
          throw new Error("Invalid memory");
        value = JSON.stringify({
          known: [...new Set([...l.known, ...r.known])],
          unlocked: [...new Set([...l.unlocked, ...r.unlocked])],
        });
      } catch {
        if (a !== b && !preference) conflicts.push(key);
        value = preference === "remote" ? valuesR[key] : valuesL[key];
      }
    } else if (a === b) value = valuesL[key];
    else if (base && a === before) value = valuesR[key];
    else if (base && b === before) value = valuesL[key];
    else {
      if (!preference) conflicts.push(key);
      value = preference === "remote" ? valuesR[key] : valuesL[key];
    }
    if (value === undefined) continue;
    if (key === "secret:apiKey") merged.lastfmApiKey = String(value);
    else {
      const i = key.indexOf(":"),
        group = key.slice(0, i) as "local" | "meta" | "audio";
      (merged.project[group] as Record<string, unknown>)[key.slice(i + 1)] =
        value;
    }
  }
  try {
    merged.project.history = mergeProjects(
      local.project,
      remote.project,
    ).history;
  } catch {
    // A one-sided profile switch follows the settings chosen by the three-way merge.
    // The previous profile's weeks remain in its IndexedDB namespace.
    let chosen:string|undefined;
    try {
      const selected=JSON.parse(merged.project.local['lastchart-studio:settings:v1']??'null');
      for(const candidate of [local.project.history,remote.project.history])if(candidate){const profile=JSON.parse(candidate).settings;if(selected&&profile?.user?.toLowerCase()===selected.user?.toLowerCase()&&profile.startDate===selected.startDate&&profile.timezone===selected.timezone)chosen=candidate;}
    } catch { /* Invalid profile remains an explicit conflict. */ }
    if(chosen)merged.project.history=chosen;
    else {if (!preference) conflicts.push("history-profile");merged.project.history=(preference === "remote" ? remote : local).project.history;}
  }
  return { snapshot: merged, conflicts };
}
async function unpack(blob: Blob) {
  if (blob.size > MAX_COMPRESSED)
    throw new Error("Backup maior que o limite de 64 MB comprimidos.");
  const reader = blob
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  let size = 0;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_EXPANDED)
        throw new Error("Backup expandido maior que o limite de segurança.");
      chunks.push(new Uint8Array(value));
    }
  } finally {
    await reader.cancel();
  }
  return new Blob(chunks).text();
}
async function pack(snapshot: AccountSnapshot) {
  const plain = new Blob([JSON.stringify(snapshot)]);
  if (plain.size > MAX_EXPANDED)
    throw new Error(
      "O histórico excede o limite de 256 MB antes da compressão. Seus dados locais continuam intactos.",
    );
  const blob = await new Response(
    plain.stream().pipeThrough(new CompressionStream("gzip")),
  ).blob();
  if (blob.size > MAX_COMPRESSED)
    throw new Error(
      "Backup maior que o limite de 64 MB comprimidos. Exporte uma cópia nas configurações.",
    );
  return blob;
}
export function parseSnapshotHead(
  value: unknown,
  userId: string,
): SnapshotHead {
  const row = (
    Array.isArray(value) && value.length === 1 ? value[0] : value
  ) as Partial<SnapshotHead> | null;
  if (
    !row ||
    row.user_id !== userId ||
    !Number.isSafeInteger(row.revision) ||
    row.revision! < 1 ||
    typeof row.object_path !== "string" ||
    !row.object_path.startsWith(`${userId}/snapshots/`) ||
    typeof row.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(row.sha256) ||
    typeof row.updated_at !== "string" ||
    !Number.isFinite(Date.parse(row.updated_at))
  )
    throw new Error(
      "A confirmação do backup está incompleta. Seus dados locais estão preservados.",
    );
  return row as SnapshotHead;
}
export async function readAccountHead(
  client: SupabaseClient,
  userId: string,
): Promise<SnapshotHead | null> {
  const { data, error } = await client
    .from("lastchart_snapshots")
    .select("user_id,revision,object_path,sha256,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data === null ? null : parseSnapshotHead(data, userId);
}
export async function readAccountSnapshot(
  client: SupabaseClient,
  userId: string,
  head: SnapshotHead,
) {
  if (
    head.user_id !== userId ||
    !head.object_path.startsWith(`${userId}/snapshots/`)
  )
    throw new Error("Backup não pertence a esta conta.");
  const { data, error } = await client.storage
    .from(BUCKET)
    .download(head.object_path);
  if (error || !data) throw error ?? new Error("Backup indisponível.");
  if ((await sha256Hex(await data.arrayBuffer())) !== head.sha256)
    throw new Error("O backup não passou na verificação de integridade.");
  return parseAccountSnapshot(await unpack(data));
}
async function uploadAudio(
  client: SupabaseClient,
  userId: string,
  project: ProjectFile,
) {
  const sent = new Set<string>();
  for (const [bankKey, entries] of Object.entries(project.audio)) {
    const bank = await getMeta<ClipBank>(bankKey);
    for (const [itemId, entry] of Object.entries(entries)) {
      if (sent.has(entry.hash)) continue;
      const clip = bank?.[itemId];
      if (!clip?.file)
        throw new Error(
          "Há um trecho de áudio ainda não recebido. A sincronização tentará novamente.",
        );
      if ((await sha256Hex(await clip.file.arrayBuffer())) !== entry.hash)
        throw new Error("Um trecho mudou durante o envio. Tente novamente.");
      const path = `${userId}/audio/${entry.hash}`,
        { error } = await client.storage.from(BUCKET).upload(path, clip.file, {
          upsert: false,
          contentType: clip.file.type || "application/octet-stream",
        });
      if (error) {
        if (!/already exists|duplicate/i.test(error.message)) throw error;
        const existing = await client.storage.from(BUCKET).download(path);
        if (
          existing.error ||
          !existing.data ||
          (await sha256Hex(await existing.data.arrayBuffer())) !== entry.hash
        )
          throw new Error("Falha ao conferir um áudio da nuvem.");
      }
      sent.add(entry.hash);
    }
  }
}
async function restoreAudio(
  client: SupabaseClient,
  userId: string,
  project: ProjectFile,
) {
  for (const [bankKey, entries] of Object.entries(project.audio)) {
    const bank = { ...((await getMeta<ClipBank>(bankKey)) ?? {}) };
    for (const [itemId, entry] of Object.entries(entries)) {
      if (
        bank[itemId] &&
        (await sha256Hex(await bank[itemId].file.arrayBuffer())) === entry.hash
      )
        continue;
      const { data, error } = await client.storage
        .from(BUCKET)
        .download(`${userId}/audio/${entry.hash}`);
      if (error || !data) throw error ?? new Error("Áudio indisponível.");
      if ((await sha256Hex(await data.arrayBuffer())) !== entry.hash)
        throw new Error("Áudio não passou na verificação de integridade.");
      bank[itemId] = {
        file: new File([data], entry.name, { type: entry.type }),
        name: entry.name,
        duration: entry.duration,
        origin: entry.origin,
        matchedBy: entry.matchedBy,
      };
    }
    await putMeta(bankKey, bank);
  }
}
export async function applyAccountSnapshot(
  client: SupabaseClient,
  userId: string,
  snapshot: AccountSnapshot,
) {
  await restoreAudio(client, userId, snapshot.project);
  await applyProject(snapshot.project);
  for (const key of Object.keys(localStorage))
    if (allowedLocal(key) && !(key in snapshot.project.local))
      localStorage.removeItem(key);
  for (const prefix of ["meta-review:v1:", "meta:v1:", "artist-photo:v1:"])
    for (const [key] of await readMetaRange(prefix))
      if (!(key in snapshot.project.meta)) await deleteMeta(key);
  for (const prefix of ["leader-clips:v1:", "leader-auto:v1:"])
    for (const [key, bank] of await readMetaRange<ClipBank>(prefix)) {
      const entries = snapshot.project.audio[key] ?? {};
      const next = Object.fromEntries(
        Object.entries(bank).filter(([id]) => id in entries),
      );
      await putMeta(key, next);
    }
  const settingsKey = "lastchart-studio:settings:v1",
    current = JSON.parse(localStorage.getItem(settingsKey) ?? "{}");
  localStorage.setItem(
    settingsKey,
    JSON.stringify({ ...current, apiKey: snapshot.lastfmApiKey }),
  );
  window.dispatchEvent(new Event("lastchart-account-applied"));
}
export async function writeAccountSnapshot(
  client: SupabaseClient,
  userId: string,
  expected: number,
  snapshot: AccountSnapshot,
): Promise<SnapshotHead> {
  await uploadAudio(client, userId, snapshot.project);
  const blob = await pack(snapshot),
    hash = await sha256Hex(await blob.arrayBuffer()),
    path = `${userId}/snapshots/${crypto.randomUUID()}.gz`;
  const uploaded = await client.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: false, contentType: "application/gzip" });
  if (uploaded.error) throw uploaded.error;
  const { data, error } = await client.rpc("lastchart_commit_snapshot", {
    expected_revision: expected,
    new_path: path,
    new_sha256: hash,
  });
  if (error) throw error;
  const saved = parseSnapshotHead(data, userId);
  if (
    saved.revision !== expected + 1 ||
    saved.object_path !== path ||
    saved.sha256 !== hash
  )
    throw new Error(
      "O envio terminou sem a confirmação esperada. Vamos conferir a nuvem na próxima tentativa.",
    );
  return saved;
}
export async function saveAccountBase(
  snapshot: AccountSnapshot,
  revision: number,
) {
  await putMeta(BASE, {
    revision,
    hashes: await snapshotHashes(snapshot),
    signature: await snapshotSignature(snapshot),
  });
}
export const readAccountBase = () =>
  getMeta<SyncBase & { signature: string }>(BASE);
