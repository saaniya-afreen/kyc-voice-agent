// AES-GCM encryption for the one genuinely sensitive field this system stores
// at rest: the SSN captured on a FATCA/US-indicia case (UC-2.2). The key lives
// only as an edge function secret (SSN_ENCRYPTION_KEY, 32 bytes, base64) —
// never in the database — so a DB dump alone can't recover a plaintext SSN.

async function getKey(): Promise<CryptoKey> {
  const b64 = Deno.env.get("SSN_ENCRYPTION_KEY");
  if (!b64) throw new Error("SSN_ENCRYPTION_KEY is not set");
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
}

// Returns iv (12 bytes) prefixed to the ciphertext, ready to store in a bytea column.
export async function encryptSsn(plain: string): Promise<Uint8Array> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain))
  );
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return out;
}
