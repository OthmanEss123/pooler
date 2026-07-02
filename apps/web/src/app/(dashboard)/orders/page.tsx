"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { Download, Filter, ReceiptText, Plus, Trash2 } from "lucide-react";
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
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { getOrders, createOrder } from "@/lib/api/orders";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PaginatedResponse } from "@/types/contact";
import type { Order, OrderStatus } from "@/types/order";

type StatusFilter = "ALL" | OrderStatus;

function statusLabel(status: OrderStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.replace(/^\w/, (letter) => letter.toUpperCase()))
    .join(" ");
}

function paymentVariant(
  status: OrderStatus,
): ComponentProps<typeof Badge>["variant"] {
  if (status === "PAID" || status === "FULFILLED") return "success";
  if (status === "PENDING") return "warning";
  if (status === "REFUNDED") return "info";
  return "danger";
}

function customerName(order: Order) {
  const name = [order.contact?.firstName, order.contact?.lastName]
    .filter(Boolean)
    .join(" ");
  return name || order.contact?.email || order.contactId;
}

const columns: Array<DataTableColumn<Order>> = [
  {
    header: "Order",
    cell: (row) => (
      <div>
        <p className="font-semibold text-ink">
          #{row.orderNumber ?? row.externalId}
        </p>
        <p className="text-xs text-muted">{formatDate(row.placedAt)}</p>
      </div>
    ),
  },
  {
    header: "Customer",
    cell: (row) => (
      <div>
        <p className="font-medium text-ink">{customerName(row)}</p>
        <p className="text-xs text-muted">{row.contact?.email ?? row.contactId}</p>
      </div>
    ),
  },
  {
    header: "Revenue",
    cell: (row) => (
      <span className="font-semibold text-ink">
        {formatCurrency(row.totalAmount, row.currency)}
      </span>
    ),
  },
  {
    header: "Payment",
    cell: (row) => (
      <Badge variant={paymentVariant(row.status)}>{statusLabel(row.status)}</Badge>
    ),
  },
  {
    header: "Source",
    cell: (row) => <Badge variant="neutral">{row.source}</Badge>,
  },
];

