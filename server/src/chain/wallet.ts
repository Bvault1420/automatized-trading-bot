import crypto from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from 'viem/accounts';
import { arbitrum, base, bsc, mainnet } from 'viem/chains';
import { config } from '../config.js';
import { db } from '../store/db.js';
import { createLogger } from '../util/logger.js';

const log = createLogger('wallet');

const VIEM_CHAINS = { base, ethereum: mainnet, bsc, arbitrum } as const;

/**
 * Verschluesselung des Bot-Schluessels: scrypt zur Schluesselableitung aus der
 * Passphrase, AES-256-GCM fuer Vertraulichkeit und Integritaet.
 */
function encrypt(privateKey: string, passphrase: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  return [
    'v1',
    salt.toString('base64'),
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

function decrypt(keystore: string, passphrase: string): string {
  const [version, saltB64, ivB64, tagB64, dataB64] = keystore.split(':');
  if (version !== 'v1') throw new Error('Unbekanntes Keystore-Format');
  const key = crypto.scryptSync(passphrase, Buffer.from(saltB64, 'base64'), 32, { N: 16384, r: 8, p: 1 });
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

class BotWallet {
  private account: PrivateKeyAccount | null = null;
  private publicClientCache: PublicClient | null = null;

  get chain() {
    return VIEM_CHAINS[config.chainKey] ?? base;
  }

  get rpcUrl(): string {
    return config.rpcUrl || config.chain.defaultRpc;
  }

  get address(): Address | null {
    return this.account?.address ?? (db.data.wallet.botAddress as Address | null);
  }

  get unlocked(): boolean {
    return this.account !== null;
  }

  get hasKeystore(): boolean {
    return Boolean(db.data.wallet.keystore);
  }

  publicClient(): PublicClient {
    if (!this.publicClientCache) {
      this.publicClientCache = createPublicClient({
        chain: this.chain,
        transport: http(this.rpcUrl, { timeout: 15_000, retryCount: 2 }),
      }) as PublicClient;
    }
    return this.publicClientCache;
  }

  walletClient(): WalletClient {
    if (!this.account) throw new Error('Bot-Wallet ist nicht entsperrt');
    return createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(this.rpcUrl, { timeout: 20_000, retryCount: 2 }),
    });
  }

  requireAccount(): PrivateKeyAccount {
    if (!this.account) throw new Error('Bot-Wallet ist nicht entsperrt');
    return this.account;
  }

  /** Erzeugt ein neues Bot-Wallet und legt den verschluesselten Keystore ab. */
  create(passphrase: string): Address {
    if (!passphrase || passphrase.length < 8) {
      throw new Error('Passphrase muss mindestens 8 Zeichen lang sein');
    }
    if (this.hasKeystore) throw new Error('Es existiert bereits ein Bot-Wallet');

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    db.update((draft) => {
      draft.wallet.keystore = encrypt(privateKey, passphrase);
      draft.wallet.botAddress = account.address;
    });
    this.account = account;
    log.success(`Bot-Wallet erstellt: ${account.address}`);
    return account.address;
  }

  unlock(passphrase: string): Address {
    const keystore = db.data.wallet.keystore;
    if (!keystore) throw new Error('Kein Bot-Wallet vorhanden');
    let privateKey: string;
    try {
      privateKey = decrypt(keystore, passphrase);
    } catch {
      throw new Error('Falsche Passphrase');
    }
    this.account = privateKeyToAccount(privateKey as Hex);
    log.success(`Bot-Wallet entsperrt: ${this.account.address}`);
    return this.account.address;
  }

  lock(): void {
    this.account = null;
    log.info('Bot-Wallet gesperrt');
  }

  /**
   * Exportiert den privaten Schluessel. Notwendig, damit der Nutzer sein
   * Wallet jederzeit in MetaMask importieren und die Kontrolle uebernehmen kann.
   */
  exportPrivateKey(passphrase: string): string {
    const keystore = db.data.wallet.keystore;
    if (!keystore) throw new Error('Kein Bot-Wallet vorhanden');
    try {
      return decrypt(keystore, passphrase);
    } catch {
      throw new Error('Falsche Passphrase');
    }
  }

  async nativeBalance(): Promise<number> {
    const address = this.address;
    if (!address) return 0;
    try {
      const wei = await this.publicClient().getBalance({ address });
      return Number(formatEther(wei));
    } catch (err) {
      log.debug(`Guthaben konnte nicht gelesen werden: ${(err as Error).message}`);
      return 0;
    }
  }

  /** Sendet Native-Coins zurueck an den Besitzer, abzueglich Gas-Reserve. */
  async withdrawAll(to: Address): Promise<Hex> {
    const account = this.requireAccount();
    const client = this.publicClient();
    const balance = await client.getBalance({ address: account.address });
    const gasPrice = await client.getGasPrice();
    const gasCost = gasPrice * 21_000n * 2n;
    if (balance <= gasCost) throw new Error('Guthaben reicht nicht für die Transaktionsgebühr');

    const value = balance - gasCost;
    const hash = await this.walletClient().sendTransaction({
      account,
      chain: this.chain,
      to,
      value,
    });
    log.trade(`Auszahlung ${formatEther(value)} ${config.chain.nativeSymbol} an ${to} – ${hash}`);
    return hash;
  }

  async sendNative(to: Address, amountEth: number): Promise<Hex> {
    const account = this.requireAccount();
    return this.walletClient().sendTransaction({
      account,
      chain: this.chain,
      to,
      value: parseEther(String(amountEth)),
    });
  }
}

export const botWallet = new BotWallet();

/** Beim Start automatisch entsperren, wenn eine Passphrase konfiguriert ist. */
export function autoUnlock(): void {
  if (!config.walletPassphrase || !botWallet.hasKeystore || botWallet.unlocked) return;
  try {
    botWallet.unlock(config.walletPassphrase);
  } catch (err) {
    log.warn(`Automatisches Entsperren fehlgeschlagen: ${(err as Error).message}`);
  }
}
