"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Filter, Plus, Users } from "lucide-react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchBar } from "@/components/ui/search-bar";
import { ApiError } from "@/lib/api/client";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { getContacts, createContact } from "@/lib/api/contacts";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { Contact, EmailStatus, PaginatedResponse } from "@/types/contact";

function contactName(contact: Contact) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return name || contact.email;
}

function initials(contact: Contact) {
  const name = contactName(contact);
  return name
    .split(/[ @.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function statusLabel(status: EmailStatus) {
  return status
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function contactStatusVariant(
  status: EmailStatus,
): ComponentProps<typeof Badge>["variant"] {
  if (status === "SUBSCRIBED") return "success";
  if (status === "PENDING") return "warning";
  if (status === "BOUNCED" || status === "COMPLAINED") return "danger";
  return "neutral";
}

const columns: Array<DataTableColumn<Contact>> = [
  {
    header: "Contact",
    cell: (row) => (
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-neutral-50 text-sm font-semibold text-neutral-800">
          {initials(row)}
        </span>
        <div>
          <p className="font-semibold text-ink">{contactName(row)}</p>
          <p className="text-xs text-muted">{row.email}</p>
        </div>
      </div>
    ),
  },
  {
    header: "Source",
    cell: (row) => row.sourceChannel ?? "Direct",
  },
  {
    header: "Revenue",
    cell: (row) => (
      <span className="font-semibold text-ink">
        {formatCurrency(row.totalRevenue)}
      </span>
    ),
  },
  {
    header: "Orders",
    cell: (row) => formatNumber(row.totalOrders),
  },
  {
    header: "Email status",
    cell: (row) => (
      <Badge variant={contactStatusVariant(row.emailStatus)}>
        {statusLabel(row.emailStatus)}
      </Badge>
    ),
  },
];

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<PaginatedResponse<Contact> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal creation states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const timer = window.setTimeout(() => {
      getContacts({ limit: 50, search: search || undefined })
        .then((response) => {
          if (cancelled) return;
          setContacts(response);
          setError(null);
        })
        .catch((requestError) => {
          if (cancelled) return;
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : "Unable to load contacts from the backend.",
          );
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, refreshKey]);

  const rows = contacts?.data ?? [];

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) {
      setCreateError("Email address is required.");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      await createContact({
        email: newEmail.trim(),
        firstName: newFirstName.trim() || undefined,
        lastName: newLastName.trim() || undefined,
        phone: newPhone.trim() || undefined,
      });
      setIsModalOpen(false);
      // Reset form
      setNewEmail("");
      setNewFirstName("");
      setNewLastName("");
      setNewPhone("");
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create contact.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button icon={<Filter className="h-4 w-4" />} variant="secondary">
              Filters
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsModalOpen(true)}>
              Add contact
            </Button>
          </>
        }
        description="Understand profiles, email status, value and lifecycle segments from every connected source."
        eyebrow="Customer data"
        title="Contacts"
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Contact directory</CardTitle>
            <CardDescription>
              Live data from the backend contacts endpoint.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SearchBar
              className="w-full md:max-w-md"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              value={search}
            />
            <div className="rounded-lg border border-line px-3 py-2 text-sm text-muted">
              {isLoading ? "Loading..." : `${contacts?.total ?? 0} contacts`}
            </div>
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink">
              {error}
            </p>
          ) : null}

          {isLoading && rows.length === 0 ? (
            <div className="rounded-lg border border-line bg-white p-6 text-sm text-muted">
              Loading contacts from the backend...
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              empty={
                <EmptyState
                  action="Import contacts"
                  description="Connect WooCommerce or upload a CSV to start building your customer graph."
                  icon={Users}
                  title="No contacts yet"
                />
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Add Contact Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Contact">
        <form onSubmit={handleCreateContact} className="space-y-4">
          <Input
            id="email"
            label="Email address"
            placeholder="e.g. customer@example.com"
            required
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="firstName"
              label="First name"
              placeholder="e.g. John"
              type="text"
              value={newFirstName}
              onChange={(e) => setNewFirstName(e.target.value)}
            />
            <Input
              id="lastName"
              label="Last name"
              placeholder="e.g. Doe"
              type="text"
              value={newLastName}
              onChange={(e) => setNewLastName(e.target.value)}
            />
          </div>
          <Input
            id="phone"
            label="Phone number"
            placeholder="e.g. +1234567890"
            type="tel"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
          />

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
              {isCreating ? "Adding..." : "Add contact"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
