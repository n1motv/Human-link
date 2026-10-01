import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import { randomToken, sha256 } from './crypto.js';
import { clientConfig } from '../config/client.js';

export const newTotpSecret = () => generateSecret();

export async function totpQrDataUrl(label: string, secret: string): Promise<string> {
  const uri = generateURI({ issuer: clientConfig.company.name, label, secret });
  return QRCode.toDataURL(uri, { margin: 1, width: 220 });
}

/** Tolérance d'une période (30 s) avant/après pour absorber la dérive d'horloge. */
export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const res = await verify({ secret, token: code, epochTolerance: 30 });
    return res.valid;
  } catch {
    return false;
  }
}

/** 8 codes de secours à usage unique ; seuls leurs hachés sont stockés. */
export function newRecoveryCodes(): { plain: string[]; hashed: string[] } {
  const plain = Array.from({ length: 8 }, () => {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 hex
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { plain, hashed: plain.map((c) => sha256(c)) };
}

export const hashRecovery = (code: string) => sha256(code.trim().toLowerCase());

export { randomToken };
