"use client";

// Health over time: the body's values per day or week against your own normal, and "Training and body"
// (components/trends/TrendsView.tsx, mode body; the tabs are in lib/nav.ts).

import TrendsView from "@/components/trends/TrendsView";

export default function Page() {
  return <TrendsView tab="body" />;
}
