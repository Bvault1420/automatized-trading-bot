import crypto from 'node:crypto';

/** scrypt + AES-256-GCM. Wird fuer EVM- und Solana-Keystores genutzt. */
export function encryptSecret(plain: string, passphrase: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    'v1',
    salt.toString('base64'),
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptSecret(keystore: string, passphrase: string): string {
  const [version, saltB64, ivB64, tagB64, dataB64] = keystore.split(':');
  if (version !== 'v1') throw new Error('Unbekanntes Keystore-Format');
  const key = crypto.scryptSync(passphrase, Buffer.from(saltB64, 'base64'), 32, { N: 16384, r: 8, p: 1 });
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
