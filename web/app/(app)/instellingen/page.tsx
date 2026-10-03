"use client";

// Account: je naam zoals de site en coachingagents je noemen, en je wachtwoord.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button, Input } from "@/components/ds";
import { api } from "@/lib/api";
import type { Me } from "@/lib/training";

function NameCard({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [name, setName] = useState(me.display_name ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card title="Naam">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.patch("/api/account", { display_name: name });
            setMsg("Opgeslagen.");
            qc.invalidateQueries({ queryKey: ["me"] });
          } catch (err) {
            setMsg(err instanceof Error ? err.message : "Opslaan mislukt");
          }
        }}
      >
        <Input label="Weergavenaam" value={name} onChange={(e) => setName(e.target.value)} placeholder={me.username} className="w-64" />
        <Button type="submit" size="sm" variant="primary">Opslaan</Button>
        {msg && <span className="text-[12.5px] text-ink-muted">{msg}</span>}
      </form>
      <p className="mt-3 text-[12px] text-ink-muted">Gebruikersnaam: <span className="font-mono">{me.username}</span>{me.is_admin ? " · beheerder" : ""}</p>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Card title="Wachtwoord wijzigen">
      <form
        className="flex max-w-sm flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (next !== repeat) return setMsg({ ok: false, text: "De nieuwe wachtwoorden verschillen." });
          try {
            await api.post("/api/account/password", { current, new: next });
            setMsg({ ok: true, text: "Wachtwoord gewijzigd." });
            setCurrent("");
            setNext("");
            setRepeat("");
          } catch (err) {
            setMsg({ ok: false, text: err instanceof Error ? err.message : "Wijzigen mislukt" });
          }
        }}
      >
        <Input type="password" autoComplete="current-password" label="Huidig wachtwoord" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input type="password" autoComplete="new-password" label="Nieuw wachtwoord" hint="Minimaal 10 tekens." value={next} onChange={(e) => setNext(e.target.value)} />
        <Input type="password" autoComplete="new-password" label="Nieuw wachtwoord, nog een keer" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="primary" disabled={!current || !next}>Wijzigen</Button>
          {msg && <span className={`text-[12.5px] ${msg.ok ? "text-gain" : "text-loss"}`}>{msg.text}</span>}
        </div>
      </form>
    </Card>
  );
}

export default function AccountPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/api/me") });
  if (!me.data) return <p className="text-sm text-ink-muted">Laden…</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <NameCard me={me.data} />
      <PasswordCard />
    </div>
  );
}
