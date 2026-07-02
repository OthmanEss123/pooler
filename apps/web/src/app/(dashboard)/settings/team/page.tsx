import type { ComponentProps } from "react";
import { MailPlus, Users } from "lucide-react";
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
import { teamMembers } from "@/lib/mock-data";

function memberVariant(status: string): ComponentProps<typeof Badge>["variant"] {
  return status === "Active" ? "success" : "warning";
}

const columns: Array<DataTableColumn<(typeof teamMembers)[number]>> = [
  {
    header: "Member",
    cell: (row) => (
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-neutral-50 text-sm font-semibold text-neutral-700">
          {row.name
            .split(" ")
            .map((part) => part[0])
            .join("")}
        </span>
        <div>
          <p className="font-semibold text-ink">{row.name}</p>
          <p className="text-xs text-muted">{row.email}</p>
        </div>
      </div>
    ),
  },
  { header: "Role", accessor: "role" },
  {
    header: "Status",
    cell: (row) => <Badge variant={memberVariant(row.status)}>{row.status}</Badge>,
  },
];

export default function TeamSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        actions={<Button icon={<MailPlus className="h-4 w-4" />}>Invite member</Button>}
        description="Manage roles, invitations and team access for this tenant."
        eyebrow="Settings"
        title="Team"
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>Owners and admins can invite new users.</CardDescription>
          </div>
          <Users className="h-5 w-5 text-neutral-400" />
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={teamMembers} />
        </CardContent>
      </Card>
    </div>
  );
}
