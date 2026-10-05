"use client";

// Send feedback: something broken or an idea, from any page (sidebar footer and settings/feedback).
// The page, browser, screen and the last errors this tab hit (lib/recentErrors) go along, so a report is fixable
// without a back-and-forth. A screenshot is scaled down in the browser before it is sent (api/feedback.py takes 3 MB).

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Dialog } from "@/components/ds";
import { api } from "@/lib/api";
import { errorText, useLocale, useT } from "@/lib/i18n";
import { recentErrors } from "@/lib/recentErrors";
import { captureViewport } from "@/lib/screenshot";

type Kind = "bug" | "idea";
const MAX_SIDE = 1600;

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function context(locale: string) {
  return {
    browser: navigator.userAgent.slice(0, 300),
    screen: `${window.innerWidth}x${window.innerHeight}`,
    language: locale,
    theme: document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark (system)" : "light (system)"),
    errors: recentErrors(),
  };
}

export default function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const m = t.feedback;
  const { locale } = useLocale();
  const pathname = usePathname();
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  // A picture of the page as it was when Feedback was clicked: the dialog is left out of it (lib/screenshot).
  useEffect(() => {
    if (!open || done) return;
    let cancelled = false;
    setCapturing(true);
    captureViewport().then((img) => {
      if (!cancelled && img) setShot(img);
      if (!cancelled) setCapturing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    if (busy) return;
    onClose();
    setShot(null);
    if (done) {
      setDone(false);
      setMessage("");
      setKind("bug");
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/feedback", { kind, message, page: pathname, context: context(locale), screenshot: shot ?? undefined });
      setDone(true);
      qc.invalidateQueries({ queryKey: ["feedback"] });
    } catch (e) {
      setError(errorText(e, t, m.failed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={m.title}
      description={done ? undefined : m.hint}
      actions={
        done ? (
          <Button variant="primary" onClick={close}>{m.close}</Button>
        ) : (
          <>
            <Button variant="ghost" disabled={busy} onClick={close}>{m.cancel}</Button>
            <Button variant="primary" disabled={busy || !message.trim()} onClick={send}>{busy ? m.sending : m.send}</Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-[13.5px]">{m.thanks}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5" role="radiogroup" aria-label={m.title}>
            {(["bug", "idea"] as Kind[]).map((k) => (
              <Button key={k} size="sm" variant={kind === k ? "primary" : "ghost"} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
                {m.kind[k]}
              </Button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-muted">
            {m.message}
            <textarea
              className="ds-input h-32 py-2 text-[13px] font-normal text-ink"
              placeholder={kind === "bug" ? m.bugPh : m.ideaPh}
              value={message}
              maxLength={5000}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />
          </label>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) setShot(await shrink(f).catch(() => null));
            }}
          />
          {capturing ? (
            <p className="text-[12px] text-ink-muted">{m.capturing}</p>
          ) : shot ? (
            <div className="flex items-start gap-3">
              <img src={shot} alt={m.screenshot} className="h-24 max-w-[45%] rounded border border-border object-cover object-top" />
              <div className="flex flex-col items-start gap-1.5">
                <p className="text-[12px] text-ink-muted">{m.screenshotNote}</p>
                <Button size="sm" variant="ghost" onClick={() => setShot(null)}>{m.removeScreenshot}</Button>
              </div>
            </div>
          ) : (
            <div>
              <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>{m.addScreenshot}</Button>
            </div>
          )}
          <p className="text-[12px] text-ink-muted">{m.context}</p>
          {error && <p className="text-[12.5px] text-loss">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
