export const OWNER_KEY = "lastchart-account:workspace-owner";
export function workspaceOwner(storage?:Storage){try{return (storage??localStorage).getItem(OWNER_KEY)||'guest';}catch{return 'guest';}}
export const isWorkspaceKey = (key: string) =>
  /^(lastchart-studio:(settings:v1|studio|favorites|source-filter:v1|view-mode|quick-access|custom-user:v1)|lastchart-sync:v1)$/.test(
    key,
  ) ||
  [
    "spotlight-name:v1:",
    "saved-eras:v1:",
    "lastchart-awards:v1:",
    "lastchart-notify:v1:",
    "lastchart-compare:v1:",
    "lastchart-achievements:v2:",
  ].some((p) => key.startsWith(p));
export function captureWorkspace(storage: Storage = localStorage) {
  const prefs: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isWorkspaceKey(key)) {
      const value = storage.getItem(key);
      if (value !== null) prefs[key] = value;
    }
  }
  return prefs;
}
export function switchWorkspacePreferences(
  owner: string,
  carry = false,
  storage: Storage = localStorage,
) {
  if (owner !== "guest" && !/^[a-f0-9-]{36}$/.test(owner))
    throw new Error("Conta inválida.");
  const previous = workspaceOwner(storage);
  if (previous === owner) return;
  const prefs = captureWorkspace(storage),
    targetKey = `lastchart-account:workspace:${owner}`;
  storage.setItem(
    `lastchart-account:workspace:${previous}`,
    JSON.stringify(prefs),
  );
  const saved = storage.getItem(targetKey);
  const next: Record<string, string> = saved
    ? JSON.parse(saved)
    : carry && previous === "guest"
      ? prefs
      : {};
  // Persist the complete target before removing any active preference; quota failure leaves the current workspace intact.
  storage.setItem(targetKey, JSON.stringify(next));
  Object.keys(prefs).forEach((k) => storage.removeItem(k));
  Object.entries(next).forEach(([k, v]) => {
    if (isWorkspaceKey(k) && typeof v === "string") storage.setItem(k, v);
  });
  storage.setItem(OWNER_KEY, owner);
}
