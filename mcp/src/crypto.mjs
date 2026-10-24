import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";

const AAD = "kanakku-drive-backup-v1";
const ITERATIONS = 600_000;
const MAX_PLAINTEXT = 24 * 1024 * 1024;
const MAX_ENVELOPE = 36 * 1024 * 1024;

function deriveKey(password, salt) {
  return pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
}

export function decryptBackup(envelopeText, password) {
  if (typeof password !== "string" || password.length < 12)
    throw new Error("Backup password must contain at least 12 characters.");
  if (
    typeof envelopeText !== "string" ||
    Buffer.byteLength(envelopeText) > MAX_ENVELOPE
  )
    throw new Error("Backup envelope is too large or invalid.");
  let envelope;
  try {
    envelope = JSON.parse(envelopeText);
  } catch {
    throw new Error("This file is not a Kanakku encrypted backup.");
  }
  if (
    envelope?.format !== "kanakku-drive-backup" ||
    envelope?.version !== 1 ||
    envelope?.kdf !== "PBKDF2-HMAC-SHA256" ||
    envelope?.iterations !== ITERATIONS
  )
    throw new Error("This Kanakku backup format is not supported.");
  const salt = Buffer.from(envelope.salt ?? "", "base64");
  const iv = Buffer.from(envelope.iv ?? "", "base64");
  const ciphertext = Buffer.from(envelope.ciphertext ?? "", "base64");
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16)
    throw new Error("This backup envelope is damaged.");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(password, salt),
      iv,
    );
    decipher.setAAD(Buffer.from(AAD, "utf8"));
    decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
    const plaintext = Buffer.concat([
      decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
      decipher.final(),
    ]);
    if (plaintext.length > MAX_PLAINTEXT)
      throw new Error("This backup is too large.");
    return plaintext.toString("utf8");
  } catch {
    throw new Error(
      "Could not unlock this backup. Check the password or file.",
    );
  }
}

export function encryptBackup(plaintext, password) {
  if (typeof password !== "string" || password.length < 12)
    throw new Error("Backup password must contain at least 12 characters.");
  const bytes = Buffer.from(plaintext, "utf8");
  if (bytes.length > MAX_PLAINTEXT)
    throw new Error("This backup is too large to encrypt.");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(password, salt), iv);
  cipher.setAAD(Buffer.from(AAD, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(bytes),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return JSON.stringify({
    format: "kanakku-drive-backup",
    version: 1,
    kdf: "PBKDF2-HMAC-SHA256",
    iterations: ITERATIONS,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}
