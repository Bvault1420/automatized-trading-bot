const MIN_LENGTH = 8;

export function assertPassphrase(passphrase: string, label = 'Passphrase'): string {
  const value = passphrase.normalize('NFKC');
  if (value.trim() !== value) {
    throw new Error(`${label} darf nicht mit Leerzeichen beginnen oder enden`);
  }
  if (value.length < MIN_LENGTH) {
    throw new Error(`${label} muss mindestens ${MIN_LENGTH} Zeichen lang sein`);
  }
  if (value.length > 200) {
    throw new Error(`${label} ist zu lang`);
  }
  return value;
}
