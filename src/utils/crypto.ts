/**
 * Basic API key encryption using Web Crypto API (AES-GCM).
 *
 * Purpose: prevent casual snooping of plaintext API keys in localStorage.
 * NOT military-grade — uses a device-derived key from browser fingerprint.
 *
 * Encrypted values are stored as: "enc:v1:<base64(iv + ciphertext)>"
 * Plaintext values (legacy) are detected by the absence of this prefix
 * and transparently migrated on next save.
 *
 * ─── Security Limitations (by design) ───────────────────────────────────
 *
 * 1. Device fingerprint is low-entropy (~2^20 combinations).
 *    It is derived from userAgent, language, screen resolution, color depth,
 *    and timezone — all of which are easily enumerable.
 *
 * 2. SHA-256 without PBKDF2 is fast to brute-force.
 *    The key derivation uses a single SHA-256 pass rather than a slow KDF
 *    like PBKDF2 or Argon2. An attacker with the ciphertext can try all
 *    ~2^20 fingerprint combinations in under a second.
 *
 * 3. Plaintext fallback exists for older browsers.
 *    When crypto.subtle is unavailable (e.g., non-secure contexts), encrypt()
 *    returns the plaintext as-is. This ensures the app remains functional
 *    but provides zero encryption in those environments.
 *
 * 4. This is intentional: the goal is to protect against casual snooping
 *    (e.g., someone glancing at DevTools > Application > Local Storage),
 *    NOT against determined attackers with filesystem or extension access.
 *
 * 5. Future improvement: migrate to PBKDF2 with a user-provided passphrase,
 *    or WebAuthn-derived keys, for stronger protection. This would require
 *    a UX flow for key setup and recovery.
 *
 * ────────────────────────────────────────────────────────────────────────
 */

import { safeGetItem, safeSetItem } from '../storage/core';

const ENCRYPTED_PREFIX_V1 = 'enc:v1:';
const ENCRYPTED_PREFIX_V2 = 'enc:v2:';

/** Flag to prevent double-writes during async encryption */
let _encrypting = false;

/** Check if an encryption operation is currently in progress */
export function isEncrypting(): boolean {
  return _encrypting;
}

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

/** Check if a stored value is already encrypted (v1 or v2) */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX_V1) || value.startsWith(ENCRYPTED_PREFIX_V2);
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
  if (rawValue.startsWith(ENCRYPTED_PREFIX_V1) || rawValue.startsWith(ENCRYPTED_PREFIX_V2)) return '';
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

// ---------------------------------------------------------------------------
// PBKDF2 salt management — generate once, reuse across encryptions
// ---------------------------------------------------------------------------

const PBKDF2_SALT_KEY = 'lore_pbkdf2_salt';
const PBKDF2_ITERATIONS = 600_000;

/** In-memory cache of the PBKDF2 salt for environments where localStorage is unreliable */
let _cachedSalt: Uint8Array | null = null;

function getPbkdf2Salt(): Uint8Array {
  // Return in-memory cached salt if available
  if (_cachedSalt) return _cachedSalt;

  const stored = safeGetItem(PBKDF2_SALT_KEY);
  if (stored) {
    try {
      const raw = atob(stored);
      const salt = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) {
        salt[i] = raw.charCodeAt(i);
      }
      _cachedSalt = salt;
      return salt;
    } catch {
      // Corrupted base64 — fall through to generate new salt
    }
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  _cachedSalt = salt;
  safeSetItem(PBKDF2_SALT_KEY, btoa(String.fromCharCode(...salt)));
  return salt;
}

/** Derive an AES-GCM key from the device fingerprint using PBKDF2 (v2) */
async function deriveKeyV2(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const material = encoder.encode(getDeviceFingerprint());

  const baseKey = await crypto.subtle.importKey(
    'raw',
    material,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  const salt = getPbkdf2Salt();

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Derive an AES-GCM key from the device fingerprint using SHA-256 (v1 — legacy) */
async function deriveKeyV1(): Promise<CryptoKey> {
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
 * Returns a prefixed base64 string: "enc:v2:<base64(iv + ciphertext)>"
 *
 * Uses PBKDF2 key derivation (v2). The _encrypting flag prevents
 * concurrent writes from causing race conditions.
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;

  try {
    _encrypting = true;
    const key = await deriveKeyV2();
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
    return `${ENCRYPTED_PREFIX_V2}${base64}`;
  } catch {
    // If encryption fails (e.g., crypto.subtle unavailable), return plaintext
    return plaintext;
  } finally {
    _encrypting = false;
  }
}

/**
 * Decrypt a raw base64 payload with a given CryptoKey.
 */
async function decryptWithKey(base64: string, key: CryptoKey): Promise<string> {
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
}

/**
 * Decrypt an encrypted string.
 * If the value is not encrypted (no prefix), returns it as-is (backward compatible).
 * v1 data is decrypted with the legacy SHA-256 key. v2 uses PBKDF2.
 */
export async function decrypt(stored: string): Promise<string> {
  if (!stored || !isEncrypted(stored)) {
    return stored;
  }

  try {
    if (stored.startsWith(ENCRYPTED_PREFIX_V2)) {
      const base64 = stored.slice(ENCRYPTED_PREFIX_V2.length);
      const key = await deriveKeyV2();
      return await decryptWithKey(base64, key);
    }

    // v1 path — decrypt with legacy key
    const base64 = stored.slice(ENCRYPTED_PREFIX_V1.length);
    const key = await deriveKeyV1();
    return await decryptWithKey(base64, key);
  } catch {
    // Decryption failed — key material changed (different device/browser),
    // or data corrupted. Return empty to force re-entry.
    return '';
  }
}
