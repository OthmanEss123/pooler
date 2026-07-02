import { apiFetch, type ApiQuery } from "@/lib/api/client";
import type { Contact, PaginatedResponse } from "@/types/contact";

export function getContacts(query?: ApiQuery) {
  return apiFetch<PaginatedResponse<Contact>>("/contacts", { query });
}

export function getContact(id: string) {
  return apiFetch<Contact>(`/contacts/${id}`);
}

export function createContact(data: { email: string; firstName?: string; lastName?: string; phone?: string }) {
  return apiFetch<Contact>("/contacts", {
    method: "POST",
    body: data,
  });
}
