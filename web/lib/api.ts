// Thin fetch wrapper — always same-origin (`/api/...`), always sends the
// httpOnly session cookie. In production Caddy routes /api/* straight to
// the backend; under `next dev`, next.config.js rewrites it there instead.
// Either way the frontend never needs to know the backend's real address.

export class ApiError extends Error {
  status: number;
  /** Error code from api/errors.py; the site shows it in the user's language (lib/i18n errorText). */
  code?: string;
  params?: Record<string, unknown>;
  constructor(status: number, message: string, code?: string, params?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, typeof body.detail === "string" ? body.detail : res.statusText, body.code, body.params);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  /** A file as the raw body (FIT upload): no multipart needed on the server. */
  upload: <T>(path: string, file: Blob) =>
    request<T>(path, { method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" } }),
};

// fetchPlotlyFigure lived here to pull a figure JSON straight past request()'s
// typing. There are no figures left — every chart endpoint returns data now, so
// the pages use api.get like everything else, which already surfaces a 422's
// `detail` as the message.
