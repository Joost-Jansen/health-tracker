"use client";

// Light/dark switch. The choice lands on <html data-theme> (the CSS token
// blocks in globals.css key off it) and in localStorage, which the pre-paint
// script in app/layout.tsx replays on the next load. No choice saved -> the
// OS preference decides via the @media block.

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";
import { IconButton } from "@/components/ds";
import { useT } from "@/lib/i18n";

function currentTheme(): "light" | "dark" {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  // Rendered as moon until mounted: the server cannot know the client theme,
  // and a wrong icon for one frame beats a hydration mismatch.
  const t = useT();
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => setTheme(currentTheme()), []);

  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode: the toggle still works for this page load */
    }
    setTheme(next);
  }

  return (
    <IconButton
      onClick={toggle}
      label={theme === "dark" ? t.nav.toLight : t.nav.toDark}
      icon={
        theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />
      }
    />
  );
}
