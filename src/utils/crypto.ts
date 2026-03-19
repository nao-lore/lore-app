/**
 * Basic API key encryption using Web Crypto API (AES-GCM).
 *
 * Purpose: prevent casual snooping of plaintext API keys in localStorage.
 * NOT military-grade — uses a device-derived key from browser fingerprint.
 *
 * Encrypted values are stored as: "enc:v1:<base64(iv + ciphertext)>"
 * Plaintext values (legacy) are detected by the absence of this prefix
 * and transparently migrated on next save.
 */

const ENCRYPTED_PREFIX = 'enc:v1:';

// ---------------------------------------------------------------------------
// Decrypted key cache — shared between provider.ts and storage/settings.ts
// to avoid circular imports. Populated by initKeyCache() at app startup.
// ---------------------------------------------------------------------------

const decryptedKeyCache = new Map<string, string>();

/** Get a cached decrypted key (returns undefined if not yet cached) */
export function getCachedKey(slot: string): string | undefined {
  return decryptedKeyCache.get(slot);
}

/** Set a cached decrypted key */
export function setCachedKey(slot: string, value: string): void {
  decryptedKeyCache.set(slot, value);
}

/** Check if a stored value is already encrypted */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Read an API key for a given storage slot.
 * Checks the decrypted cache first, then falls back to raw localStorage.
 * Encrypted keys that haven't been cached yet return '' (initKeyCache populates them).
 *
 * This is the single source of truth for API key retrieval — used by both
 * getApiKey (storage/settings.ts) and getProviderApiKey (provider.ts).
 */
export function readKeyForSlot(slot: string, rawValue: string): string {
  const cached = decryptedKeyCache.get(slot);
  if (cached !== undefined) return cached;
  if (!rawValue) return '';
  if (rawValue.startsWith(ENCRYPTED_PREFIX)) return '';
  return rawValue;
}

/** Derive a stable device fingerprint (not cryptographically strong, but prevents casual reads) */
function getDeviceFingerprint(): string {
  const parts: string[] = [];
  if (typeof navigator !== 'undefined') {
    parts.push(navigator.userAgent || '');
    parts.push(navigator.language || '');
  }
  if (typeof screen !== 'undefined') {
    parts.push(`${screen.width}x${screen.height}`);
    parts.push(`${screen.colorDepth}`);
  }
  try {
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
  } catch {
    // timeZone unavailable
  }
  // Include a fixed app-specific salt
  parts.push('lore-app-key-encryption-v1');
  return parts.join('|');
}

/** Derive an AES-GCM key from the device fingerprint */
async function deriveKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const material = encoder.encode(getDeviceFingerprint());

  // Use SHA-256 hash as raw key material for AES-GCM
  const hash = await crypto.subtle.digest('SHA-256', material);

  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a plaintext string.
 * Returns a prefixed base64 string: "enc:v1:<base64(iv + ciphertext)>"
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;

  try {
    const key = await deriveKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext),
    );

    // Combine IV + ciphertext into a single buffer
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Encode as base64
    const base64 = btoa(String.fromCharCode(...combined));
    return `${ENCRYPTED_PREFIX}${base64}`;
  } catch {
    // If encryption fails (e.g., crypto.subtle unavailable), return plaintext
    return plaintext;
  }
}

/**
 * Decrypt an encrypted string.
 * If the value is not encrypted (no prefix), returns it as-is (backward compatible).
 */
export async function decrypt(stored: string): Promise<string> {
  if (!stored || !isEncrypted(stored)) {
    return stored;
  }

  try {
    const key = await deriveKey();
    const base64 = stored.slice(ENCRYPTED_PREFIX.length);
    const raw = atob(base64);
    const combined = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      combined[i] = raw.charCodeAt(i);
    }

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    // Decryption failed — key material changed (different device/browser),
    // or data corrupted. Return empty to force re-entry.
    return '';
  }
}
