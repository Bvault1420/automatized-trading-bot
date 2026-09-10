export function allowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (host.endsWith('.cursorvm.com') || host.endsWith('.cvm.dev')) return true;
    if (host.endsWith('.localhost')) return true;
    return false;
  } catch {
    return false;
  }
}
