"use client";

// Account aanmaken. Kan alleen als de beheerder registratie open heeft gezet of je een uitnodigingslink hebt;
// op een lege installatie wordt de eerste gebruiker beheerder.

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Button, Input, Logomark } from "@/components/ds";
import type { RegistrationMode } from "@/lib/training";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const config = useQuery({ queryKey: ["auth-config"], queryFn: () => api.get<{ registration: RegistrationMode; first_user: boolean }>("/api/auth/config") });
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState(params.get("invite") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!config.data) return null;
  const mode = config.data.registration;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/register", { username, password, display_name: displayName || undefined, invite: invite || undefined });
      router.push("/instellingen/koppelingen/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registreren is niet gelukt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-[340px] flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Logomark height={34} className="mb-3" />
        <h1 className="font-display text-[34px] font-light leading-tight tracking-[-0.03em]">Account maken</h1>
        <p className="text-[13px] text-ink-muted">
          {config.data.first_user
            ? "Dit is het eerste account: je wordt beheerder."
            : mode === "closed"
              ? "Registreren staat uit. Vraag de beheerder om een uitnodiging."
              : "Daarna koppel je je Garmin-account om je trainingen binnen te halen."}
        </p>
      </div>
      {mode !== "closed" && (
        <>
          <div className="flex flex-col gap-4">
            <Input label="Gebruikersnaam" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} hint="3-40 tekens: letters, cijfers, punt, streepje." autoFocus />
            <Input label="Naam (optioneel)" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <Input label="Wachtwoord" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Minimaal 10 tekens." />
            {mode === "invite" && !config.data.first_user && <Input label="Uitnodigingscode" value={invite} onChange={(e) => setInvite(e.target.value)} />}
            {error && <p className="text-[12.5px] text-loss">{error}</p>}
          </div>
          <Button type="submit" variant="primary" size="lg" block disabled={loading || !username || !password}>
            {loading ? "Bezig…" : "Account maken"}
          </Button>
        </>
      )}
      <p className="text-[12.5px] text-ink-muted">
        Al een account? <Link href="/login/" className="underline underline-offset-2">Inloggen</Link>
      </p>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
