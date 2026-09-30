"use client";

// Markdown uit het logboek, de analyses en de doelen. Ruwe HTML in de tekst wordt getoond als tekst, niet
// uitgevoerd: agents schrijven hier ook in.

import { useMemo } from "react";
import { Marked } from "marked";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return escape(text);
    },
    link({ href, text }) {
      const safe = /^(https?:|\/|#)/.test(href) ? href : "#";
      return `<a href="${escape(safe)}" target="${safe.startsWith("http") ? "_blank" : "_self"}" rel="noreferrer">${text}</a>`;
    },
  },
});

export default function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const html = useMemo(() => md.parse(text ?? "") as string, [text]);
  return (
    <div
      className={[
        "text-[13.5px] leading-relaxed",
        "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:font-display [&_h1]:text-[21px] [&_h1]:font-light",
        "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[15px] [&_h2]:font-semibold",
        "[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[13.5px] [&_h3]:font-semibold",
        "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
        "[&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold",
        "[&_code]:rounded [&_code]:bg-[var(--surface-inset)] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px]",
        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--surface-sunken)] [&_pre]:p-3",
        "[&_table]:my-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-[12.5px] [&_table]:tabular-nums",
        "[&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-normal [&_th]:text-ink-muted",
        "[&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
        "[&>*:first-child]:mt-0",
        className,
      ].join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
