import { config } from '../config.js';
import { botWallet, autoUnlock as autoUnlockEvm } from './wallet.js';
import { solanaWallet, autoUnlockSolana } from './solanaWallet.js';
import { isSolanaChain } from './solana.js';

/**
 * Einheitliche Fassade ueber das Handelswallet der konfigurierten Chain.
 * EVM- und Solana-Keystores bleiben getrennt – ein Base-Wallet ist kein Solana-Wallet.
 */
export const hotWallet = {
  get family(): 'solana' | 'evm' {
    return config.chain.family;
  },
  get address(): string | null {
    return isSolanaChain() ? solanaWallet.address : botWallet.address;
  },
  get unlocked(): boolean {
    return isSolanaChain() ? solanaWallet.unlocked : botWallet.unlocked;
  },
  get hasKeystore(): boolean {
    return isSolanaChain() ? solanaWallet.hasKeystore : botWallet.hasKeystore;
  },
  create(passphrase: string): string {
    return isSolanaChain() ? solanaWallet.create(passphrase) : botWallet.create(passphrase);
  },
  unlock(passphrase: string): string {
    return isSolanaChain() ? solanaWallet.unlock(passphrase) : botWallet.unlock(passphrase);
  },
  lock(): void {
    if (isSolanaChain()) solanaWallet.lock();
    else botWallet.lock();
  },
  exportSecret(passphrase: string): string {
    return isSolanaChain() ? solanaWallet.exportSecret(passphrase) : botWallet.exportPrivateKey(passphrase);
  },
  verifyPassphrase(passphrase: string): void {
    if (isSolanaChain()) solanaWallet.verifyPassphrase(passphrase);
    else botWallet.verifyPassphrase(passphrase);
  },
  changePassphrase(current: string, next: string): void {
    if (isSolanaChain()) solanaWallet.changePassphrase(current, next);
    else botWallet.changePassphrase(current, next);
  },
  reset(): void {
    if (isSolanaChain()) solanaWallet.reset();
    else botWallet.reset();
  },
  nativeBalance(): Promise<number> {
    return isSolanaChain() ? solanaWallet.nativeBalance() : botWallet.nativeBalance();
  },
  withdrawAll(to: string): Promise<string> {
    return isSolanaChain() ? solanaWallet.withdrawAll(to) : botWallet.withdrawAll(to as `0x${string}`);
  },
};

export function autoUnlock(): void {
  if (isSolanaChain()) autoUnlockSolana();
  else autoUnlockEvm();
}

export { isSolanaChain };
