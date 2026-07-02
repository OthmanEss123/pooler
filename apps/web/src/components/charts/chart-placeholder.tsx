import { cn } from "@/lib/utils";

type ChartPlaceholderProps = {
  values: number[];
  className?: string;
  label?: string;
};

export function ChartPlaceholder({
  values,
  className,
  label = "Revenue trend",
}: ChartPlaceholderProps) {
  return (
    <div className={cn("h-72 rounded-lg bg-white p-5", className)}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">{label}</p>
          <div className="flex gap-2 text-xs text-muted">
            <span>Revenue</span>
            <span>Orders</span>
          </div>
        </div>
        <div className="mt-6 grid flex-1 grid-cols-12 items-end gap-2">
          {values.map((value, index) => (
            <div
              className="relative flex min-h-20 items-end rounded-t-md bg-neutral-100"
              key={`${value}-${index}`}
            >
              <div
                aria-label={`${label} point ${index + 1}`}
                className="w-full rounded-t-md bg-neutral-950 shadow-sm"
                style={{ height: `${value}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-4 text-xs text-muted">
          <span>Week 1</span>
          <span className="text-center">Week 2</span>
          <span className="text-center">Week 3</span>
          <span className="text-right">Week 4</span>
        </div>
      </div>
    </div>
  );
}
