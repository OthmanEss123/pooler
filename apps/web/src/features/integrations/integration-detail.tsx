import type { LucideIcon } from "lucide-react";
import { Activity, CheckCircle2, Clock3, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

type IntegrationDetailProps = {
  name: string;
  description: string;
  status: "Connected" | "Needs attention" | "Disconnected";
  icon: LucideIcon;
  metrics: Array<{ label: string; value: string }>;
  settings: Array<{ label: string; value: string }>;
  sync: Array<{ label: string; value: string; state: "success" | "warning" }>;
  primaryAction: string;
};

export function IntegrationDetail({
  name,
  description,
  status,
  icon: Icon,
  metrics,
  settings,
  sync,
  primaryAction,
}: IntegrationDetailProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button variant="secondary">View logs</Button>
            <Button>{primaryAction}</Button>
          </>
        }
        description={description}
        eyebrow="Integration"
        title={name}
      />

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-neutral-50 text-neutral-900">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Connection status</CardTitle>
                <CardDescription>Operational health and current sync state.</CardDescription>
              </div>
            </div>
            <Badge
              variant={
                status === "Connected"
                  ? "success"
                  : status === "Needs attention"
                    ? "warning"
                    : "neutral"
              }
            >
              {status}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {metrics.map((metric) => (
                <div className="rounded-lg border border-line bg-neutral-50 p-4" key={metric.label}>
                  <p className="text-xs text-muted">{metric.label}</p>
                  <p className="mt-2 text-xl font-semibold text-ink">{metric.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Workspace settings used by this connector.</CardDescription>
            </div>
            <Settings2 className="h-5 w-5 text-neutral-400" />
          </CardHeader>
          <CardContent className="space-y-3">
            {settings.map((setting) => (
              <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2" key={setting.label}>
                <span className="text-sm text-muted">{setting.label}</span>
                <span className="text-sm font-medium text-ink">{setting.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sync activity</CardTitle>
            <CardDescription>Recent jobs, imports and event flow.</CardDescription>
          </div>
          <Activity className="h-5 w-5 text-neutral-400" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {sync.map((item) => (
              <div className="rounded-lg border border-line p-4" key={item.label}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  {item.state === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-neutral-900" />
                  ) : (
                    <Clock3 className="h-4 w-4 text-neutral-500" />
                  )}
                </div>
                <p className="mt-2 text-sm text-muted">{item.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
