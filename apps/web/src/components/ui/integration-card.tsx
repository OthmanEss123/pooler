import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type IntegrationCardProps = {
  name: string;
  description: string;
  status: "Connected" | "Needs attention" | "Disconnected";
  href: string;
  icon: LucideIcon;
  meta: string;
};

export function IntegrationCard({
  name,
  description,
  status,
  href,
  icon: Icon,
  meta,
}: IntegrationCardProps) {
  const statusVariant =
    status === "Connected"
      ? "success"
      : status === "Needs attention"
        ? "warning"
        : "neutral";

  return (
    <Link className="group block" href={href}>
      <Card className="h-full p-5 transition hover:border-neutral-300 hover:shadow-lift">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-neutral-50 text-ink">
            <Icon className="h-5 w-5" />
          </span>
          <Badge variant={statusVariant}>{status}</Badge>
        </div>
        <div className="mt-5">
          <h3 className="text-base font-semibold text-ink">{name}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-muted">
            <CheckCircle2 className="h-3.5 w-3.5 text-neutral-500" />
            {meta}
          </span>
          <ArrowRight className="h-4 w-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-black" />
        </div>
      </Card>
    </Link>
  );
}
