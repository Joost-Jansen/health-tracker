"use client";

// Log in. Paper ground, the wordmark in the display face, and otherwise only what needs to be there.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Button, Input, Logomark } from "@/components/ds";
import LanguageSwitch from "@/components/LanguageSwitch";
import { errorText, useT } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState<string | null>(null); // null: the password step; a string: the code step
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const config = useQuery({ queryKey: ["auth-config"], queryFn: () => api.get<{ registration: string; first_user: boolean }>("/api/auth/config") });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/login", { username, password, ...(totp !== null ? { totp } : {}) });
      router.push("/dashboard/");
    } catch (err) {
      if (err instanceof ApiError && err.code === "totp_required") {
        setTotp(""); // the password was right; two-step login asks for the code
        return;
      }
      setError(errorText(err, t, t.auth.loginFailed));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="flex w-full max-w-[320px] flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Logomark height={34} className="mb-3" />
          <h1 className="font-display text-[34px] font-light leading-tight tracking-[-0.03em]">{t.common.appName}</h1>
          <p className="text-[13px] text-ink-muted">{t.auth.tagline}</p>
        </div>
        {totp === null ? (
          <div className="flex flex-col gap-4">
            <Input id="login-username" name="username" type="text" autoComplete="username" label={t.auth.username}
              value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            <Input id="login-password" name="password" type="password" autoComplete="current-password" label={t.auth.password}
              value={password} onChange={(e) => setPassword(e.target.value)} error={error ?? undefined} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input id="login-totp" name="totp" type="text" inputMode="numeric" autoComplete="one-time-code" label={t.auth.totp}
              hint={t.auth.totpHint} value={totp} onChange={(e) => setTotp(e.target.value)} error={error ?? undefined} autoFocus />
            <button type="button" className="self-start text-[12.5px] text-ink-muted underline underline-offset-2"
              onClick={() => { setTotp(null); setError(null); }}>{t.auth.totpBack}</button>
          </div>
        )}
        <Button type="submit" variant="primary" size="lg" block disabled={loading || totp === ""}>
          {loading ? t.common.busy : t.auth.login}
        </Button>
        {config.data && config.data.registration !== "closed" && (
          <p className="text-[12.5px] text-ink-muted">
            {config.data.first_user ? t.auth.noAccountsYet : t.auth.noAccount}{" "}
            <Link href="/register/" className="underline underline-offset-2">{config.data.first_user ? t.auth.createFirst : t.auth.createAccount}</Link>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <LanguageSwitch />
          <Link href="/privacy/" className="text-[12.5px] text-ink-muted underline underline-offset-2">{t.auth.privacy}</Link>
        </div>
      </form>
    </main>
  );
}
