"use client";

// Account: your name as the site and coaching agents call you, your password, two-step login and the language of
// the site.

import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
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
            setMsg({ ok: true, text: `${t.account.changed} ${t.account.otherSessions}` });
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

/** The otpauth URI as a QR code image (a data: URL: no request leaves the browser with the secret). */
function Qr({ text }: { text: string }) {
  const src = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createDataURL(4, 4);
  }, [text]);
  return <img src={src} alt="" width={180} height={180} className="rounded bg-white p-1 [image-rendering:pixelated]" />;
}

function TwoStepCard({ me }: { me: Me }) {
  const t = useT();
  const m = t.account.twoStep;
  const qc = useQueryClient();
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [backup, setBackup] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fail = (err: unknown) => setMsg({ ok: false, text: errorText(err, t, m.failed) });
  const reset = () => { setCode(""); setPassword(""); setMsg(null); };

  if (backup) {
    return (
      <Card title={m.backupTitle}>
        <p className="mb-3 max-w-prose text-[12.5px] text-ink-muted">{m.backupText}</p>
        <ul className="mb-4 grid max-w-xs grid-cols-2 gap-x-6 gap-y-1 font-mono text-[13px]">
          {backup.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <Button size="sm" variant="primary" onClick={() => { setBackup(null); qc.invalidateQueries({ queryKey: ["me"] }); }}>{m.done}</Button>
      </Card>
    );
  }

  return (
    <Card title={m.title}>
      {me.totp_enabled ? (
        <form
          className="flex max-w-sm flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post("/api/account/totp/disable", { password, code });
              reset();
              setMsg({ ok: true, text: m.turnedOff });
              qc.invalidateQueries({ queryKey: ["me"] });
            } catch (err) {
              fail(err);
            }
          }}
        >
          <p className="text-[12.5px] text-gain">{m.on}</p>
          <p className="text-[12.5px] text-ink-muted">{m.turnOffText}</p>
          <Input type="password" autoComplete="current-password" label={m.password} value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input inputMode="numeric" autoComplete="one-time-code" label={m.codeOrBackup} value={code} onChange={(e) => setCode(e.target.value)} />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" variant="secondary" disabled={!password || !code}>{m.turnOff}</Button>
            {msg && <span className={`text-[12.5px] ${msg.ok ? "text-gain" : "text-loss"}`}>{msg.text}</span>}
          </div>
        </form>
      ) : setup ? (
        <form
          className="flex max-w-sm flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await api.post<{ backup_codes: string[] }>("/api/account/totp/enable", { code });
              reset();
              setSetup(null);
              setBackup(r.backup_codes);
            } catch (err) {
              fail(err);
            }
          }}
        >
          <p className="text-[12.5px] text-ink-muted">{m.scan}</p>
          <Qr text={setup.otpauth_uri} />
          <p className="text-[12px] text-ink-muted">{m.key}: <span className="select-all break-all font-mono text-[var(--text-primary)]">{setup.secret}</span></p>
          <Input inputMode="numeric" autoComplete="one-time-code" label={m.code} hint={m.codeHint} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" variant="primary" disabled={code.trim().length < 6}>{m.confirm}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setSetup(null); reset(); }}>{m.cancel}</Button>
            {msg && <span className={`text-[12.5px] ${msg.ok ? "text-gain" : "text-loss"}`}>{msg.text}</span>}
          </div>
        </form>
      ) : (
        <div className="flex max-w-prose flex-col gap-3">
          <p className="text-[12.5px] text-ink-muted">{m.off}</p>
          {me.is_admin && <p className="text-[12.5px]">{m.adminHint}</p>}
          <div className="flex items-center gap-3">
            <Button size="sm" variant="primary" onClick={async () => {
              reset();
              try {
                setSetup(await api.post<{ secret: string; otpauth_uri: string }>("/api/account/totp/setup"));
              } catch (err) {
                fail(err);
              }
            }}>{m.turnOn}</Button>
            {msg && <span className={`text-[12.5px] ${msg.ok ? "text-gain" : "text-loss"}`}>{msg.text}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AccountPage() {
  const t = useT();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/api/me") });
  if (!me.data) return <p className="text-sm text-ink-muted">{t.common.loading}</p>;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <NameCard me={me.data} />
        <LanguageCard />
      </div>
      <div className="flex flex-col gap-4">
        <PasswordCard />
        <TwoStepCard me={me.data} />
      </div>
    </div>
  );
}
