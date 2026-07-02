import { KeyRound, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { apiKeys } from "@/lib/mock-data";

const columns: Array<DataTableColumn<(typeof apiKeys)[number]>> = [
  { header: "Name", accessor: "name" },
  {
    header: "Prefix",
    cell: (row) => (
      <code className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
        {row.prefix}
      </code>
    ),
  },
  {
    header: "Scope",
    cell: (row) => <Badge variant="brand">{row.scope}</Badge>,
  },
  { header: "Last used", accessor: "lastUsed" },
];

export default function ApiKeysSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        actions={<Button icon={<Plus className="h-4 w-4" />}>Create key</Button>}
        description="Issue scoped keys for ingestion, read models and trusted internal services."
        eyebrow="Settings"
        title="API keys"
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Active keys</CardTitle>
            <CardDescription>
              Keep secrets rotated and limit access by scope.
            </CardDescription>
          </div>
          <KeyRound className="h-5 w-5 text-neutral-400" />
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={apiKeys} />
        </CardContent>
      </Card>
    </div>
  );
}
