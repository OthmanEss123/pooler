import type { Type } from '@nestjs/common';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type {
  Resolvable,
  ThrottlerGenerateKeyFunction,
  ThrottlerGetTrackerFunction,
} from '@nestjs/throttler';
import {
  THROTTLER_BLOCK_DURATION,
  THROTTLER_KEY_GENERATOR,
  THROTTLER_LIMIT,
  THROTTLER_SKIP,
  THROTTLER_TRACKER,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';

interface TrackerRequest extends Record<string, unknown> {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  ips?: string[];
  socket?: {
    remoteAddress?: string;
  };
}

type ThrottlerHandler = (...args: unknown[]) => unknown;

@Injectable()
export class ThrottlerProxyGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler() as ThrottlerHandler;
    const classRef = context.getClass<unknown>();

    if (await this.shouldSkip(context)) {
      return true;
    }

    const decisions: boolean[] = [];

    for (const namedThrottler of this.throttlers) {
      const throttlerName = namedThrottler.name ?? 'default';

      if (
        throttlerName !== 'default' &&
        throttlerName !== 'global' &&
        !this.hasNamedOverride(handler, classRef, throttlerName)
      ) {
        continue;
      }

      const skip = this.reflector.getAllAndOverride<boolean>(
        THROTTLER_SKIP + throttlerName,
        [handler, classRef],
      );
      const skipIf = namedThrottler.skipIf ?? this.commonOptions.skipIf;

      if (skip === true || skipIf?.(context) === true) {
        decisions.push(true);
        continue;
      }

      const routeOrClassLimit = this.reflector.getAllAndOverride<
        Resolvable<number>
      >(THROTTLER_LIMIT + throttlerName, [handler, classRef]);
      const routeOrClassTtl = this.reflector.getAllAndOverride<
        Resolvable<number>
      >(THROTTLER_TTL + throttlerName, [handler, classRef]);
      const routeOrClassBlockDuration = this.reflector.getAllAndOverride<
        Resolvable<number>
      >(THROTTLER_BLOCK_DURATION + throttlerName, [handler, classRef]);
      const routeOrClassGetTracker =
        this.reflector.getAllAndOverride<ThrottlerGetTrackerFunction>(
          THROTTLER_TRACKER + throttlerName,
          [handler, classRef],
        );
      const routeOrClassGenerateKey =
        this.reflector.getAllAndOverride<ThrottlerGenerateKeyFunction>(
          THROTTLER_KEY_GENERATOR + throttlerName,
          [handler, classRef],
        );

      const limit = await this.resolveGuardValue(
        context,
        routeOrClassLimit ?? namedThrottler.limit,
      );
      const ttl = await this.resolveGuardValue(
        context,
        routeOrClassTtl ?? namedThrottler.ttl,
      );
      const blockDuration = await this.resolveGuardValue(
        context,
        routeOrClassBlockDuration ?? namedThrottler.blockDuration ?? ttl,
      );

      const getTracker: ThrottlerGetTrackerFunction =
        routeOrClassGetTracker ??
        namedThrottler.getTracker ??
        this.commonOptions.getTracker ??
        ((req) => this.getTracker(req));
      const generateKey: ThrottlerGenerateKeyFunction =
        routeOrClassGenerateKey ??
        namedThrottler.generateKey ??
        this.commonOptions.generateKey ??
        ((ctx, tracker, name) => this.generateKey(ctx, tracker, name));

      decisions.push(
        await this.handleRequest({
          context,
          limit,
          ttl,
          throttler: namedThrottler,
          blockDuration,
          getTracker,
          generateKey,
        }),
      );
    }

    return decisions.every(Boolean);
  }

  protected getTracker(req: Record<string, any>): Promise<string> {
    const request = req as TrackerRequest;
    const forwardedFor = request.headers?.['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;

    if (
      typeof forwardedValue === 'string' &&
      forwardedValue.trim().length > 0
    ) {
      return Promise.resolve(forwardedValue.split(',')[0].trim());
    }

    return Promise.resolve(
      request.ip ??
        request.ips?.[0] ??
        request.socket?.remoteAddress ??
        'anonymous',
    );
  }

  private hasNamedOverride(
    handler: ThrottlerHandler,
    classRef: Type<unknown>,
    name: string,
  ): boolean {
    return [
      THROTTLER_LIMIT,
      THROTTLER_TTL,
      THROTTLER_BLOCK_DURATION,
      THROTTLER_TRACKER,
      THROTTLER_KEY_GENERATOR,
    ].some(
      (metadataKey) =>
        this.reflector.getAllAndOverride<unknown>(`${metadataKey}${name}`, [
          handler,
          classRef,
        ]) !== undefined,
    );
  }

  private resolveGuardValue<T extends number | string | boolean>(
    context: ExecutionContext,
    resolvableValue: Resolvable<T>,
  ): Promise<T> {
    if (typeof resolvableValue === 'function') {
      return Promise.resolve(resolvableValue(context));
    }

    return Promise.resolve(resolvableValue);
  }
}
