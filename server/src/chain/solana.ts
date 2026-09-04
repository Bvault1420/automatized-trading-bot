import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { config } from '../config.js';

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

/** Reserve in SOL, damit ein Jupiter-Exit noch durchgeht. Kein Portfolioverlust. */
export const GAS_RESERVE_SOL = 0.004;

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const size = Math.floor(((bytes.length - zeros) * 138) / 100) + 1;
  const buf = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; (carry !== 0 || j < length) && k >= 0; k--, j++) {
      carry += 256 * buf[k];
      buf[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }
  let it = size - length;
  while (it < size && buf[it] === 0) it++;
  let str = '1'.repeat(zeros);
  for (; it < size; it++) str += B58[buf[it]];
  return str;
}

export function isSolanaAddress(value: string): boolean {
  if (!value || value.length < 32 || value.length > 44 || value.startsWith('0x')) return false;
  try {
    return new PublicKey(value).toBase58() === value;
  } catch {
    return false;
  }
}

export function isSolanaChain(): boolean {
  return config.chain.family === 'solana';
}

let connectionCache: Connection | null = null;
let connectionRpc = '';

export function solanaRpcUrl(): string {
  return config.rpcUrl || config.chain.defaultRpc;
}

export function solanaConnection(): Connection {
  const url = solanaRpcUrl();
  if (!connectionCache || connectionRpc !== url) {
    connectionRpc = url;
    connectionCache = new Connection(url, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 90_000,
    });
  }
  return connectionCache;
}

export function associatedTokenAddress(owner: PublicKey, mint: PublicKey, programId = TOKEN_PROGRAM_ID): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function u64le(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value);
  return buf;
}

export function createAtaIdempotentIx(payer: PublicKey, owner: PublicKey, mint: PublicKey, programId = TOKEN_PROGRAM_ID): TransactionInstruction {
  const ata = associatedTokenAddress(owner, mint, programId);
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

export function splTransferIx(
  source: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
  programId = TOKEN_PROGRAM_ID,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([Buffer.from([3]), u64le(amount)]),
  });
}

export interface SplBalance {
  mint: string;
  amount: bigint;
  uiAmount: number;
  decimals: number;
  programId: PublicKey;
  tokenAccount: PublicKey;
}

export async function mintDecimals(mint: string): Promise<number> {
  const info = await solanaConnection().getParsedAccountInfo(new PublicKey(mint));
  const parsed = info.value?.data;
  if (parsed && typeof parsed === 'object' && 'parsed' in parsed) {
    const decimals = Number((parsed.parsed as { info?: { decimals?: number } })?.info?.decimals);
    if (Number.isFinite(decimals)) return decimals;
  }
  return 9;
}

export async function splBalances(owner: PublicKey, mints?: string[]): Promise<SplBalance[]> {
  try {
    const conn = solanaConnection();
    const [legacy, token2022] = await Promise.all([
      conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);

    const wanted = mints ? new Set(mints) : null;
    const out: SplBalance[] = [];
    const rows = [
      ...legacy.value.map((row) => ({ row, programId: TOKEN_PROGRAM_ID })),
      ...token2022.value.map((row) => ({ row, programId: TOKEN_2022_PROGRAM_ID })),
    ];

    for (const { row, programId } of rows) {
      const info = row.account.data.parsed?.info as
        | { mint?: string; tokenAmount?: { amount?: string; uiAmount?: number; decimals?: number } }
        | undefined;
      const mint = info?.mint;
      if (!mint || (wanted && !wanted.has(mint))) continue;
      const amount = BigInt(info.tokenAmount?.amount ?? '0');
      if (amount <= 0n) continue;
      out.push({
        mint,
        amount,
        uiAmount: Number(info.tokenAmount?.uiAmount ?? 0),
        decimals: Number(info.tokenAmount?.decimals ?? 0),
        programId,
        tokenAccount: row.pubkey,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function tokenAmountForMint(owner: PublicKey, mint: string): Promise<SplBalance | null> {
  const matches = await splBalances(owner, [mint]);
  if (matches.length === 0) return null;
  return matches.reduce((best, row) => (row.amount > best.amount ? row : best));
}

export async function buildSolTransfer(from: PublicKey, to: PublicKey, lamports: bigint): Promise<Transaction> {
  const latest = await solanaConnection().getLatestBlockhash('confirmed');
  const tx = new Transaction({
    feePayer: from,
    recentBlockhash: latest.blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: Number(lamports),
    }),
  );
  return tx;
}

export async function buildSplTransfer(params: {
  from: PublicKey;
  to: PublicKey;
  mint: PublicKey;
  amount: bigint;
  programId?: PublicKey;
}): Promise<Transaction> {
  const programId = params.programId ?? TOKEN_PROGRAM_ID;
  const source = associatedTokenAddress(params.from, params.mint, programId);
  const dest = associatedTokenAddress(params.to, params.mint, programId);
  const latest = await solanaConnection().getLatestBlockhash('confirmed');
  const tx = new Transaction({
    feePayer: params.from,
    recentBlockhash: latest.blockhash,
  });
  tx.add(createAtaIdempotentIx(params.from, params.to, params.mint, programId));
  tx.add(splTransferIx(source, dest, params.from, params.amount, programId));
  return tx;
}

export { LAMPORTS_PER_SOL };

/** Schliesst leere Token-Konten und holt die ~0.002 SOL Miete zurück. */
export async function closeEmptyTokenAccounts(
  owner: PublicKey,
  signer: { publicKey: PublicKey; secretKey: Uint8Array },
): Promise<{ closed: number; signature?: string }> {
  try {
    const conn = solanaConnection();
    const [legacy, token2022] = await Promise.all([
      conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
    const empty = [
      ...legacy.value.map((row) => ({ row, programId: TOKEN_PROGRAM_ID })),
      ...token2022.value.map((row) => ({ row, programId: TOKEN_2022_PROGRAM_ID })),
    ].filter(({ row }) => {
      const amount = String(
        (row.account.data.parsed?.info as { tokenAmount?: { amount?: string } } | undefined)?.tokenAmount?.amount ?? '0',
      );
      return amount === '0';
    });
    if (empty.length === 0) return { closed: 0 };

    const keypair = signer instanceof Keypair ? signer : Keypair.fromSecretKey(signer.secretKey);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
    const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
    for (const { row, programId } of empty.slice(0, 8)) {
      tx.add(
        new TransactionInstruction({
          programId,
          keys: [
            { pubkey: row.pubkey, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: false },
          ],
          data: Buffer.from([9]),
        }),
      );
    }
    tx.sign(keypair);
    const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const conf = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
    if (conf.value.err) return { closed: 0 };
    return { closed: Math.min(empty.length, 8), signature };
  } catch {
    return { closed: 0 };
  }
}
