import { Keypair } from '@solana/web3.js';
import { encryptSecret, decryptSecret } from '../src/util/secret.js';
import { encodeBase58, isSolanaAddress, WSOL_MINT, USDC_MINT } from '../src/chain/solana.js';
import { quoteSwap } from '../src/trading/executor/jupiter.js';
import { config } from '../src/config.js';

async function main() {
  const errors: string[] = [];

  if (config.chain.family !== 'solana' || config.chain.dexscreenerId !== 'solana') {
    errors.push(`CHAIN default ist ${config.chainKey}, erwartet solana`);
  } else {
    console.log('ok  default chain =', config.chain.name);
  }

  const evmKeystore = encryptSecret('0xdeadbeef', 'passphrase-test-1');
  const keypair = Keypair.generate();
  const solSecret = Buffer.from(keypair.secretKey).toString('base64');
  const solKeystore = encryptSecret(solSecret, 'passphrase-test-1');

  if (evmKeystore === solKeystore) errors.push('EVM- und Solana-Keystore dürfen nicht identisch sein');
  try {
    const roundtrip = decryptSecret(solKeystore, 'passphrase-test-1');
    const restored = Keypair.fromSecretKey(Buffer.from(roundtrip, 'base64'));
    if (restored.publicKey.toBase58() !== keypair.publicKey.toBase58()) {
      errors.push('Solana-Keystore rundtrip stimmt nicht');
    } else {
      console.log('ok  solana keystore roundtrip', restored.publicKey.toBase58());
    }
  } catch (err) {
    errors.push(`Solana decrypt: ${(err as Error).message}`);
  }

  try {
    decryptSecret(evmKeystore, 'passphrase-test-1');
    // Decrypting the EVM blob must not yield a valid 64-byte Solana secret.
    const evmPlain = decryptSecret(evmKeystore, 'passphrase-test-1');
    const asSol = Buffer.from(evmPlain, 'base64');
    if (asSol.length === 64) errors.push('EVM-Keystore darf nicht als Solana-Secret lesbar sein');
    else console.log('ok  EVM-Keystore ist kein Solana-Secret (len', asSol.length, ')');
  } catch {
    console.log('ok  EVM-Keystore lässt sich nicht als Solana lesen');
  }

  const addr = keypair.publicKey.toBase58();
  if (!isSolanaAddress(addr)) errors.push(`gültige Adresse abgelehnt: ${addr}`);
  if (isSolanaAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0')) {
    errors.push('EVM-Adresse wurde als Solana akzeptiert');
  } else {
    console.log('ok  Adressvalidierung trennt EVM und Solana');
  }

  const exported = encodeBase58(keypair.secretKey);
  if (exported.length < 64) errors.push('Base58-Export zu kurz');
  else console.log('ok  Phantom-Exportlänge', exported.length);

  try {
    const quote = await quoteSwap(WSOL_MINT, USDC_MINT, 10_000_000n, 1);
    const out = Number(quote.outAmount);
    if (!(out > 0)) errors.push('Jupiter-Quote outAmount ist 0');
    else console.log('ok  Jupiter quote 0.01 SOL →', out, 'USDC-raw', quote.outputMint === USDC_MINT ? 'mint ok' : 'FALSCHES MINT');
  } catch (err) {
    errors.push(`Jupiter-Quote: ${(err as Error).message}`);
  }

  if (errors.length) {
    console.error('\nFAIL');
    for (const e of errors) console.error(' -', e);
    process.exit(1);
  }
  console.log('\nall checks passed');
}

void main();
