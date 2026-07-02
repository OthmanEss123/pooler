"use client";

import { useEffect, useState } from "react";
import { Megaphone, Loader2, ArrowLeft, Plug, CheckCircle2, AlertCircle } from "lucide-react";
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
  getGoogleAdsStatus,
  getGoogleAdsOAuthUrl,
  connectGoogleAds,
  disconnectGoogleAds,
  syncGoogleAdsCampaigns,
  getGoogleAdsCampaigns,
  type GoogleAdsStatusResponse,
} from "@/lib/api/integrations";
import { formatCurrency } from "@/lib/format";

type Campaign = {
  id: string;
  name: string;
  type: string;
  status: string;
  budgetDaily: number;
  spend: number;
  clicks: number;
};

export default function GoogleAdsPage() {
  const [status, setStatus] = useState<GoogleAdsStatusResponse | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states (manual connection fallback)
  const [showManual, setShowManual] = useState(false);
  const [refreshToken, setRefreshToken] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const statusData = await getGoogleAdsStatus();
      setStatus(statusData);

      if (statusData.connected) {
        const campaignData = await getGoogleAdsCampaigns();
        setCampaigns(campaignData);
      }
    } catch (err) {
      setStatus({ connected: false, status: "DISCONNECTED" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOAuthConnect = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const { url } = await getGoogleAdsOAuthUrl();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start Google Ads OAuth flow.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConnectManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refreshToken || !customerId) {
      setError("Refresh Token and Customer ID are required.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSyncMessage(null);
    try {
      await connectGoogleAds({
        refreshToken: refreshToken.trim(),
        customerId: customerId.trim(),
      });
      setRefreshToken("");
      setCustomerId("");
      setSyncMessage("Successfully connected and queued Google Ads sync!");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect Google Ads account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect Google Ads?")) return;
    setIsSubmitting(true);
    setError(null);
    setSyncMessage(null);
    try {
      await disconnectGoogleAds();
      setStatus({ connected: false, status: "DISCONNECTED" });
      setCampaigns([]);
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
      const result = await syncGoogleAdsCampaigns();
      if (result.success) {
        setSyncMessage(`Synchronized successfully! Synced ${result.syncedCount} campaigns.`);
        loadData();
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

  const isConnected = status?.connected;

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
        description="Import campaign spend, performance metrics and audience sync health from Google Ads."
        eyebrow="Integration"
        title="Google Ads"
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
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-neutral-50 text-neutral-900">
                  <Megaphone className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle>Operational Health</CardTitle>
                  <CardDescription>Your Google Ads account is connected.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex gap-3">
                <Button onClick={handleSync} disabled={isSyncing || isSubmitting}>
                  {isSyncing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing campaigns...
                    </>
                  ) : (
                    "Sync campaigns now"
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
              <CardTitle>Synced Campaigns ({campaigns.length})</CardTitle>
              <CardDescription>Campaign metrics stored locally in the workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <p className="text-sm text-muted">No campaigns synced yet. Click &apos;Sync campaigns now&apos; above.</p>
              ) : (
                <div className="divide-y divide-line">
                  {campaigns.map((camp) => (
                    <div key={camp.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{camp.name}</p>
                        <p className="text-xs text-neutral-500 uppercase">{camp.type} • {camp.status}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-neutral-900">Spend: {formatCurrency(camp.spend)}</p>
                        <p className="text-xs text-neutral-500">Daily Budget: {formatCurrency(camp.budgetDaily)}/day</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                <CardTitle>Connect Google Ads</CardTitle>
                <CardDescription>
                  Sync campaigns, impressions, costs, and automate segment uploads.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center p-6 border border-dashed border-line rounded-lg bg-neutral-50">
              <Button onClick={handleOAuthConnect} disabled={isSubmitting} size="lg">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting OAuth...
                  </>
                ) : (
                  "Connect with Google Ads (OAuth)"
                )}
              </Button>
            </div>

            <div className="text-center">
              <button
                onClick={() => setShowManual(!showManual)}
                className="text-xs text-muted hover:text-ink hover:underline"
              >
                {showManual ? "Hide manual credentials form" : "Or connect manually (Developer/Sandbox)"}
              </button>
            </div>

            {showManual && (
              <form onSubmit={handleConnectManual} className="space-y-4 pt-4 border-t border-line animate-fade-in">
                <Input
                  id="customerId"
                  label="Google Ads Customer ID"
                  placeholder="e.g. 123-456-7890"
                  required
                  type="text"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  disabled={isSubmitting}
                />
                <Input
                  id="refreshToken"
                  label="OAuth Refresh Token"
                  placeholder="Enter your sandbox refresh token..."
                  required
                  type="password"
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  disabled={isSubmitting}
                />

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting manually...
                      </>
                    ) : (
                      "Connect Manually"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
