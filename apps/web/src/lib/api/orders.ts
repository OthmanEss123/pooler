import { apiFetch, type ApiQuery } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/contact";
import type { Order } from "@/types/order";

export function getOrders(query?: ApiQuery) {
  return apiFetch<PaginatedResponse<Order>>("/orders", { query });
}

export function getOrder(id: string) {
  return apiFetch<Order>(`/orders/${id}`);
}

export function createOrder(data: {
  contactEmail: string;
  externalId?: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  subtotal?: number;
  currency: string;
  placedAt: string;
  items: Array<{
    name: string;
    productId?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}) {
  return apiFetch<Order>("/orders", {
    method: "POST",
    body: data,
  });
}
