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
import { encryptSecret, decryptSecret } from '../util/secret.js';

const log = createLogger('wallet');

const VIEM_CHAINS = { base, ethereum: mainnet, bsc, arbitrum } as const;

class BotWallet {
  private account: PrivateKeyAccount | null = null;
  private publicClientCache: PublicClient | null = null;

  get chain() {
    if (config.chain.family !== 'evm') return base;
    const key = config.chainKey as keyof typeof VIEM_CHAINS;
    return VIEM_CHAINS[key] ?? base;
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
      draft.wallet.keystore = encryptSecret(privateKey, passphrase);
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
      privateKey = decryptSecret(keystore, passphrase);
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
      return decryptSecret(keystore, passphrase);
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
