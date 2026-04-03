import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const TEST_ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/**
 * AES-256-CBC encryption service for storing external credentials
 * (Shopify tokens, Google OAuth tokens, SES keys, etc.)
 *
 * Format: <iv_hex>:<encrypted_hex>
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const rawKey =
      this.config.get<string>('ENCRYPTION_KEY') ??
      (process.env.NODE_ENV === 'test' ? TEST_ENCRYPTION_KEY : undefined);

    if (!rawKey) {
      throw new Error('ENCRYPTION_KEY manquante');
    }

    if (rawKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(rawKey)) {
      throw new Error(
        `ENCRYPTION_KEY invalide: doit faire 64 caracteres hex, recu ${rawKey.length}`,
      );
    }

    this.key = Buffer.from(rawKey, 'hex');
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
