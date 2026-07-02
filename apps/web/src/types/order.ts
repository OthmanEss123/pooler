export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "FULFILLED"
  | "CANCELLED"
  | "REFUNDED";

export type OrderItem = {
  id: string;
  orderId: string;
  name: string;
  sku?: string | null;
  quantity: number;
  unitPrice: string | number;
  totalPrice: string | number;
};

export type Order = {
  id: string;
  tenantId: string;
  contactId: string;
  contact?: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
  externalId: string;
  orderNumber?: string | null;
  status: OrderStatus;
  totalAmount: string | number;
  subtotal?: string | number | null;
  currency: string;
  source: string;
  placedAt: string;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
};
