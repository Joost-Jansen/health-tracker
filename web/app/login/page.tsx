"use client";

// Log in. Paper ground, the wordmark in the display face, and otherwise only what needs to be there.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Input, Logomark } from "@/components/ds";
import LanguageSwitch from "@/components/LanguageSwitch";
import { errorText, useT } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const t = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const config = useQuery({ queryKey: ["auth-config"], queryFn: () => api.get<{ registration: string; first_user: boolean }>("/api/auth/config") });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/login", { username, password });
      router.push("/dashboard/");
    } catch (err) {
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
        <div className="flex flex-col gap-4">
          <Input id="login-username" name="username" type="text" autoComplete="username" label={t.auth.username}
            value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <Input id="login-password" name="password" type="password" autoComplete="current-password" label={t.auth.password}
            value={password} onChange={(e) => setPassword(e.target.value)} error={error ?? undefined} />
        </div>
        <Button type="submit" variant="primary" size="lg" block disabled={loading}>
          {loading ? t.common.busy : t.auth.login}
        </Button>
        {config.data && config.data.registration !== "closed" && (
          <p className="text-[12.5px] text-ink-muted">
            {config.data.first_user ? t.auth.noAccountsYet : t.auth.noAccount}{" "}
            <Link href="/register/" className="underline underline-offset-2">{config.data.first_user ? t.auth.createFirst : t.auth.createAccount}</Link>
          </p>
        )}
        <LanguageSwitch />
      </form>
    </main>
  );
}
