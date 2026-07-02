"use client";

import { useEffect, useState } from "react";
import { BarChart3, Loader2, ArrowLeft, Plug, CheckCircle2, AlertCircle } from "lucide-react";
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
  getGa4Status,
  connectGa4,
  disconnectGa4,
  syncGa4Sessions,
  type IntegrationStatusResponse,
} from "@/lib/api/integrations";
import { formatDate } from "@/lib/format";

export default function Ga4Page() {
  const [status, setStatus] = useState<IntegrationStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states (Connect)
  const [propertyId, setPropertyId] = useState("");
  const [measurementId, setMeasurementId] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states (Sync)
  const [syncDate, setSyncDate] = useState(new Date().toISOString().slice(0, 10));
  const [syncSessions, setSyncSessions] = useState("150");
  const [syncNewContacts, setSyncNewContacts] = useState("10");
  const [syncRevenue, setSyncRevenue] = useState("250");
  const [syncOrders, setSyncOrders] = useState("5");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getGa4Status();
      setStatus(data);
    } catch (err) {
      setStatus({ connected: false, status: "DISCONNECTED", provider: "ga4" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) {
      setError("Property ID is required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSyncMessage(null);
    try {
      const result = await connectGa4({
        propertyId: propertyId.trim(),
        measurementId: measurementId.trim() || undefined,
        apiSecret: apiSecret.trim() || undefined,
      });
      setStatus(result);
      setPropertyId("");
      setMeasurementId("");
      setApiSecret("");
      setSyncMessage("Successfully connected GA4 integration!");
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Google Analytics 4.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect Google Analytics 4?")) return;
    setIsSubmitting(true);
    setError(null);
    setSyncMessage(null);
    try {
      await disconnectGa4();
      setStatus({ connected: false, status: "DISCONNECTED", provider: "ga4" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncDate || !syncSessions) {
      setError("Date and Sessions count are required.");
      return;
    }
    setIsSyncing(true);
    setSyncMessage(null);
    setError(null);
    try {
      const result = await syncGa4Sessions({
        date: syncDate,
        sessions: Number(syncSessions),
        newContacts: syncNewContacts ? Number(syncNewContacts) : undefined,
        revenue: syncRevenue ? Number(syncRevenue) : undefined,
        orders: syncOrders ? Number(syncOrders) : undefined,
      });
      if (result.success) {
        setSyncMessage(`Synchronized successfully for date ${result.date || syncDate}! Sessions: ${result.sessions || syncSessions}.`);
        loadStatus();
      } else {
        setError("Synchronize operation failed.");
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
        description="Stream session, event and conversion analytics from GA4 into your customer intelligence layer."
        eyebrow="Integration"
        title="Google Analytics 4 (GA4)"
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
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-neutral-50 text-neutral-900">
                    <BarChart3 className="h-5 w-5 text-neutral-950" />
                  </span>
                  <div>
                    <CardTitle>Operational Health</CardTitle>
                    <CardDescription>Your GA4 integration is active.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-line bg-neutral-50 p-4">
                    <p className="text-xs text-neutral-500">Event Ingestion Status</p>
                    <p className="mt-2 text-lg font-bold text-neutral-950">Active</p>
                  </div>
                  <div className="rounded-lg border border-line bg-neutral-50 p-4">
                    <p className="text-xs text-neutral-500">Last Synced At</p>
                    <p className="mt-2 text-sm font-bold text-neutral-950 truncate">
                      {status?.lastSyncAt ? formatDate(status.lastSyncAt) : "Never"}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-line">
                  <Button variant="secondary" onClick={handleDisconnect} disabled={isSyncing || isSubmitting}>
                    Disconnect Integration
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sync Sessions Simulation</CardTitle>
                <CardDescription>
                  Manually push mock GA4 session and conversion events directly to ClickHouse.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSync} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="syncDate"
                      label="Report Date"
                      type="date"
                      required
                      value={syncDate}
                      onChange={(e) => setSyncDate(e.target.value)}
                      disabled={isSyncing}
                    />
                    <Input
                      id="syncSessions"
                      label="Sessions Count"
                      type="number"
                      min="0"
                      required
                      value={syncSessions}
                      onChange={(e) => setSyncSessions(e.target.value)}
                      disabled={isSyncing}
                    />
                    <Input
                      id="syncNewContacts"
                      label="New Contacts"
                      type="number"
                      min="0"
                      value={syncNewContacts}
                      onChange={(e) => setSyncNewContacts(e.target.value)}
                      disabled={isSyncing}
                    />
                    <Input
                      id="syncRevenue"
                      label="Revenue ($)"
                      type="number"
                      min="0"
                      value={syncRevenue}
                      onChange={(e) => setSyncRevenue(e.target.value)}
                      disabled={isSyncing}
                    />
                    <Input
                      id="syncOrders"
                      label="Orders Count"
                      type="number"
                      min="0"
                      value={syncOrders}
                      onChange={(e) => setSyncOrders(e.target.value)}
                      disabled={isSyncing}
                    />
                  </div>

                  <div className="pt-4 border-t border-line flex justify-end">
                    <Button type="submit" disabled={isSyncing || isSubmitting}>
                      {isSyncing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Syncing sessions...
                        </>
                      ) : (
                        "Sync sessions now"
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Connection Settings</CardTitle>
              <CardDescription>Target GA4 Property details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-xs font-medium text-neutral-500">Property ID</span>
                <span className="text-xs font-semibold text-neutral-900">
                  {status?.propertyId ?? "Unknown"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-xs font-medium text-neutral-500">Measurement ID</span>
                <span className="text-xs font-semibold text-neutral-900">
                  {status?.measurementId ?? "Not configured"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="text-xs font-medium text-neutral-500">API Secret</span>
                <span className="text-xs font-semibold text-neutral-900">
                  {status?.propertyId ? "Stored securely" : "Not configured"}
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
                <CardTitle>Connect Google Analytics 4</CardTitle>
                <CardDescription>
                  Establish a secure connection to sync visitor events, attribution data, and session signals.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConnect} className="space-y-4">
              <Input
                id="propertyId"
                label="GA4 Property ID"
                placeholder="e.g. 123456789"
                required
                type="text"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                disabled={isSubmitting}
              />
              <Input
                id="measurementId"
                label="Measurement ID (Optional)"
                placeholder="e.g. G-XXXXXXXXXX"
                type="text"
                value={measurementId}
                onChange={(e) => setMeasurementId(e.target.value)}
                disabled={isSubmitting}
              />
              <Input
                id="apiSecret"
                label="API Secret (Optional, for events ingestion)"
                placeholder="Enter measurement protocol API secret..."
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
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
