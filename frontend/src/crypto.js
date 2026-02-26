// E2E encryption — все данные шифруются на клиенте, сервер видит только blob

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 250000;

// Derive AES key from password/pin + salt
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, { name: ALGO, length: KEY_LENGTH }, false, ['encrypt', 'decrypt']
  );
}

// Encrypt string → base64 blob
async function encrypt(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: ALGO, iv }, key, enc.encode(plaintext));
  const buf = new Uint8Array(iv.length + ct.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...buf));
}

// Decrypt base64 blob → string
async function decrypt(key, ciphertext) {
  try {
    const raw = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const ct = raw.slice(12);
    const pt = await crypto.subtle.decrypt({ name: ALGO, iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

// Generate key from TON wallet signature
async function deriveKeyFromTon(address, signature) {
  return deriveKey(signature, `ton:${address}`);
}

// Generate key from PIN
async function deriveKeyFromPin(pin, telegramId) {
  return deriveKey(pin, `tg:${telegramId}`);
}

// Encrypt object
async function encryptObj(key, obj) {
  return encrypt(key, JSON.stringify(obj));
}

// Decrypt to object
async function decryptObj(key, blob) {
  const str = await decrypt(key, blob);
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

// Store derived key in sessionStorage (lives only while tab open)
function storeKey(key) {
  crypto.subtle.exportKey('jwk', key).then(jwk => {
    sessionStorage.setItem('e2e_key', JSON.stringify(jwk));
  }).catch(() => {});
}

async function loadKey() {
  try {
    const jwk = JSON.parse(sessionStorage.getItem('e2e_key'));
    if (!jwk) return null;
    return crypto.subtle.importKey('jwk', jwk, { name: ALGO, length: KEY_LENGTH }, false, ['encrypt', 'decrypt']);
  } catch { return null; }
}

function clearKey() {
  sessionStorage.removeItem('e2e_key');
}

function hasKey() {
  return !!sessionStorage.getItem('e2e_key');
}

export const e2e = { deriveKeyFromPin, deriveKeyFromTon, encrypt, decrypt, encryptObj, decryptObj, storeKey, loadKey, clearKey, hasKey };
