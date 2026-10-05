"use client";

// Connections: your own Garmin and Wahoo accounts. Your Garmin password only goes to Garmin; Wahoo you log in to at
// Wahoo itself (OAuth, api/connections.py). The site stores both sessions encrypted.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button, Input } from "@/components/ds";
import { api, ApiError } from "@/lib/api";
import { errorText, useFormat, useT } from "@/lib/i18n";

type Status = {
  garmin: { connected: boolean; readable: boolean | null; connected_at: string | null; last_sync: string | null; last_failed: string[]; syncing: boolean };
  wahoo: { available: boolean; connected: boolean; readable: boolean | null; connected_at: string | null; last_workout_day: string | null; failed: boolean };
};

/** The Wahoo card. Connecting sends the browser to Wahoo; Wahoo sends it back with ?wahoo=connected|denied|expired|failed. */
function WahooCard({ s, syncing, onChange }: { s: Status["wahoo"]; syncing: boolean; onChange: () => void }) {
  const t = useT();
  const m = t.connections.wahoo;
  const f = useFormat();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("wahoo");
    if (!result) return;
    if (result === "connected") setNote(m.result.connected);
    else setError(m.result[result] ?? m.result.failed);
    url.searchParams.delete("wahoo");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [m]);

  async function connect() {
    setError(null);
    setBusy(true);
    try {
      const { url } = await api.get<{ url: string }>("/api/connections/wahoo/start");
      window.location.href = url;
    } catch (err) {
      setError(errorText(err, t, m.result.failed));
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm(m.disconnectConfirm)) return;
    setBusy(true);
    try {
      const r = await api.del<{ removed: number }>("/api/connections/wahoo");
      setNote(m.disconnected(r.removed));
      onChange();
    } catch (err) {
      setError(errorText(err, t, m.result.failed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={m.title}>
      <div className="flex flex-col gap-3 text-[13px]">
        {note && <p className="max-w-prose text-[12.5px]">{note}</p>}
        {error && <p className="max-w-prose text-[12.5px] text-loss">{error}</p>}
        {!s.available ? (
          <p className="max-w-prose text-ink-muted">{m.notConfigured}</p>
        ) : !s.connected || s.readable === false ? (
          <>
            <p className="max-w-prose leading-relaxed text-ink-muted">{s.readable === false ? m.unreadable : m.intro}</p>
            <div><Button size="sm" variant="primary" disabled={busy} onClick={connect}>{busy ? t.common.busy : m.connect}</Button></div>
          </>
        ) : (
          <>
            <dl className="grid max-w-md grid-cols-[140px_1fr] gap-y-1.5">
              <dt className="text-ink-muted">{t.connections.status}</dt>
              <dd>{syncing ? t.connections.syncing : s.failed ? <span className="text-loss">{t.connections.lastFailed(["Wahoo"])}</span> : t.connections.connected}</dd>
              <dt className="text-ink-muted">{t.connections.connectedSince}</dt>
              <dd>{s.connected_at ? f.dateTime(s.connected_at) : "–"}</dd>
              <dt className="text-ink-muted">{m.lastWorkout}</dt>
              <dd>{s.last_workout_day ? f.day(s.last_workout_day) : t.common.notYet}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={syncing} onClick={async () => { await api.post("/api/connections/sync"); onChange(); }}>
                {syncing ? t.common.busy : t.connections.syncNow}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={disconnect}>{t.connections.disconnect}</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function ConnectForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"login" | "mfa">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (step === "login") {
        const r = await api.post<{ status: string }>("/api/connections/garmin", { email, password });
        if (r.status === "mfa") setStep("mfa");
        else onDone();
      } else {
        await api.post("/api/connections/garmin/mfa", { code });
        onDone();
      }
    } catch (err) {
      setError(errorText(err, t, t.connections.connectFailed));
      if (err instanceof ApiError && err.status === 410) setStep("login");
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  return (
    <form onSubmit={go} className="flex max-w-sm flex-col gap-3">
      {step === "login" ? (
        <>
          <Input label={t.connections.email} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label={t.connections.password} type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
            hint={t.connections.passwordHint} />
        </>
      ) : (
        <Input label={t.connections.code} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)}
          hint={t.connections.codeHint} autoFocus />
      )}
      {error && <p className="text-[12.5px] text-loss">{error}</p>}
      <div><Button type="submit" variant="primary" size="sm" disabled={busy || (step === "login" ? !email || !password : !code)}>{busy ? t.common.busy : step === "login" ? t.connections.connect : t.connections.confirm}</Button></div>
    </form>
  );
}

export default function ConnectionsPage() {
  const t = useT();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<Status>("/api/connections"),
    refetchInterval: (query) => (query.state.data?.garmin.syncing ? 3000 : false),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["connections"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  if (!q.data) return <p className="text-sm text-ink-muted">{t.common.loading}</p>;
  const g = q.data.garmin;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Garmin Connect">
        {!g.connected || g.readable === false ? (
          <>
            <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-ink-muted">
              {g.readable === false
                ? t.connections.unreadable
                : t.connections.intro}
            </p>
            <ConnectForm onDone={refresh} />
          </>
        ) : (
          <div className="flex flex-col gap-3 text-[13px]">
            <dl className="grid max-w-md grid-cols-[140px_1fr] gap-y-1.5">
              <dt className="text-ink-muted">{t.connections.status}</dt>
              <dd>{g.syncing ? t.connections.syncing : g.last_failed.length ? <span className="text-loss">{t.connections.lastFailed(g.last_failed)}</span> : t.connections.connected}</dd>
              <dt className="text-ink-muted">{t.connections.connectedSince}</dt>
              <dd>{g.connected_at ? f.dateTime(g.connected_at) : "–"}</dd>
              <dt className="text-ink-muted">{t.connections.lastSync}</dt>
              <dd>{g.last_sync ? f.dateTime(g.last_sync) : t.common.notYet}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={g.syncing} onClick={async () => { await api.post("/api/connections/sync"); refresh(); }}>
                {g.syncing ? t.common.busy : t.connections.syncNow}
              </Button>
              <Button size="sm" variant="ghost" onClick={async () => {
                if (!confirm(t.connections.disconnectConfirm)) return;
                await api.del("/api/connections/garmin");
                refresh();
              }}>{t.connections.disconnect}</Button>
            </div>
            {g.last_failed.length > 0 && (
              <p className="max-w-prose text-[12.5px] text-ink-muted">{t.connections.keepsFailing}</p>
            )}
          </div>
        )}
      </Card>
      <WahooCard s={q.data.wahoo} syncing={g.syncing} onChange={refresh} />
      <p className="max-w-prose text-[11.5px] text-ink-muted">
        {t.connections.unofficial}
      </p>
    </div>
  );
}
