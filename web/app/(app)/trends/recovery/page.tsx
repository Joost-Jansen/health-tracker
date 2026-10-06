"use client";

// Trends, recovery: recovery against your own normal and sleep against load (components/trends/TrendsView.tsx; the tabs are in lib/nav.ts).

import TrendsView from "@/components/trends/TrendsView";

export default function Page() {
  return <TrendsView tab="recovery" />;
}
