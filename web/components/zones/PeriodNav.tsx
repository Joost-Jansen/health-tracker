// ‹ periode › met "Nu" om terug te springen. Offset 0 is de lopende week of
// maand; verder dan nu kan niet, dus › staat daar uit.

import { Button, IconButton } from "@/components/ds";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

export default function PeriodNav({
  label,
  offset,
  onChange,
  loading = false,
}: {
  label: string;
  offset: number;
  onChange: (offset: number) => void;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Vorige periode" size="sm" icon={<ChevronLeftIcon width={15} height={15} />} onClick={() => onChange(offset + 1)} />
      <span
        aria-live="polite"
        className={`min-w-[9.5rem] text-center text-[12.5px] tabular-nums transition-opacity ${loading ? "opacity-60" : ""}`}
      >
        {label}
      </span>
      <IconButton label="Volgende periode" size="sm" icon={<ChevronRightIcon width={15} height={15} />} disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - 1))} />
      {offset > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange(0)}>
          Nu
        </Button>
      )}
    </div>
  );
}
