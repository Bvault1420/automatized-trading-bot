import { VersionedTransaction } from '@solana/web3.js';
import { createLogger } from '../../util/logger.js';
import { clamp } from '../../util/num.js';
import { solanaConnection, WSOL_MINT, mintDecimals } from '../../chain/solana.js';
import { solanaWallet } from '../../chain/solanaWallet.js';

const log = createLogger('jupiter');
const JUPITER = 'https://lite-api.jup.ag/swap/v1';

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  swapUsdValue?: string;
}

export interface JupiterSwapResult {
  signature: string;
  inAmount: bigint;
  outAmount: bigint;
  inDecimals: number;
  outDecimals: number;
}

function slippageBps(pct: number): number {
  return Math.round(clamp(pct, 0.1, 50) * 100);
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function quoteSwap(inputMint: string, outputMint: string, amount: bigint, slippagePct: number): Promise<JupiterQuote> {
  if (amount <= 0n) throw new Error('Swap-Betrag ist 0');
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: String(slippageBps(slippagePct)),
    swapMode: 'ExactIn',
    restrictIntermediateTokens: 'true',
  });
  const res = await fetch(`${JUPITER}/quote?${params}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await readJson(res);
  if (!res.ok || !data.outAmount) {
    const message = String(data.error || data.message || `Jupiter-Quote fehlgeschlagen (${res.status})`);
    throw new Error(message);
  }
  return data as unknown as JupiterQuote;
}

export async function executeSwap(inputMint: string, outputMint: string, amount: bigint, slippagePct: number): Promise<JupiterSwapResult> {
  const keypair = solanaWallet.requireKeypair();
  const quote = await quoteSwap(inputMint, outputMint, amount, slippagePct);
  const inDecimals = inputMint === WSOL_MINT ? 9 : await mintDecimals(inputMint);
  const outDecimals = outputMint === WSOL_MINT ? 9 : await mintDecimals(outputMint);

  const res = await fetch(`${JUPITER}/swap`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 2_000_000,
          global: false,
          priorityLevel: 'high',
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await readJson(res);
  const encoded = String(data.swapTransaction ?? '');
  if (!res.ok || !encoded) {
    throw new Error(String(data.error || data.message || `Jupiter-Swap fehlgeschlagen (${res.status})`));
  }

  const tx = VersionedTransaction.deserialize(Buffer.from(encoded, 'base64'));
  tx.sign([keypair]);

  const conn = solanaConnection();
  const signature = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 4,
    preflightCommitment: 'confirmed',
  });

  const lastValidBlockHeight = Number(data.lastValidBlockHeight ?? 0);
  const blockhash = tx.message.recentBlockhash;
  const confirmation = lastValidBlockHeight
    ? await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
    : await conn.confirmTransaction(signature, 'confirmed');
  if (confirmation.value.err) {
    throw new Error(`Jupiter-Transaktion fehlgeschlagen (${signature})`);
  }

  log.info(`Jupiter-Swap ${inputMint.slice(0, 6)}→${outputMint.slice(0, 6)} ${signature}`);
  return {
    signature,
    inAmount: BigInt(quote.inAmount),
    outAmount: BigInt(quote.outAmount),
    inDecimals,
    outDecimals,
  };
}

export { WSOL_MINT };
