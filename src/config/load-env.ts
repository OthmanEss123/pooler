import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const envFiles = [`.env.${nodeEnv}`, '.env'];

for (const envFile of envFiles) {
  const envPath = resolve(process.cwd(), envFile);

  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
  }
}
