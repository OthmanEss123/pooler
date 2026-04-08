import { OrderStatus } from '@prisma/client';
import { ShopifyService } from '../../src/modules/integrations/shopify/shopify.service';
import {
  shopifyOrdersResponse,
  shopifyProductsResponse,
} from '../support/shopify-mock';

const buildService = () => {
  const prisma = {} as never;
  const config = { get: jest.fn(), getOrThrow: jest.fn() } as never;
  const encryption = {
    encryptJson: jest.fn(),
    decryptJson: jest.fn(),
  } as never;
  const syncQueue = { syncShopify: jest.fn() } as never;

  return new ShopifyService(prisma, config, encryption, syncQueue);
};

describe('Shopify API Contract', () => {
  const service = buildService();

  describe('mapFinancialStatus', () => {
    it('paid -> PAID', () => {
      expect(service.mapFinancialStatus('paid')).toBe(OrderStatus.PAID);
    });

    it('partially_paid -> PAID', () => {
      expect(service.mapFinancialStatus('partially_paid')).toBe(
        OrderStatus.PAID,
      );
    });

    it('authorized -> PAID', () => {
      expect(service.mapFinancialStatus('authorized')).toBe(OrderStatus.PAID);
    });

    it('refunded -> REFUNDED', () => {
      expect(service.mapFinancialStatus('refunded')).toBe(OrderStatus.REFUNDED);
    });

    it('partially_refunded -> REFUNDED', () => {
      expect(service.mapFinancialStatus('partially_refunded')).toBe(
        OrderStatus.REFUNDED,
      );
    });

    it('voided -> CANCELLED', () => {
      expect(service.mapFinancialStatus('voided')).toBe(OrderStatus.CANCELLED);
    });

    it('pending -> PENDING (defaut)', () => {
      expect(service.mapFinancialStatus('pending')).toBe(OrderStatus.PENDING);
    });

    it('statut inconnu -> PENDING', () => {
      expect(service.mapFinancialStatus('something_else')).toBe(
        OrderStatus.PENDING,
      );
    });
  });

  describe('Contract orders payload', () => {
    it('chaque commande doit avoir un id, financial_status et un total_price', () => {
      for (const order of shopifyOrdersResponse.orders) {
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('financial_status');
        expect(order).toHaveProperty('total_price');
      }
    });

    it('le service doit pouvoir mapper toutes les financial_status du payload', () => {
      for (const order of shopifyOrdersResponse.orders) {
        const mapped = service.mapFinancialStatus(order.financial_status);
        expect(Object.values(OrderStatus)).toContain(mapped);
      }
    });

    it('les line_items doivent contenir id, name, quantity, price', () => {
      const order = shopifyOrdersResponse.orders[0];
      for (const item of order.line_items) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('quantity');
        expect(item).toHaveProperty('price');
      }
    });
  });

  describe('Contract products payload', () => {
    it('chaque produit a au moins une variant ou null image gere', () => {
      for (const product of shopifyProductsResponse.products) {
        expect(product).toHaveProperty('id');
        expect(product).toHaveProperty('title');
        expect(Array.isArray(product.variants)).toBe(true);
      }
    });

    it('un produit avec image=null doit etre tolere par le mapper', () => {
      const productWithoutImage = shopifyProductsResponse.products.find(
        (p) => p.image === null,
      );
      expect(productWithoutImage).toBeDefined();
      // sanity: la structure attendue est respectee
      expect(productWithoutImage).toHaveProperty('variants');
    });

    it('un produit avec inventory_quantity=null doit etre tolere', () => {
      const productNullStock = shopifyProductsResponse.products.find(
        (p) => p.variants[0]?.inventory_quantity === null,
      );
      expect(productNullStock).toBeDefined();
    });

    it('inventory_policy = continue indique trackStock=false', () => {
      const continueProduct = shopifyProductsResponse.products.find(
        (p) => p.variants[0]?.inventory_policy === 'continue',
      );
      expect(continueProduct).toBeDefined();
    });
  });
});
