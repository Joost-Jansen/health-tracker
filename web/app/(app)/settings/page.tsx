"use client";

// Account: your name as the site and coaching agents call you, your password and the language of the site.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import LanguageSwitch from "@/components/LanguageSwitch";
import { Button, Input } from "@/components/ds";
import { api } from "@/lib/api";
import { errorText, useT } from "@/lib/i18n";
import type { Me } from "@/lib/training";

function NameCard({ me }: { me: Me }) {
  const t = useT();
  const qc = useQueryClient();
  const [name, setName] = useState(me.display_name ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card title={t.account.name}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.patch("/api/account", { display_name: name });
            setMsg(t.common.saved);
            qc.invalidateQueries({ queryKey: ["me"] });
          } catch (err) {
            setMsg(errorText(err, t, t.common.saveFailed));
          }
        }}
      >
        <Input label={t.account.displayName} value={name} onChange={(e) => setName(e.target.value)} placeholder={me.username} className="w-64" />
        <Button type="submit" size="sm" variant="primary">{t.common.save}</Button>
        {msg && <span className="text-[12.5px] text-ink-muted">{msg}</span>}
      </form>
      <p className="mt-3 text-[12px] text-ink-muted">{t.account.username}: <span className="font-mono">{me.username}</span>{me.is_admin ? ` · ${t.account.admin}` : ""}</p>
    </Card>
  );
}

function LanguageCard() {
  const t = useT();
  return (
    <Card title={t.language.label}>
      <LanguageSwitch save />
      <p className="mt-3 max-w-prose text-[12px] text-ink-muted">{t.language.hint}</p>
    </Card>
  );
}

function PasswordCard() {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Card title={t.account.passwordTitle}>
      <form
        className="flex max-w-sm flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (next !== repeat) return setMsg({ ok: false, text: t.account.mismatch });
          try {
            await api.post("/api/account/password", { current, new: next });
            setMsg({ ok: true, text: t.account.changed });
            setCurrent("");
            setNext("");
            setRepeat("");
          } catch (err) {
            setMsg({ ok: false, text: errorText(err, t, t.account.changeFailed) });
          }
        }}
      >
        <Input type="password" autoComplete="current-password" label={t.account.current} value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input type="password" autoComplete="new-password" label={t.account.new} hint={t.account.newHint} value={next} onChange={(e) => setNext(e.target.value)} />
        <Input type="password" autoComplete="new-password" label={t.account.repeat} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="primary" disabled={!current || !next}>{t.account.change}</Button>
          {msg && <span className={`text-[12.5px] ${msg.ok ? "text-gain" : "text-loss"}`}>{msg.text}</span>}
        </div>
      </form>
    </Card>
  );
}

export default function AccountPage() {
  const t = useT();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/api/me") });
  if (!me.data) return <p className="text-sm text-ink-muted">{t.common.loading}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <NameCard me={me.data} />
        <LanguageCard />
      </div>
      <PasswordCard />
    </div>
  );
}
