"use client";

// Apple Health: import the export of the Health app (api/apple.py). Apple has no online account to connect to, so
// the steps to export on the iPhone are right here, then the file goes up with a progress bar (XMLHttpRequest: fetch
// has no upload progress), and the server reads it in the background while this card polls how far it is.
// Importing a newer export later adds what is new; nothing is counted twice.

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button } from "@/components/ds";
import { api, ApiError } from "@/lib/api";
import { errorText, useFormat, useT } from "@/lib/i18n";

export type AppleImport = {
  running: boolean;
  progress: { step: "read" | "workouts" | "days" | "derive"; done: number | null; total: number | null } | null;
  last: null | {
    status: "done" | "failed";
    file?: string;
    workouts?: number;
    added?: number;
    merged?: number;
    nights?: number;
    staged_nights?: number;
    kept_garmin_days?: number;
    first?: string | null;
    last?: string | null;
    imported_at?: string;
    error?: string;
    failed_at?: string;
  };
};

function Bar({ label, pct }: { label: string; pct: number | null }) {
  return (
    <div className="flex max-w-md flex-col gap-1.5 text-[12.5px] text-ink-muted" role="status" aria-live="polite">
      <span>{label}{pct !== null && ` · ${pct}%`}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunk">
        <div className={`h-full rounded-full bg-brand transition-[width] duration-500 ${pct === null ? "w-1/3 animate-pulse" : ""}`}
             style={pct === null ? undefined : { width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Upload with progress; resolves with the server's answer, rejects with an ApiError. */
function send(file: File, onProgress: (pct: number) => void): Promise<AppleImport> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/apple/import?name=${encodeURIComponent(file.name)}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { code?: string; detail?: string; params?: Record<string, unknown> } & Partial<AppleImport> = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as AppleImport);
      else reject(new ApiError(xhr.status, typeof body.detail === "string" ? body.detail : xhr.statusText, body.code, body.params));
    };
    xhr.onerror = () => reject(new ApiError(0, "network"));
    xhr.send(file);
  });
}

export default function AppleHealthCard({ highlight = false }: { highlight?: boolean }) {
  const t = useT();
  const m = t.connections.apple;
  const f = useFormat();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["apple-import"],
    queryFn: () => api.get<AppleImport>("/api/apple/import"),
    refetchInterval: (query) => (query.state.data?.running ? 1500 : false),
  });
  const running = !!q.data?.running;

  // an import that was running and is now done: everything on the site may have changed
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !running) qc.invalidateQueries();
    was.current = running;
  }, [running, qc]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNote(null);
    setUploading(0);
    try {
      const state = await send(file, setUploading);
      qc.setQueryData(["apple-import"], state);
      was.current = true;
    } catch (err) {
      setError(errorText(err, t, m.failed));
    } finally {
      setUploading(null);
      if (input.current) input.current.value = "";
    }
  }

  async function removeAll() {
    if (!confirm(m.removeConfirm)) return;
    try {
      const r = await api.del<{ removed: number; days: number }>("/api/apple/import");
      setNote(m.removed(r.removed, r.days));
      qc.invalidateQueries();
    } catch (err) {
      setError(errorText(err, t, m.failed));
    }
  }

  const p = q.data?.progress;
  const stepLabel = !p ? m.progress.starting
    : p.step === "read" ? m.progress.read
    : p.step === "workouts" ? m.progress.workouts(p.done, p.total)
    : p.step === "days" ? m.progress.days
    : m.progress.derive;
  const pct = p?.total && p.done != null ? Math.min(100, Math.round((p.done / p.total) * 100)) : null;
  const last = q.data?.last;
  const done = last?.imported_at ? last : null; // also after a failed later import: that earlier data is still here

  return (
    <div id="apple" className={highlight ? "rounded-lg ring-2 ring-[var(--border-focus)]" : ""}>
      <Card title={m.title}>
        <div className="flex flex-col gap-3 text-[13px]">
          {!done && <p className="max-w-prose leading-relaxed text-ink-muted">{m.intro}</p>}
          {note && <p className="max-w-prose text-[12.5px]">{note}</p>}
          {error && <p className="max-w-prose text-[12.5px] text-loss">{error}</p>}
          {last?.status === "failed" && !running && uploading === null && (
            <p className="max-w-prose text-[12.5px] text-loss">{errorText(new ApiError(422, "", last.error), t, m.failed)}</p>
          )}

          {uploading !== null ? (
            <Bar label={m.uploading} pct={uploading} />
          ) : running ? (
            <Bar label={stepLabel} pct={pct} />
          ) : done ? (
            <dl className="grid max-w-md grid-cols-[150px_1fr] gap-y-1.5">
              <dt className="text-ink-muted">{m.lastImport}</dt>
              <dd>{done.imported_at ? f.dateTime(done.imported_at) : "–"}</dd>
              <dt className="text-ink-muted">{m.workouts}</dt>
              <dd>{m.workoutsValue(done.workouts ?? 0, done.merged ?? 0)}</dd>
              <dt className="text-ink-muted">{m.nights}</dt>
              <dd>{m.nightsValue(done.nights ?? 0, done.staged_nights ?? 0)}</dd>
              <dt className="text-ink-muted">{m.period}</dt>
              <dd>{done.first && done.last ? `${f.day(done.first)} – ${f.day(done.last)}` : "–"}</dd>
              {!!done.kept_garmin_days && (<><dt className="text-ink-muted">Garmin</dt><dd>{m.keptGarmin(done.kept_garmin_days)}</dd></>)}
            </dl>
          ) : null}

          {!done && !running && uploading === null && (
            <ol className="flex max-w-prose list-decimal flex-col gap-1 pl-5 text-[12.5px] leading-relaxed">
              {m.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          )}

          <input ref={input} type="file" accept=".zip,.xml,application/zip,application/xml,text/xml" className="hidden"
                 onChange={(e) => pick(e.target.files?.[0])} />
          {!running && uploading === null && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={done ? "secondary" : "primary"} onClick={() => input.current?.click()}>
                {done ? m.again : m.choose}
              </Button>
              {done && <Button size="sm" variant="ghost" onClick={removeAll}>{m.remove}</Button>}
            </div>
          )}
          {done && <p className="max-w-prose text-[12px] text-ink-muted">{m.againHint}</p>}

          <details className="max-w-prose text-[12px] text-ink-muted">
            <summary className="cursor-pointer select-none hover:text-[var(--text-primary)]">{m.whatTitle}</summary>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 leading-relaxed">
              {m.what.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </details>
        </div>
      </Card>
    </div>
  );
}
