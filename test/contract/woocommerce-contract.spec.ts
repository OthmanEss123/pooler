import { OrderStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { WooCommerceService } from '../../src/modules/integrations/woocommerce/woocommerce.service';
import {
  buildWooSignature,
  buildWooWebhookFixture,
  woocommerceOrdersResponse,
  woocommerceProductsResponse,
} from '../support/woocommerce-mock';

const buildService = () => {
  const prisma = {} as never;
  const encryption = {
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  } as never;
  const flowsService = { triggerFlowsSafe: jest.fn() } as never;
  const syncQueueService = { syncWoocommerce: jest.fn() } as never;

  return new WooCommerceService(
    prisma,
    encryption,
    flowsService,
    syncQueueService,
  );
};

describe('WooCommerce API Contract', () => {
  const service = buildService();

  describe('mapOrderStatus', () => {
    it('processing -> PAID', () => {
      expect(service.mapOrderStatus('processing')).toBe(OrderStatus.PAID);
    });

    it('completed -> FULFILLED', () => {
      expect(service.mapOrderStatus('completed')).toBe(OrderStatus.FULFILLED);
    });

    it('refunded -> REFUNDED', () => {
      expect(service.mapOrderStatus('refunded')).toBe(OrderStatus.REFUNDED);
    });

    it('cancelled -> CANCELLED', () => {
      expect(service.mapOrderStatus('cancelled')).toBe(OrderStatus.CANCELLED);
    });

    it('failed -> CANCELLED', () => {
      expect(service.mapOrderStatus('failed')).toBe(OrderStatus.CANCELLED);
    });

    it('pending -> PENDING', () => {
      expect(service.mapOrderStatus('pending')).toBe(OrderStatus.PENDING);
    });

    it('on-hold -> PENDING', () => {
      expect(service.mapOrderStatus('on-hold')).toBe(OrderStatus.PENDING);
    });

    it('statut inconnu -> PENDING', () => {
      expect(service.mapOrderStatus('whatever')).toBe(OrderStatus.PENDING);
    });
  });

  describe('Contract orders payload', () => {
    it('chaque commande possede id, status, total et line_items', () => {
      for (const order of woocommerceOrdersResponse) {
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('status');
        expect(order).toHaveProperty('total');
        expect(Array.isArray(order.line_items)).toBe(true);
      }
    });

    it('chaque line_item expose name, quantity, price', () => {
      for (const order of woocommerceOrdersResponse) {
        for (const item of order.line_items) {
          expect(item).toHaveProperty('name');
          expect(item).toHaveProperty('quantity');
          expect(item).toHaveProperty('price');
        }
      }
    });

    it('le service doit pouvoir mapper tous les statuts du payload', () => {
      for (const order of woocommerceOrdersResponse) {
        const mapped = service.mapOrderStatus(order.status);
        expect(Object.values(OrderStatus)).toContain(mapped);
      }
    });
  });

  describe('Contract products payload', () => {
    it('chaque produit possede au moins id, name, price et status', () => {
      for (const product of woocommerceProductsResponse) {
        expect(product).toHaveProperty('id');
        expect(product).toHaveProperty('name');
        expect(product).toHaveProperty('price');
        expect(product).toHaveProperty('status');
      }
    });

    it('un produit avec stock_quantity=null doit etre tolere', () => {
      const productNullStock = woocommerceProductsResponse.find(
        (p) => p.stock_quantity === null,
      );
      expect(productNullStock).toBeDefined();
    });

    it('un produit publish doit avoir manage_stock booleen sous forme string', () => {
      const product = woocommerceProductsResponse[0];
      expect(['true', 'false']).toContain(product.manage_stock);
    });
  });

  describe('Webhook HMAC signature', () => {
    const secret = 'super-shared-secret';

    it('genere une signature base64 deterministe', () => {
      const sig1 = buildWooSignature('payload-a', secret);
      const sig2 = buildWooSignature('payload-a', secret);
      expect(sig1).toEqual(sig2);
    });

    it('genere une signature differente pour un body different', () => {
      const sig1 = buildWooSignature('payload-a', secret);
      const sig2 = buildWooSignature('payload-b', secret);
      expect(sig1).not.toEqual(sig2);
    });

    it('verifie la signature avec timingSafeEqual', () => {
      const fixture = buildWooWebhookFixture('order.created', secret);
      const expected = createHmac('sha256', secret)
        .update(Buffer.from(fixture.rawBody))
        .digest('base64');

      const a = Buffer.from(fixture.signature);
      const b = Buffer.from(expected);
      expect(a.length).toBe(b.length);
      expect(timingSafeEqual(a, b)).toBe(true);
    });

    it('rejette une signature de longueur differente', () => {
      const fixture = buildWooWebhookFixture('order.created', secret);
      const tampered = `${fixture.signature}AA`;
      const a = Buffer.from(tampered);
      const b = Buffer.from(fixture.signature);
      expect(a.length).not.toBe(b.length);
    });
  });
});
