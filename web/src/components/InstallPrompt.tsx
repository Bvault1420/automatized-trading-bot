import { useCallback, useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('pwa-dismiss') === '1');

  useEffect(() => {
    const onInstall = () => setInstalled(true);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('appinstalled', onInstall);
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => {
      window.removeEventListener('appinstalled', onInstall);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setInstalled(true);
    return outcome === 'accepted';
  }, [deferred]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem('pwa-dismiss', '1');
  }, []);

  const showBanner = !installed && !dismissed && (deferred !== null || isIos());

  return { install, dismiss, showBanner, canInstall: deferred !== null, isIos: isIos() && !installed };
}

export function InstallBanner({
  onInstall,
  onDismiss,
  showIosHint,
}: {
  onInstall: () => void;
  onDismiss: () => void;
  showIosHint: boolean;
}) {
  return (
    <div className="slide-in mx-3 mb-3 flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-3 sm:mx-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-1 text-sm font-bold">
        A
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">Als App installieren</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
          {showIosHint ? (
            <>
              Safari: <Share className="mb-0.5 inline h-3 w-3" /> Teilen → „Zum Home-Bildschirm“
            </>
          ) : (
            'Wie bei Cursor: einmal installieren, dann öffnet sich Aletheia wie eine native App.'
          )}
        </p>
        {!showIosHint && (
          <button type="button" className="btn-primary mt-2 px-3 py-1.5 text-xs" onClick={onInstall}>
            <Download className="h-3.5 w-3.5" />
            Jetzt installieren
          </button>
        )}
      </div>
      <button type="button" className="shrink-0 rounded-md p-1 text-zinc-500 hover:bg-surface-3" onClick={onDismiss} aria-label="Schließen">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
