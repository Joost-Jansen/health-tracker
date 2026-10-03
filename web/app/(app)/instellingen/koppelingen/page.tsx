"use client";

// Koppelingen: je eigen Garmin-account. Je wachtwoord gaat alleen naar Garmin; de site bewaart de sessie versleuteld.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button, Input } from "@/components/ds";
import { api, ApiError } from "@/lib/api";

type Status = { garmin: { connected: boolean; readable: boolean | null; connected_at: string | null; last_sync: string | null; last_failed: string[]; syncing: boolean } };

function ConnectForm({ onDone }: { onDone: () => void }) {
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
      setError(err instanceof ApiError ? err.message : "Koppelen is niet gelukt");
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
          <Input label="Garmin-e-mail" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Garmin-wachtwoord" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
            hint="Gaat alleen naar Garmin om in te loggen; de site bewaart het niet." />
        </>
      ) : (
        <Input label="Code uit je e-mail of authenticator-app" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)}
          hint="Garmin vraagt om een extra code (tweestapsverificatie)." autoFocus />
      )}
      {error && <p className="text-[12.5px] text-loss">{error}</p>}
      <div><Button type="submit" variant="primary" size="sm" disabled={busy || (step === "login" ? !email || !password : !code)}>{busy ? "Bezig…" : step === "login" ? "Koppelen" : "Bevestigen"}</Button></div>
    </form>
  );
}

export default function KoppelingenPage() {
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
  if (!q.data) return <p className="text-sm text-ink-muted">Laden…</p>;
  const g = q.data.garmin;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Garmin Connect">
        {!g.connected || g.readable === false ? (
          <>
            <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-ink-muted">
              {g.readable === false
                ? "De opgeslagen koppeling kan niet meer gelezen worden (de server heeft een nieuwe sleutel). Koppel opnieuw; je data blijft staan."
                : "Koppel je Garmin-account om activiteiten (met GPS en hartslag), slaap, rusthartslag en Body Battery binnen te halen. De eerste keer haalt de site het afgelopen jaar op; daarna elke ochtend wat er nieuw is."}
            </p>
            <ConnectForm onDone={refresh} />
          </>
        ) : (
          <div className="flex flex-col gap-3 text-[13px]">
            <dl className="grid max-w-md grid-cols-[140px_1fr] gap-y-1.5">
              <dt className="text-ink-muted">Status</dt>
              <dd>{g.syncing ? "Bezig met synchroniseren…" : g.last_failed.length ? <span className="text-loss">Laatste sync mislukt ({g.last_failed.join(", ")})</span> : "Gekoppeld"}</dd>
              <dt className="text-ink-muted">Gekoppeld sinds</dt>
              <dd>{g.connected_at ?? "–"}</dd>
              <dt className="text-ink-muted">Laatste sync</dt>
              <dd>{g.last_sync ?? "nog niet"}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={g.syncing} onClick={async () => { await api.post("/api/connections/sync"); refresh(); }}>
                {g.syncing ? "Bezig…" : "Nu synchroniseren"}
              </Button>
              <Button size="sm" variant="ghost" onClick={async () => {
                if (!confirm("Garmin ontkoppelen? Je opgehaalde data blijft staan; er komt alleen niets nieuws meer bij.")) return;
                await api.del("/api/connections/garmin");
                refresh();
              }}>Ontkoppelen</Button>
            </div>
            {g.last_failed.length > 0 && (
              <p className="max-w-prose text-[12.5px] text-ink-muted">Blijft het mislukken, ontkoppel en koppel dan opnieuw: Garmin laat een sessie soms verlopen.</p>
            )}
          </div>
        )}
      </Card>
      <p className="max-w-prose text-[11.5px] text-ink-muted">
        Garmin heeft geen openbare koppeling voor particulieren; de site logt in zoals de Garmin Connect-app dat doet. Dat kan een keer haperen als Garmin iets verandert.
      </p>
    </div>
  );
}
