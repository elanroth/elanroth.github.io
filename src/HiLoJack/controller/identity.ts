// Per-session uid generation, mirroring the Bananagrams pattern so each tab gets
// a distinct "player". Base id is persisted across sessions for convenience.

const UID_KEY = "hilojack_uid";

// Persistent uid in localStorage so that:
//   - refreshing the host's tab keeps host status
//   - bots they added (claimed under the host's tab) remain owned by them
//   - returning to a saved game preserves seat ownership
// Trade-off: two tabs in the SAME browser share this uid (and therefore share
// seat ownership). For multi-player local testing, use incognito tabs.
export function getOrCreateUid(): string {
  if (typeof window === "undefined") return "ssr-uid";
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("hjuser");
  if (fromQuery) {
    localStorage.setItem(UID_KEY, fromQuery);
    url.searchParams.delete("hjuser");
    window.history.replaceState({}, "", url.toString());
    return fromQuery;
  }
  const existing = localStorage.getItem(UID_KEY);
  if (existing) return existing;

  const id = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(UID_KEY, id);
  return id;
}

export function getStoredNickname(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("hilojack_nick") ?? "";
}

export function storeNickname(nick: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("hilojack_nick", nick);
}
