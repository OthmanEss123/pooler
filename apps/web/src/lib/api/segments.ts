import { apiFetch, type ApiQuery } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/contact";
import type { Segment, SegmentType } from "@/types/segment";

export function getSegments(query?: ApiQuery) {
  return apiFetch<PaginatedResponse<Segment>>("/segments", { query });
}

export function getSegment(id: string) {
  return apiFetch<Segment>(`/segments/${id}`);
}

export function createSegment(data: {
  name: string;
  description?: string;
  type: SegmentType;
  conditions?: Record<string, any>;
}) {
  return apiFetch<Segment>("/segments", {
    method: "POST",
    body: data,
  });
}

export function deleteSegment(id: string) {
  return apiFetch<void>(`/segments/${id}`, {
    method: "DELETE",
  });
}
