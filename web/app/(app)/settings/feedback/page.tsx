"use client";

// Feedback: what you sent and what came of it. Admins also get the inbox of everyone's reports, with status and reply.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import FeedbackDialog from "@/components/feedback/FeedbackDialog";
import { Button, Tag } from "@/components/ds";
import { api } from "@/lib/api";
import { errorText, useFormat, useT } from "@/lib/i18n";
import type { FeedbackItem, FeedbackStatus, Me } from "@/lib/training";

const STATUSES: FeedbackStatus[] = ["new", "planned", "fixed", "wontfix"];

function Head({ f, showUser }: { f: FeedbackItem; showUser?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-muted">
      <Tag>{t.feedback.kindShort[f.kind]}</Tag>
      <Tag>{t.feedback.status[f.status]}</Tag>
      <span>{fmt.dateTime(f.created_at)}</span>
      {showUser && f.username && <span>{t.feedback.from(f.username)}</span>}
      {f.page && <span className="font-mono">{f.page}</span>}
    </div>
  );
}

function Mine() {
  const t = useT();
  const q = useQuery({ queryKey: ["feedback", "mine"], queryFn: () => api.get<FeedbackItem[]>("/api/feedback") });
  const [open, setOpen] = useState(false);
  return (
    <Card title={t.feedback.mine} action={<Button size="sm" variant="primary" onClick={() => setOpen(true)}>{t.feedback.newOne}</Button>}>
      {!q.data ? (
        <p className="text-sm text-ink-muted">{t.common.loading}</p>
      ) : q.data.length === 0 ? (
        <p className="text-sm text-ink-muted">{t.feedback.mineNone}</p>
      ) : (
        <ul className="flex flex-col">
          {q.data.map((f) => (
            <li key={f.id} className="flex flex-col gap-1.5 border-t border-border py-3 first:border-t-0 first:pt-0">
              <Head f={f} />
              <p className="whitespace-pre-wrap text-[13.5px]">{f.message}</p>
              {f.reply && (
                <p className="whitespace-pre-wrap rounded bg-[var(--surface-sunken)] px-3 py-2 text-[13px]">
                  <span className="font-medium">{t.feedback.reply}: </span>
                  {f.reply}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

function InboxItem({ f }: { f: FeedbackItem }) {
  const t = useT();
  const m = t.feedback;
  const qc = useQueryClient();
  const [status, setStatus] = useState<FeedbackStatus>(f.status);
  const [reply, setReply] = useState(f.reply ?? "");
  const [note, setNote] = useState<string | null>(null);
  const changed = status !== f.status || reply !== (f.reply ?? "");
  const ctx = f.context ?? {};

  async function save() {
    setNote(null);
    try {
      await api.patch(`/api/admin/feedback/${f.id}`, { status, reply });
      setNote(m.saved);
      qc.invalidateQueries({ queryKey: ["feedback"] });
    } catch (e) {
      setNote(errorText(e, t, t.common.failed));
    }
  }

  return (
    <li className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0">
      <Head f={f} showUser />
      <p className="whitespace-pre-wrap text-[13.5px]">{f.message}</p>
      <details className="text-[12px] text-ink-muted">
        <summary className="cursor-pointer">{m.details}</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {ctx.version && (<><dt>{m.version}</dt><dd className="font-mono">{ctx.version}</dd></>)}
          {ctx.browser && (<><dt>{m.browser}</dt><dd className="break-all">{ctx.browser}</dd></>)}
          {ctx.screen && (<><dt>{m.screen}</dt><dd>{ctx.screen} · {ctx.language} · {ctx.theme}</dd></>)}
          {!!ctx.errors?.length && (
            <>
              <dt>{m.errors}</dt>
              <dd>
                <ul className="font-mono">
                  {ctx.errors.map((e, i) => <li key={i}>{e.message} {e.where ? `(${e.where})` : ""}</li>)}
                </ul>
              </dd>
            </>
          )}
        </dl>
      </details>
      {f.has_screenshot && (
        <a className="self-start text-[12.5px] underline underline-offset-2" href={`/api/feedback/${f.id}/screenshot`} target="_blank" rel="noreferrer">
          {m.screenshot}
        </a>
      )}
      <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
        {m.replyLabel}
        <textarea className="ds-input h-16 py-2 text-[13px] font-normal text-ink" placeholder={m.replyPh} value={reply} maxLength={5000} onChange={(e) => setReply(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select className="ds-select" aria-label={m.statusLabel} value={status} onChange={(e) => setStatus(e.target.value as FeedbackStatus)}>
          {STATUSES.map((s) => <option key={s} value={s}>{m.status[s]}</option>)}
        </select>
        <Button size="sm" variant="primary" disabled={!changed} onClick={save}>{m.save}</Button>
        {note && <span className="text-[12.5px] text-ink-muted">{note}</span>}
      </div>
    </li>
  );
}

function Inbox() {
  const t = useT();
  const m = t.feedback;
  const [filter, setFilter] = useState<"open" | "all">("open");
  const q = useQuery({ queryKey: ["feedback", "inbox"], queryFn: () => api.get<FeedbackItem[]>("/api/admin/feedback") });
  const items = (q.data ?? []).filter((f) => filter === "all" || f.status === "new" || f.status === "planned");
  return (
    <Card
      title={m.inbox}
      action={
        <span className="flex gap-1.5">
          {(["open", "all"] as const).map((k) => (
            <Button key={k} size="sm" variant={filter === k ? "primary" : "ghost"} onClick={() => setFilter(k)}>{m.filter[k]}</Button>
          ))}
        </span>
      }
    >
      {!q.data ? (
        <p className="text-sm text-ink-muted">{t.common.loading}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted">{m.inboxNone}</p>
      ) : (
        <ul className="flex flex-col">{items.map((f) => <InboxItem key={f.id} f={f} />)}</ul>
      )}
    </Card>
  );
}

export default function FeedbackPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/api/me") });
  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <Mine />
      {me.data?.is_admin && <Inbox />}
    </div>
  );
}
