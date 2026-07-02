export type Product = {
  id: string;
  tenantId: string;
  externalId: string;
  name: string;
  sku?: string | null;
  price: string | number;
  imageUrl?: string | null;
  category?: string | null;
  tags: string[];
  stockQuantity?: number | null;
  lowStockAlert?: number | null;
  trackStock: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
