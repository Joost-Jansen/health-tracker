"use client";

// Admin (admins only): users, registration and invites.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button, Tabs } from "@/components/ds";
import { api } from "@/lib/api";
import { errorText, useFormat, useT } from "@/lib/i18n";
import type { AdminUser, Invite, Me, RegistrationMode } from "@/lib/training";

const MODES: RegistrationMode[] = ["closed", "invite", "open"];
const INVITE_DAYS = [1, 7, 14, 30];

function Users({ me }: { me: Me }) {
  const t = useT();
  const f = useFormat();
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
      setNotice(errorText(e, t, t.common.failed));
    }
  }
  if (!q.data) return <Card title={t.admin.users}><p className="text-sm text-ink-muted">{t.common.loading}</p></Card>;
  return (
    <Card title={t.admin.usersCount(q.data.length)}>
      {notice && <p className="mb-3 rounded bg-[var(--surface-sunken)] px-3 py-2 text-[12.5px]">{notice}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[12.5px] tabular-nums">
          <thead>
            <tr className="text-left text-[11.5px] text-ink-muted">
              <th className="pb-2 font-normal">{t.admin.user}</th>
              <th className="pb-2 font-normal">{t.admin.role}</th>
              <th className="pb-2 font-normal">{t.admin.activities}</th>
              <th className="pb-2 font-normal">{t.admin.lastSync}</th>
              <th className="pb-2 font-normal">{t.admin.lastLogin}</th>
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
                    <span className="block text-[11.5px] text-ink-muted">{u.username} · {t.admin.since(f.day(u.created_at))}</span>
                  </td>
                  <td className="py-2">
                    {u.is_admin ? t.admin.roleAdmin : t.admin.roleUser}
                    {u.suspended && <span className="block text-[11.5px] text-loss">{t.admin.suspended}</span>}
                  </td>
                  <td className="py-2">{u.activities}</td>
                  <td className="py-2">{u.last_sync ? f.dateTime(u.last_sync) : "–"}</td>
                  <td className="py-2">{f.dateTime(u.last_login_at)}</td>
                  <td className="py-2">
                    {!self && (
                      <span className="flex flex-wrap justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => act(() => api.patch(`/api/admin/users/${u.id}`, { is_admin: !u.is_admin }))}>
                          {u.is_admin ? t.admin.removeAdmin : t.admin.makeAdmin}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => act(() => api.patch(`/api/admin/users/${u.id}`, { suspended: !u.suspended }))}>
                          {u.suspended ? t.admin.unblock : t.admin.block}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            confirm(t.admin.resetConfirm(u.username)) &&
                            act(async () => {
                              const r = await api.post<{ password: string }>(`/api/admin/users/${u.id}/reset-password`);
                              setNotice(t.admin.resetDone(u.username, r.password));
                            })
                          }
                        >
                          {t.admin.reset}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            const typed = prompt(t.admin.deletePrompt(u.username));
                            if (typed) act(() => api.del(`/api/admin/users/${u.id}?confirm=${encodeURIComponent(typed)}`), t.admin.deleted(u.username));
                          }}
                        >
                          {t.common.delete}
                        </Button>
                      </span>
                    )}
                    {self && <span className="block text-right text-[11.5px] text-ink-muted">{t.common.you}</span>}
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
  const t = useT();
  const f = useFormat();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-settings"], queryFn: () => api.get<{ registration: RegistrationMode; invites: Invite[] }>("/api/admin/settings") });
  const [days, setDays] = useState("14");
  const [made, setMade] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-settings"] });
  if (!q.data) return <Card title={t.admin.registration}><p className="text-sm text-ink-muted">{t.common.loading}</p></Card>;
  const mode = t.admin.modes[MODES.includes(q.data.registration) ? q.data.registration : "closed"];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const open = q.data.invites.filter((i) => !i.used_by);
  return (
    <Card title={t.admin.registration}>
      <Tabs
        variant="segmented"
        items={MODES.map((m) => ({ id: m, label: t.admin.modes[m].label }))}
        value={q.data.registration}
        onChange={async (id) => {
          await api.patch("/api/admin/settings", { registration: id });
          refresh();
        }}
        ariaLabel={t.admin.registration}
      />
      <p className="mt-2 text-[12.5px] text-ink-muted">{mode.text}</p>

      {q.data.registration === "invite" && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px]">{t.admin.newInvite}</span>
            <select className="ds-select h-8 w-auto px-2 text-[12.5px]" value={days} onChange={(e) => setDays(e.target.value)} aria-label={t.admin.validity}>
              {INVITE_DAYS.map((d) => <option key={d} value={String(d)}>{t.admin.days(d)}</option>)}
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
              {t.admin.makeLink}
            </Button>
          </div>
          {made && (
            <p className="mt-2 break-all rounded bg-[var(--surface-sunken)] px-2 py-1.5 font-mono text-[12px]">
              {made}{" "}
              <button type="button" className="ml-1 font-sans text-[12px] underline" onClick={() => navigator.clipboard.writeText(made)}>{t.admin.copy}</button>
            </p>
          )}
          {open.length > 0 && (
            <ul className="mt-3 flex flex-col text-[12.5px]">
              {open.map((i) => (
                <li key={i.code} className="flex items-center justify-between gap-2 border-t border-border py-1.5 first:border-t-0">
                  <span className="font-mono">{i.code}</span>
                  <span className="text-ink-muted">{t.admin.until(f.dateTime(i.expires_at))}</span>
                  <Button size="sm" variant="ghost" onClick={async () => { await api.del(`/api/admin/invites/${i.code}`); refresh(); }}>{t.common.revoke}</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export default function AdminPage() {
  const t = useT();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/api/me") });
  if (!me.data) return <p className="text-sm text-ink-muted">{t.common.loading}</p>;
  if (!me.data.is_admin) return <p className="text-sm text-ink-muted">{t.admin.adminsOnly}</p>;
  return (
    <div className="flex flex-col gap-4">
      <Registration />
      <Users me={me.data} />
    </div>
  );
}
