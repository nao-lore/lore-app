/**
 * crypto.test.ts — Unit tests for the crypto utility module
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { encrypt, decrypt, isEncrypted, getCachedKey, setCachedKey, isEncrypting } from '../utils/crypto';

describe('isEncrypted', () => {
  it('returns false for empty string', () => {
    expect(isEncrypted('')).toBe(false);
  });

  it('returns false for plaintext API key', () => {
    expect(isEncrypted('sk-ant-abc123')).toBe(false);
    expect(isEncrypted('AIzaSyAbc123')).toBe(false);
  });

  it('returns true for v1 encrypted prefix', () => {
    expect(isEncrypted('enc:v1:AAAA')).toBe(true);
  });

  it('returns true for v2 encrypted prefix', () => {
    expect(isEncrypted('enc:v2:AAAA')).toBe(true);
  });
});

describe('encrypt / decrypt round-trip', () => {
  it('encrypts and decrypts a string', async () => {
    const original = 'sk-ant-test-key-12345';
    const encrypted = await encrypt(original);

    expect(encrypted).not.toBe(original);
    expect(isEncrypted(encrypted)).toBe(true);

    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('returns empty string for empty input', async () => {
    const result = await encrypt('');
    expect(result).toBe('');
  });

  it('decrypt returns plaintext for non-encrypted values', async () => {
    const plaintext = 'sk-ant-abc123';
    const result = await decrypt(plaintext);
    expect(result).toBe(plaintext);
  });

  it('decrypt returns empty string for empty input', async () => {
    const result = await decrypt('');
    expect(result).toBe('');
  });

  it('each encryption produces different ciphertext (random IV)', async () => {
    const original = 'test-api-key';
    const enc1 = await encrypt(original);
    const enc2 = await encrypt(original);
    expect(enc1).not.toBe(enc2);

    // Both decrypt to the same value
    expect(await decrypt(enc1)).toBe(original);
    expect(await decrypt(enc2)).toBe(original);
  });

  it('handles Unicode characters', async () => {
    const original = 'key-with-unicode-\u00e9\u00e8\u00ea';
    const encrypted = await encrypt(original);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('handles long keys', async () => {
    const original = 'sk-ant-' + 'a'.repeat(500);
    const encrypted = await encrypt(original);
    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(original);
  });
});

describe('decrypt with invalid data', () => {
  it('returns empty for corrupted encrypted data', async () => {
    const result = await decrypt('enc:v1:not-valid-base64!!!');
    expect(result).toBe('');
  });

  it('returns empty for truncated encrypted data', async () => {
    const result = await decrypt('enc:v1:AAAA');
    expect(result).toBe('');
  });
});

describe('decrypted key cache', () => {
  beforeEach(() => {
    // Clear cache entries used in tests
    setCachedKey('test-provider', '');
  });

  it('returns undefined for uncached key', () => {
    expect(getCachedKey('nonexistent-provider')).toBeUndefined();
  });

  it('caches and retrieves a key', () => {
    setCachedKey('test-provider', 'my-secret-key');
    expect(getCachedKey('test-provider')).toBe('my-secret-key');
  });

  it('overwrites cached key', () => {
    setCachedKey('test-provider', 'old-key');
    setCachedKey('test-provider', 'new-key');
    expect(getCachedKey('test-provider')).toBe('new-key');
  });
});

describe('encrypt graceful fallback', () => {
  it('returns plaintext when crypto.subtle is unavailable', async () => {
    const original = crypto.subtle;
    // Temporarily remove crypto.subtle
    Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true });
    try {
      const result = await encrypt('test-key');
      expect(result).toBe('test-key');
    } finally {
      Object.defineProperty(crypto, 'subtle', { value: original, configurable: true });
    }
  });
});

describe('v2 PBKDF2 encryption', () => {
  it('encrypts with v2 prefix', async () => {
    const encrypted = await encrypt('test-key-v2');
    expect(encrypted.startsWith('enc:v2:')).toBe(true);
  });

  it('isEncrypting flag is false when not encrypting', () => {
    expect(isEncrypting()).toBe(false);
  });
});
