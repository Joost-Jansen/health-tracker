"use client";

// Inloggen. Papieren grond, het woordmerk in de displayletter, en verder alleen wat er moet staan.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Button, Input, Logomark } from "@/components/ds";

export default function LoginPage() {
  const router = useRouter();
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
      setError(err instanceof ApiError ? err.message : "Inloggen is niet gelukt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="flex w-full max-w-[320px] flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Logomark height={34} className="mb-3" />
          <h1 className="font-display text-[34px] font-light leading-tight tracking-[-0.03em]">health-tracker</h1>
          <p className="text-[13px] text-ink-muted">Log in om je training te bekijken.</p>
        </div>
        <div className="flex flex-col gap-4">
          <Input id="login-username" name="username" type="text" autoComplete="username" label="Gebruikersnaam"
            value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <Input id="login-password" name="password" type="password" autoComplete="current-password" label="Wachtwoord"
            value={password} onChange={(e) => setPassword(e.target.value)} error={error ?? undefined} />
        </div>
        <Button type="submit" variant="primary" size="lg" block disabled={loading}>
          {loading ? "Bezig…" : "Inloggen"}
        </Button>
        {config.data && config.data.registration !== "closed" && (
          <p className="text-[12.5px] text-ink-muted">
            {config.data.first_user ? "Nog geen accounts. " : "Nog geen account? "}
            <Link href="/register/" className="underline underline-offset-2">{config.data.first_user ? "Maak het eerste (beheerder)" : "Account maken"}</Link>
          </p>
        )}
      </form>
    </main>
  );
}
