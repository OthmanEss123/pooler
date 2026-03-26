import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * AES-256-CBC encryption service for storing external credentials
 * (Shopify tokens, Google OAuth tokens, SES keys, etc.)
 *
 * Format: <iv_hex>:<encrypted_hex>
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const rawKey = this.config.get<string>('ENCRYPTION_KEY');

    if (!rawKey || rawKey.length !== 64) {
      this.logger.warn(
        'ENCRYPTION_KEY not set or invalid (must be 64 hex chars). Encryption disabled.',
      );
      this.key = Buffer.alloc(32);
    } else {
      this.key = scryptSync(rawKey, 'pilot-salt', 32);
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, encryptedHex] = ciphertext.split(':');

    if (!ivHex || !encryptedHex) {
      throw new Error('Invalid ciphertext format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Encrypt a JSON object (e.g., Shopify credentials, OAuth tokens).
   */
  encryptJson(data: Record<string, unknown>): string {
    return this.encrypt(JSON.stringify(data));
  }

  /**
   * Decrypt a JSON object.
   */
  decryptJson<T = Record<string, unknown>>(ciphertext: string): T {
    return JSON.parse(this.decrypt(ciphertext)) as T;
  }
}
