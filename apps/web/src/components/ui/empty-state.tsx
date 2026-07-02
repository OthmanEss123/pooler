import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: string;
  onClick?: () => void;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onClick,
}: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-line bg-neutral-50 text-neutral-900">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
        {description}
      </p>
      {action ? <Button className="mt-5" onClick={onClick}>{action}</Button> : null}
    </div>
  );
}
