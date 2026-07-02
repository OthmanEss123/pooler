import { CreditCard, Download, WalletCards } from "lucide-react";
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

const invoices = [
  { id: "inv_1", date: "May 1, 2026", amount: "$299.00", status: "Paid" },
  { id: "inv_2", date: "Apr 1, 2026", amount: "$299.00", status: "Paid" },
  { id: "inv_3", date: "Mar 1, 2026", amount: "$299.00", status: "Paid" },
];

const usage = [
  { label: "Contacts", value: "72% used", width: "72%" },
  { label: "Events", value: "41% used", width: "41%" },
  { label: "API calls", value: "28% used", width: "28%" },
];

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        actions={<Button variant="secondary">Manage subscription</Button>}
        description="Review plan usage, payment method and invoices for this tenant."
        eyebrow="Settings"
        title="Billing"
      />

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Growth plan</CardTitle>
              <CardDescription>Designed for scaling commerce teams.</CardDescription>
            </div>
            <Badge variant="success">Active</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold text-ink">$299</p>
            <p className="mt-1 text-sm text-muted">per month, billed monthly</p>
            <div className="mt-6 space-y-3">
              {usage.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted">{item.label}</span>
                    <span className="font-semibold text-ink">{item.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100">
                    <div
                      className="h-2 rounded-full bg-brand-500"
                      style={{ width: item.width }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Payment and invoices</CardTitle>
              <CardDescription>Latest billing records and card details.</CardDescription>
            </div>
            <CreditCard className="h-5 w-5 text-neutral-400" />
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-lg border border-line bg-neutral-50 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-white text-neutral-700">
                  <WalletCards className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-ink">Visa ending in 4242</p>
                  <p className="text-sm text-muted">Renews on Jun 1, 2026</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-3"
                  key={invoice.id}
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">{invoice.date}</p>
                    <p className="text-xs text-muted">{invoice.amount}</p>
                  </div>
                  <Button icon={<Download className="h-4 w-4" />} size="sm" variant="secondary">
                    PDF
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
