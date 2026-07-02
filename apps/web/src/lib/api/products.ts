import { apiFetch, type ApiQuery } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/contact";
import type { Product } from "@/types/product";

export function getProducts(query?: ApiQuery) {
  return apiFetch<PaginatedResponse<Product>>("/products", { query });
}

export function getLowStockProducts() {
  return apiFetch<Product[]>("/products/low-stock");
}

export function getProduct(id: string) {
  return apiFetch<Product>(`/products/${id}`);
}

export function createProduct(data: {
  externalId: string;
  name: string;
  sku?: string;
  price: number;
  imageUrl?: string;
  category?: string;
  tags?: string[];
  stockQuantity?: number;
  lowStockAlert?: number;
  trackStock?: boolean;
}) {
  return apiFetch<Product>("/products", {
    method: "POST",
    body: data,
  });
}
