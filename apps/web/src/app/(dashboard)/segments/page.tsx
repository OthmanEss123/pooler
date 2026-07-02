"use client";

import { useEffect, useState } from "react";
import { Layers3, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { getSegments, createSegment, deleteSegment } from "@/lib/api/segments";
import { ApiError } from "@/lib/api/client";
import type { Segment, SegmentType } from "@/types/segment";
import { formatNumber } from "@/lib/format";

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal creation states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<SegmentType>("DYNAMIC");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getSegments({ limit: 50 })
      .then((response) => {
        if (cancelled) return;
        setSegments(response.data);
        setError(null);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Unable to load segments from the backend.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const handleCreateSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      setCreateError("Segment name is required.");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      await createSegment({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        conditions: {},
      });
      setIsModalOpen(false);
      // Reset form
      setName("");
      setDescription("");
      setType("DYNAMIC");
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create segment.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSegment = async (id: string) => {
    if (!confirm("Are you sure you want to delete this segment?")) return;
    try {
      await deleteSegment(id);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete segment.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button
              icon={<RefreshCw className="h-4 w-4" />}
              variant="secondary"
              onClick={() => setRefreshKey((prev) => prev + 1)}
            >
              Recalculate
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsModalOpen(true)}>
              New segment
            </Button>
          </>
        }
        description="Build dynamic audiences for lifecycle marketing, retention and ad activation."
        eyebrow="Audiences"
        title="Segments"
      />

      {error ? (
        <p className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-line bg-white p-6 text-sm text-muted">
          Loading segments from the backend...
        </div>
      ) : segments.length === 0 ? (
        <EmptyState
          action="Create segment"
          description="Build dynamic audiences or create static user segments for VIP outreach."
          icon={Layers3}
          onClick={() => setIsModalOpen(true)}
          title="No segments found"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {segments.map((segment) => (
            <Card className="p-5 transition hover:border-neutral-300 hover:shadow-lift" key={segment.id}>
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-neutral-50 text-neutral-900">
                  <Layers3 className="h-5 w-5" />
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={segment.type === "GA4" ? "info" : "brand"}>
                    {segment.type}
                  </Badge>
                  <Button
                    variant="ghost"
                    className="p-1 min-w-0 h-auto text-neutral-400 hover:text-red-500 rounded-full hover:bg-neutral-100"
                    onClick={() => handleDeleteSegment(segment.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <h2 className="mt-5 text-lg font-semibold text-ink">{segment.name}</h2>
              <p className="mt-2 text-sm leading-6 text-muted h-12 overflow-hidden text-ellipsis line-clamp-2">
                {segment.description || "No description provided."}
              </p>
              <div className="mt-5 rounded-lg border border-line bg-neutral-50 p-4">
                <p className="text-xs text-muted">Contacts</p>
                <p className="mt-1 text-2xl font-semibold text-ink">{formatNumber(segment.contactCount)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Static segment workspace</CardTitle>
            <CardDescription>
              Create manual lists for launches, VIP outreach and experiments.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <EmptyState
            action="Create static segment"
            description="Static lists are useful for hand-picked audiences and one-off activation workflows."
            icon={Layers3}
            onClick={() => {
              setType("STATIC");
              setIsModalOpen(true);
            }}
            title="No static segments yet"
          />
        </CardContent>
      </Card>

      {/* New Segment Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Segment">
        <form onSubmit={handleCreateSegment} className="space-y-4">
          <Input
            id="name"
            label="Segment Name"
            placeholder="e.g. VIP Customers"
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            id="description"
            label="Description"
            placeholder="e.g. High revenue customers with recent purchase activity"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-neutral-900">Segment Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as SegmentType)}
              className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm transition hover:border-neutral-300"
            >
              <option value="DYNAMIC">Dynamic Segment</option>
              <option value="STATIC">Static List</option>
              <option value="GA4">Google Analytics 4</option>
            </select>
          </label>

          {createError ? (
            <div className="rounded-md border border-red-500/20 bg-red-50 p-3 text-xs text-red-600">
              {createError}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-4 border-t border-line">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Creating..." : "Create segment"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
