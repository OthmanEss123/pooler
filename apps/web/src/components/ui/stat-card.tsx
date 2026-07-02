import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "flat";
  icon: LucideIcon;
  detail?: string;
};

export function StatCard({
  label,
  value,
  change,
  trend = "up",
  icon: Icon,
  detail,
}: StatCardProps) {
  const TrendIcon = trend === "down" ? ArrowDownRight : ArrowUpRight;

  return (
    <Card className="p-5 transition hover:border-neutral-300 hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-normal text-ink">
            {value}
          </p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-neutral-50 text-neutral-700">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm">
        {change ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium",
              trend === "down"
                ? "border-neutral-300 bg-white text-neutral-700"
                : trend === "flat"
                  ? "border-neutral-200 bg-neutral-100 text-neutral-600"
                  : "border-neutral-950 bg-neutral-950 text-white",
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" />
            {change}
          </span>
        ) : null}
        {detail ? <span className="text-muted">{detail}</span> : null}
      </div>
    </Card>
  );
}