export default function OrdersPage() {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<PaginatedResponse<Order> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal creation states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("PENDING");
  const [currency, setCurrency] = useState("USD");
  const [placedAt, setPlacedAt] = useState(() => {
    return new Date().toISOString().substring(0, 16); // Formats to YYYY-MM-DDTHH:mm
  });
  const [items, setItems] = useState<Array<{ name: string; quantity: number; unitPrice: number }>>([
    { name: "", quantity: 1, unitPrice: 0 },
  ]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getOrders({
      limit: 50,
      status: status === "ALL" ? undefined : status,
    })
      .then((response) => {
        if (cancelled) return;
        setOrders(response);
        setError(null);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "Unable to load orders from the backend.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, refreshKey]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const data = orders?.data ?? [];
    if (!query) return data;
    return data.filter((order) =>
      [
        order.id,
        order.externalId,
        order.orderNumber,
        order.source,
        order.contact?.email,
        customerName(order),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [orders?.data, search]);

  const paidRevenue = rows
    .filter((order) => order.status === "PAID" || order.status === "FULFILLED")
    .reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const pendingRevenue = rows
    .filter((order) => order.status === "PENDING")
    .reduce((sum, order) => sum + Number(order.totalAmount), 0);
  const refundedRevenue = rows
    .filter((order) => order.status === "REFUNDED")
    .reduce((sum, order) => sum + Number(order.totalAmount), 0);

  // Auto-calculated total amount for order creation
  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  }, [items]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail || !orderNumber) {
      setCreateError("Customer email and order number are required.");
      return;
    }
    if (items.some((item) => !item.name || item.quantity < 1 || item.unitPrice < 0)) {
      setCreateError("Please verify all items have a name, quantity >= 1, and price >= 0.");
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const generatedExternalId = `ord-${orderNumber.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
      await createOrder({
        contactEmail: contactEmail.trim(),
        externalId: generatedExternalId,
        orderNumber: orderNumber.trim(),
        status: orderStatus,
        totalAmount,
        currency,
        placedAt: new Date(placedAt).toISOString(),
        items: items.map((item) => ({
          name: item.name.trim(),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.quantity * item.unitPrice,
        })),
      });
      setIsModalOpen(false);
      // Reset form
      setContactEmail("");
      setOrderNumber("");
      setOrderStatus("PENDING");
      setCurrency("USD");
      setPlacedAt(new Date().toISOString().substring(0, 16));
      setItems([{ name: "", quantity: 1, unitPrice: 0 }]);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create order.");
    } finally {
      setIsCreating(false);
    }
  };

  const addItemRow = () => {
    setItems([...items, { name: "", quantity: 1, unitPrice: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  const updateItemField = (index: number, field: "name" | "quantity" | "unitPrice", value: any) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [field]: field === "name" ? value : parseFloat(value) || 0,
    };
    setItems(updated);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button icon={<Filter className="h-4 w-4" />} variant="secondary">
              Filters
            </Button>
            <Button icon={<Download className="h-4 w-4" />} variant="secondary">
              Export
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setIsModalOpen(true)}>
              Create order
            </Button>
          </>
        }
        description="Track payment status, fulfillment signals and revenue from connected commerce sources."
        eyebrow="Commerce"
        title="Orders"
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Order activity</CardTitle>
            <CardDescription>
              Live synced revenue and lifecycle status from the backend.
            </CardDescription>
          </div>
          <ReceiptText className="h-5 w-5 text-neutral-400" />
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SearchBar
              className="w-full md:max-w-md"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search orders"
              value={search}
            />
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-lg border border-line px-3 py-2">
                <p className="text-xs text-muted">Paid</p>
                <p className="font-semibold text-ink">
                  {formatCurrency(paidRevenue)}
                </p>
              </div>
              <div className="rounded-lg border border-line px-3 py-2">
                <p className="text-xs text-muted">Pending</p>
                <p className="font-semibold text-ink">
                  {formatCurrency(pendingRevenue)}
                </p>
              </div>
              <div className="rounded-lg border border-line px-3 py-2">
                <p className="text-xs text-muted">Refunded</p>
                <p className="font-semibold text-ink">
                  {formatCurrency(refundedRevenue)}
                </p>
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(["ALL", "PAID", "FULFILLED", "PENDING", "REFUNDED"] as const).map(
              (filter) => (
                <button
                  className={
                    filter === status
                      ? "focus-ring rounded-full bg-brand-500 px-3 py-1.5 text-xs font-medium text-white"
                      : "focus-ring rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                  }
                  key={filter}
                  onClick={() => setStatus(filter)}
                >
                  {filter === "ALL" ? "All" : statusLabel(filter)}
                </button>
              ),
            )}
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink">
              {error}
            </p>
          ) : null}

          {isLoading && rows.length === 0 ? (
            <div className="rounded-lg border border-line bg-white p-6 text-sm text-muted">
              Loading orders from the backend...
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              empty={
                <EmptyState
                  description="Orders will appear here after WooCommerce or manual order creation starts syncing."
                  icon={ReceiptText}
                  title="No orders found"
                />
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Create Order Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create Order">
        <form onSubmit={handleCreateOrder} className="space-y-4">
          <Input
            id="contactEmail"
            label="Customer Email Address"
            placeholder="e.g. customer@example.com"
            required
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="orderNumber"
              label="Order Number"
              placeholder="e.g. 1001"
              required
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
            />
            <Input
              id="currency"
              label="Currency"
              placeholder="e.g. USD"
              required
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-neutral-900">Payment Status</span>
              <select
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value as OrderStatus)}
                className="focus-ring h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-sm transition hover:border-neutral-300"
              >
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
                <option value="FULFILLED">Fulfilled</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </label>
            <Input
              id="placedAt"
              label="Placed At Date"
              required
              type="datetime-local"
              value={placedAt}
              onChange={(e) => setPlacedAt(e.target.value)}
            />
          </div>

          {/* Line Items section */}
          <div className="border-t border-line pt-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-neutral-900">Order Line Items</h3>
              <Button size="sm" icon={<Plus className="h-3 w-3" />} onClick={addItemRow}>
                Add Item
              </Button>
            </div>

            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1">
                    {idx === 0 ? <span className="mb-1 block text-xs font-semibold text-neutral-500">Item Name</span> : null}
                    <input
                      placeholder="Product/Item Name"
                      required
                      type="text"
                      className="focus-ring h-9 w-full rounded-md border border-line bg-white px-2.5 text-xs text-ink shadow-sm transition hover:border-neutral-300"
                      value={item.name}
                      onChange={(e) => updateItemField(idx, "name", e.target.value)}
                    />
                  </div>
                  <div className="w-16">
                    {idx === 0 ? <span className="mb-1 block text-xs font-semibold text-neutral-500">Qty</span> : null}
                    <input
                      min="1"
                      required
                      type="number"
                      className="focus-ring h-9 w-full rounded-md border border-line bg-white px-2 text-xs text-ink shadow-sm transition hover:border-neutral-300"
                      value={item.quantity}
                      onChange={(e) => updateItemField(idx, "quantity", e.target.value)}
                    />
                  </div>
                  <div className="w-24">
                    {idx === 0 ? <span className="mb-1 block text-xs font-semibold text-neutral-500">Unit Price</span> : null}
                    <input
                      min="0"
                      step="0.01"
                      required
                      type="number"
                      className="focus-ring h-9 w-full rounded-md border border-line bg-white px-2 text-xs text-ink shadow-sm transition hover:border-neutral-300"
                      value={item.unitPrice || ""}
                      onChange={(e) => updateItemField(idx, "unitPrice", e.target.value)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => removeItemRow(idx)}
                    disabled={items.length === 1}
                    className="p-2 min-w-0 h-9 rounded-md border border-transparent hover:bg-red-50 text-red-500 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between bg-neutral-50 p-3 rounded-lg border border-line mt-4">
            <span className="text-sm font-semibold text-neutral-600">Total Calculated Revenue:</span>
            <span className="text-base font-bold text-neutral-900">{formatCurrency(totalAmount, currency)}</span>
          </div>

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
              {isCreating ? "Creating..." : "Create order"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
