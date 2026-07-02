"use client";

import { useEffect, useState } from "react";
import { Store, Loader2, ArrowLeft, Plug, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import {
  getWooCommerceStatus,
  connectWooCommerce,
  disconnectWooCommerce,
  syncWooCommerce,
  type IntegrationStatusResponse,
} from "@/lib/api/integrations";
import { formatDate } from "@/lib/format";

export default function WooCommercePage() {
  const [status, setStatus] = useState<IntegrationStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [siteUrl, setSiteUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getWooCommerceStatus();
      setStatus(data);
    } catch (err) {
      setStatus({ connected: false, status: "DISCONNECTED", provider: "woocommerce" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteUrl || !consumerKey || !consumerSecret) {
      setError("All fields are required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSyncMessage(null);
    try {
      const result = await connectWooCommerce({
        siteUrl: siteUrl.trim(),
        consumerKey: consumerKey.trim(),
        consumerSecret: consumerSecret.trim(),
      });
      setStatus(result);
      setSiteUrl("");
      setConsumerKey("");
      setConsumerSecret("");
      setSyncMessage("Successfully connected and queued WooCommerce sync!");
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect WooCommerce store.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect WooCommerce?")) return;
    setIsSubmitting(true);
    setError(null);
    setSyncMessage(null);
    try {
      await disconnectWooCommerce();
      setStatus({ connected: false, status: "DISCONNECTED", provider: "woocommerce" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const result = await syncWooCommerce(true);
      if (result.success) {
        setSyncMessage("Synchronized store successfully!");
        loadStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  const isConnected = status?.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/integrations"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-neutral-500 hover:bg-neutral-50 hover:text-black transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-xs font-semibold text-neutral-500">Back to Integrations</span>
      </div>

      <PageHeader
        description="Sync orders, customers, products and store webhooks into your marketing analytics workspace."
        eyebrow="Integration"
        title="WooCommerce"
      />

      {error ? (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {syncMessage ? (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p>{syncMessage}</p>
        </div>
      ) : null}

      {isConnected ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-neutral-50 text-neutral-900">
                  <Store className="h-5 w-5 text-neutral-950" />
                </span>
                <div>
                  <CardTitle>Operational Health</CardTitle>
                  <CardDescription>Your WooCommerce store is connected.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-neutral-50 p-4">
                  <p className="text-xs text-neutral-500">Webhook Status</p>
                  <p className="mt-2 text-lg font-bold text-neutral-950">Active</p>
                </div>
                <div className="rounded-lg border border-line bg-neutral-50 p-4">
                  <p className="text-xs text-neutral-500">Last Synced At</p>
                  <p className="mt-2 text-sm font-bold text-neutral-950 truncate">
                    {status?.lastSyncAt ? formatDate(status.lastSyncAt) : "Never"}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 border-t border-line pt-5">
                <Button onClick={handleSync} disabled={isSyncing || isSubmitting}>
                  {isSyncing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing store...
                    </>
                  ) : (
                    "Sync store now"
                  )}
                </Button>
                <Button variant="secondary" onClick={handleDisconnect} disabled={isSyncing || isSubmitting}>
                  Disconnect Integration
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Connection Settings</CardTitle>
              <CardDescription>Target shop details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-xs font-medium text-neutral-500">Store URL</span>
                <span className="text-xs font-semibold text-neutral-900 truncate max-w-[200px]">
                  {status?.metadata?.siteUrl ?? "Unknown"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-xs font-medium text-neutral-500">Connected At</span>
                <span className="text-xs font-semibold text-neutral-900">
                  {status?.metadata?.connectedAt ? formatDate(status.metadata.connectedAt) : "Unknown"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-neutral-50 text-neutral-900">
                <Plug className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Connect WooCommerce</CardTitle>
                <CardDescription>
                  Establish a secure basic auth channel to sync product catalog and orders.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConnect} className="space-y-4">
              <Input
                id="siteUrl"
                label="Store Website URL"
                placeholder="e.g. https://my-wordpress-store.com"
                required
                type="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                disabled={isSubmitting}
              />
              <Input
                id="consumerKey"
                label="Consumer Key"
                placeholder="e.g. ck_xxxxxxxxxxxxxxxxx"
                required
                type="text"
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                disabled={isSubmitting}
              />
              <Input
                id="consumerSecret"
                label="Consumer Secret"
                placeholder="e.g. cs_xxxxxxxxxxxxxxxxx"
                required
                type="password"
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                disabled={isSubmitting}
              />

              <div className="pt-4 border-t border-line flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    "Establish Connection"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
