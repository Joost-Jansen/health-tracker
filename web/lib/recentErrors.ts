// The last few errors this browser tab ran into, so a feedback report says what went wrong without the user having
// to describe it. Kept in memory only; sent along only when the user sends feedback (components/feedback).

export type RecentError = { message: string; where: string; status?: number; at: string };

const MAX = 10;
const errors: RecentError[] = [];

export function recordError(message: string, extra: { where?: string; status?: number } = {}) {
  const where = extra.where ?? (typeof location === "undefined" ? "" : location.pathname);
  errors.push({ message: message.slice(0, 300), where, status: extra.status, at: new Date().toISOString() });
  if (errors.length > MAX) errors.shift();
}

export const recentErrors = (): RecentError[] => errors.slice();

let installed = false;

/** Catch what nothing else catches: script errors and rejected promises. Once per page load. */
export function captureGlobalErrors() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => recordError(e.message || String(e.error)));
  window.addEventListener("unhandledrejection", (e) => recordError(e.reason instanceof Error ? e.reason.message : String(e.reason)));
}
