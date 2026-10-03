"use client";

// Beheer (alleen beheerders): gebruikers, registratie en uitnodigingen.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button, Tabs } from "@/components/ds";
import { api, ApiError } from "@/lib/api";
import type { AdminUser, Invite, Me, RegistrationMode } from "@/lib/training";

const MODES: { id: RegistrationMode; label: string; text: string }[] = [
  { id: "closed", label: "Gesloten", text: "Niemand kan zelf een account maken." },
  { id: "invite", label: "Op uitnodiging", text: "Alleen met een uitnodigingscode van een beheerder." },
  { id: "open", label: "Open", text: "Iedereen met de link kan een account maken. Let op: het gaat om gezondheidsdata en GPS-sporen." },
];

const fmt = (iso: string | null) =>
  iso ? new Date(iso.length === 16 ? iso.replace(" ", "T") : iso).toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

function Users({ me }: { me: Me }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => api.get<AdminUser[]>("/api/admin/users") });
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });
  async function act(fn: () => Promise<unknown>, done?: string) {
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
      refresh();
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Mislukt");
    }
  }
  if (!q.data) return <Card title="Gebruikers"><p className="text-sm text-ink-muted">Laden…</p></Card>;
  return (
    <Card title={`Gebruikers (${q.data.length})`}>
      {notice && <p className="mb-3 rounded bg-[var(--surface-sunken)] px-3 py-2 text-[12.5px]">{notice}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12.5px] tabular-nums">
          <thead>
            <tr className="text-left text-[11.5px] text-ink-muted">
              <th className="pb-2 font-normal">Gebruiker</th>
              <th className="pb-2 font-normal">Rol</th>
              <th className="pb-2 font-normal">Activiteiten</th>
              <th className="pb-2 font-normal">Laatste sync</th>
              <th className="pb-2 font-normal">Laatst ingelogd</th>
              <th className="pb-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {q.data.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className="border-t border-border align-top">
                  <td className="py-2">
                    <span className="font-medium">{u.display_name || u.username}</span>
                    <span className="block text-[11.5px] text-ink-muted">{u.username} · sinds {fmt(u.created_at).split(",")[0]}</span>
                  </td>
                  <td className="py-2">
                    {u.is_admin ? "beheerder" : "gebruiker"}
                    {u.suspended && <span className="block text-[11.5px] text-loss">geblokkeerd</span>}
                  </td>
                  <td className="py-2">{u.activities}</td>
                  <td className="py-2">{u.last_sync ?? "–"}</td>
                  <td className="py-2">{fmt(u.last_login_at)}</td>
                  <td className="py-2">
                    {!self && (
                      <span className="flex flex-wrap justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => act(() => api.patch(`/api/admin/users/${u.id}`, { is_admin: !u.is_admin }))}>
                          {u.is_admin ? "Geen beheerder" : "Maak beheerder"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => act(() => api.patch(`/api/admin/users/${u.id}`, { suspended: !u.suspended }))}>
                          {u.suspended ? "Deblokkeren" : "Blokkeren"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            confirm(`Nieuw tijdelijk wachtwoord voor ${u.username}?`) &&
                            act(async () => {
                              const r = await api.post<{ password: string }>(`/api/admin/users/${u.id}/reset-password`);
                              setNotice(`Tijdelijk wachtwoord voor ${u.username}: ${r.password} (geef het door; ${u.username} wijzigt het daarna onder Instellingen).`);
                            })
                          }
                        >
                          Wachtwoord resetten
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            const typed = prompt(`Verwijder ${u.username} met al zijn of haar data (activiteiten, schema's, logboek). Dit kan niet ongedaan worden. Typ de gebruikersnaam ter bevestiging:`);
                            if (typed) act(() => api.del(`/api/admin/users/${u.id}?confirm=${encodeURIComponent(typed)}`), `${u.username} is verwijderd.`);
                          }}
                        >
                          Verwijderen
                        </Button>
                      </span>
                    )}
                    {self && <span className="block text-right text-[11.5px] text-ink-muted">jij</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Registration() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.get<{ registration: RegistrationMode; invites: Invite[] }>("/api/admin/settings") });
  const [days, setDays] = useState("14");
  const [made, setMade] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-settings"] });
  if (!q.data) return <Card title="Registratie"><p className="text-sm text-ink-muted">Laden…</p></Card>;
  const mode = MODES.find((m) => m.id === q.data.registration) ?? MODES[0];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const open = q.data.invites.filter((i) => !i.used_by);
  return (
    <Card title="Registratie">
      <Tabs
        variant="segmented"
        items={MODES.map((m) => ({ id: m.id, label: m.label }))}
        value={q.data.registration}
        onChange={async (id) => {
          await api.patch("/api/admin/settings", { registration: id });
          refresh();
        }}
        ariaLabel="Registratie"
      />
      <p className="mt-2 text-[12.5px] text-ink-muted">{mode.text}</p>

      {q.data.registration === "invite" && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px]">Nieuwe uitnodiging, geldig</span>
            <select className="ds-select h-8 w-auto px-2 text-[12.5px]" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Geldigheid">
              <option value="1">1 dag</option>
              <option value="7">7 dagen</option>
              <option value="14">14 dagen</option>
              <option value="30">30 dagen</option>
            </select>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                const r = await api.post<{ code: string }>("/api/admin/invites", { days: Number(days) });
                setMade(`${origin}/register/?invite=${r.code}`);
                refresh();
              }}
            >
              Maak link
            </Button>
          </div>
          {made && (
            <p className="mt-2 break-all rounded bg-[var(--surface-sunken)] px-2 py-1.5 font-mono text-[12px]">
              {made}{" "}
              <button type="button" className="ml-1 font-sans text-[12px] underline" onClick={() => navigator.clipboard.writeText(made)}>kopieer</button>
            </p>
          )}
          {open.length > 0 && (
            <ul className="mt-3 flex flex-col text-[12.5px]">
              {open.map((i) => (
                <li key={i.code} className="flex items-center justify-between gap-2 border-t border-border py-1.5 first:border-t-0">
                  <span className="font-mono">{i.code}</span>
                  <span className="text-ink-muted">tot {fmt(i.expires_at)}</span>
                  <Button size="sm" variant="ghost" onClick={async () => { await api.del(`/api/admin/invites/${i.code}`); refresh(); }}>Intrekken</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export default function BeheerPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/api/me") });
  if (!me.data) return <p className="text-sm text-ink-muted">Laden…</p>;
  if (!me.data.is_admin) return <p className="text-sm text-ink-muted">Alleen voor beheerders.</p>;
  return (
    <div className="flex flex-col gap-4">
      <Registration />
      <Users me={me.data} />
    </div>
  );
}
