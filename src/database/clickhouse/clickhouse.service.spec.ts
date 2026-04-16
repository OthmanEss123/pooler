import { ConfigService } from '@nestjs/config';
import { createClient } from '@clickhouse/client';
import { ClickhouseService } from './clickhouse.service';

jest.mock('@clickhouse/client', () => ({
  createClient: jest.fn(),
}));

type ConfigValues = Record<string, unknown>;

type ClickhouseClientMock = {
  close: jest.Mock;
  command: jest.Mock;
  insert: jest.Mock;
  ping: jest.Mock;
  query: jest.Mock;
};

const createClientMock = createClient as jest.MockedFunction<typeof createClient>;

function makeConfigService(values: ConfigValues): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: unknown) =>
      key in values ? values[key] : defaultValue,
    ),
    getOrThrow: jest.fn((key: string) => {
      if (!(key in values)) {
        throw new Error(`Missing config value for ${key}`);
      }

      return values[key];
    }),
  } as unknown as ConfigService;
}

function makeClient(): ClickhouseClientMock {
  return {
    close: jest.fn().mockResolvedValue(undefined),
    command: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue(true),
    query: jest.fn(),
  };
}

describe('ClickhouseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips initialization when CLICKHOUSE_URL is missing', async () => {
    const service = new ClickhouseService(makeConfigService({}));

    await service.onModuleInit();

    expect(createClientMock).not.toHaveBeenCalled();
    await expect(service.command('SELECT 1')).rejects.toThrow(
      'Set CLICKHOUSE_URL to enable analytics features.',
    );
    await expect(service.isHealthy()).resolves.toBe(false);
  });

  it('uses credentials from CLICKHOUSE_URL without reapplying env overrides', async () => {
    const client = makeClient();
    createClientMock.mockReturnValue(client as never);

    const service = new ClickhouseService(
      makeConfigService({
        CLICKHOUSE_URL: 'http://default:secret@clickhouse.internal:8123/pilot',
        CLICKHOUSE_USER: 'default',
        CLICKHOUSE_PASSWORD: 'secret',
        CLICKHOUSE_DB: 'pilot',
        CLICKHOUSE_REQUEST_TIMEOUT_MS: 4000,
      }),
    );

    await service.onModuleInit();

    expect(createClientMock).toHaveBeenCalledWith({
      url: new URL('http://default:secret@clickhouse.internal:8123/pilot'),
      request_timeout: 4000,
    });
    expect(client.command).toHaveBeenCalledTimes(2);
  });

  it('applies env credentials when the URL does not include them', async () => {
    const client = makeClient();
    createClientMock.mockReturnValue(client as never);

    const service = new ClickhouseService(
      makeConfigService({
        CLICKHOUSE_URL: 'http://clickhouse.internal:8123',
        CLICKHOUSE_USER: 'analytics',
        CLICKHOUSE_PASSWORD: 'secret',
        CLICKHOUSE_DB: 'pilot',
        CLICKHOUSE_REQUEST_TIMEOUT_MS: 2500,
      }),
    );

    await service.onModuleInit();

    expect(createClientMock).toHaveBeenCalledWith({
      url: new URL('http://clickhouse.internal:8123'),
      username: 'analytics',
      password: 'secret',
      database: 'pilot',
      request_timeout: 2500,
    });
    expect(client.command).toHaveBeenCalledTimes(2);
  });
});
