import type { ReactNode } from "react";

function Metadata({ children }: { children: ReactNode }) {
  return <div className="text-muted-foreground space-y-1 text-sm">{children}</div>;
}

function MetadataRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0">{label}</span>
      <span className="border-border min-w-0 flex-1 border-b" />
      <span className="text-foreground min-w-0 truncate">{children}</span>
    </div>
  );
}

function formatRelativeTime(epochMs: number): string {
  const now = Temporal.Now.instant();
  const then = Temporal.Instant.fromEpochMilliseconds(epochMs);
  const duration = now.since(then);
  const totalSeconds = duration.total("seconds");

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (totalSeconds < 60) return rtf.format(-Math.floor(totalSeconds), "second");
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return rtf.format(-totalMinutes, "minute");
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return rtf.format(-totalHours, "hour");
  const totalDays = Math.floor(totalHours / 24);
  if (totalDays < 30) return rtf.format(-totalDays, "day");
  const totalMonths = Math.floor(totalDays / 30);
  if (totalMonths < 12) return rtf.format(-totalMonths, "month");
  return rtf.format(-Math.floor(totalDays / 365), "year");
}

export { formatRelativeTime, Metadata, MetadataRow };
