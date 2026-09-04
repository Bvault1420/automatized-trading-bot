import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { config } from '../config.js';
import { db } from '../store/db.js';
import { createLogger } from '../util/logger.js';
import { decryptSecret, encryptSecret } from '../util/secret.js';
import {
  encodeBase58,
  isSolanaAddress,
  solanaConnection,
  splBalances,
  associatedTokenAddress,
  createAtaIdempotentIx,
  splTransferIx,
} from './solana.js';

const log = createLogger('solana-wallet');

class SolanaWallet {
  private keypair: Keypair | null = null;

  get address(): string | null {
    return this.keypair?.publicKey.toBase58() ?? db.data.wallet.solanaAddress;
  }

  get unlocked(): boolean {
    return this.keypair !== null;
  }

  get hasKeystore(): boolean {
    return Boolean(db.data.wallet.solanaKeystore);
  }

  requireKeypair(): Keypair {
    if (!this.keypair) throw new Error('Bot-Wallet ist nicht entsperrt');
    return this.keypair;
  }

  create(passphrase: string): string {
    if (!passphrase || passphrase.length < 8) {
      throw new Error('Passphrase muss mindestens 8 Zeichen lang sein');
    }
    if (this.hasKeystore) throw new Error('Es existiert bereits ein Solana-Bot-Wallet');

    const keypair = Keypair.generate();
    const secret = Buffer.from(keypair.secretKey).toString('base64');
    db.update((draft) => {
      draft.wallet.solanaKeystore = encryptSecret(secret, passphrase);
      draft.wallet.solanaAddress = keypair.publicKey.toBase58();
    });
    this.keypair = keypair;
    log.success(`Solana-Bot-Wallet erstellt: ${keypair.publicKey.toBase58()}`);
    return keypair.publicKey.toBase58();
  }

  unlock(passphrase: string): string {
    const keystore = db.data.wallet.solanaKeystore;
    if (!keystore) throw new Error('Kein Solana-Bot-Wallet vorhanden');
    let secret: string;
    try {
      secret = decryptSecret(keystore, passphrase);
    } catch {
      throw new Error('Falsche Passphrase');
    }
    this.keypair = Keypair.fromSecretKey(Buffer.from(secret, 'base64'));
    log.success(`Solana-Bot-Wallet entsperrt: ${this.keypair.publicKey.toBase58()}`);
    return this.keypair.publicKey.toBase58();
  }

  lock(): void {
    this.keypair = null;
    log.info('Solana-Bot-Wallet gesperrt');
  }

  /** Base58-Secret, importierbar in Phantom. */
  exportSecret(passphrase: string): string {
    const keystore = db.data.wallet.solanaKeystore;
    if (!keystore) throw new Error('Kein Solana-Bot-Wallet vorhanden');
    try {
      const secret = decryptSecret(keystore, passphrase);
      return encodeBase58(Buffer.from(secret, 'base64'));
    } catch {
      throw new Error('Falsche Passphrase');
    }
  }

  async nativeBalance(): Promise<number> {
    const address = this.address;
    if (!address) return 0;
    try {
      const lamports = await solanaConnection().getBalance(new PublicKey(address), 'confirmed');
      return lamports / LAMPORTS_PER_SOL;
    } catch (err) {
      log.debug(`SOL-Guthaben konnte nicht gelesen werden: ${(err as Error).message}`);
      return 0;
    }
  }

  async withdrawAll(to: string): Promise<string> {
    if (!isSolanaAddress(to)) throw new Error('Keine gültige Solana-Adresse');
    const keypair = this.requireKeypair();
    const conn = solanaConnection();
    const dest = new PublicKey(to);

    const tokens = await splBalances(keypair.publicKey);
    for (const token of tokens) {
      try {
        const destAta = associatedTokenAddress(dest, new PublicKey(token.mint), token.programId);
        const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
        const tx = new Transaction({ feePayer: keypair.publicKey, recentBlockhash: blockhash });
        tx.add(createAtaIdempotentIx(keypair.publicKey, dest, new PublicKey(token.mint), token.programId));
        tx.add(splTransferIx(token.tokenAccount, destAta, keypair.publicKey, token.amount, token.programId));
        tx.sign(keypair);
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
        log.trade(`Token-Auszahlung ${token.mint.slice(0, 6)}… an ${to} – ${sig}`);
      } catch (err) {
        log.warn(`Token ${token.mint} konnte nicht ausgezahlt werden: ${(err as Error).message}`);
      }
    }

    const balance = await conn.getBalance(keypair.publicKey, 'confirmed');
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    const probe = new Transaction({ feePayer: keypair.publicKey, recentBlockhash: blockhash }).add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: dest,
        lamports: Math.max(0, balance - 5000),
      }),
    );
    probe.sign(keypair);
    const fee = (await conn.getFeeForMessage(probe.compileMessage(), 'confirmed')).value ?? 5000;
    const lamports = balance - fee;
    if (lamports <= 0) throw new Error('Guthaben reicht nicht für die Transaktionsgebühr');

    const tx = new Transaction({ feePayer: keypair.publicKey, recentBlockhash: blockhash }).add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: dest,
        lamports,
      }),
    );
    tx.sign(keypair);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    if (conf.value.err) throw new Error(`Auszahlung fehlgeschlagen (${sig})`);
    log.trade(`Auszahlung ${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL an ${to} – ${sig}`);
    return sig;
  }
}

export const solanaWallet = new SolanaWallet();

export function autoUnlockSolana(): void {
  if (!config.walletPassphrase || !solanaWallet.hasKeystore || solanaWallet.unlocked) return;
  try {
    solanaWallet.unlock(config.walletPassphrase);
  } catch (err) {
    log.warn(`Automatisches Entsperren fehlgeschlagen: ${(err as Error).message}`);
  }
}
