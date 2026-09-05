import { useCallback, useEffect, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';

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

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [modalOpen, setModalOpen] = useState(false);
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
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      if (outcome === 'accepted') {
        setInstalled(true);
        setModalOpen(false);
        return true;
      }
    }
    setModalOpen(true);
    return false;
  }, [deferred]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setModalOpen(false);
    sessionStorage.setItem('pwa-dismiss', '1');
  }, []);

  const showBanner = !installed && !dismissed;

  return {
    install,
    dismiss,
    modalOpen,
    closeModal: () => setModalOpen(false),
    showBanner,
    canInstall: !installed,
    isIos: isIos(),
    isAndroid: isAndroid(),
    hasNativePrompt: deferred !== null,
  };
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
    <div className="slide-in mx-3 mb-3 flex items-start gap-3 rounded-lg border border-accent/25 bg-accent/5 p-3 sm:mx-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-1 text-sm font-bold">
        A
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">Aletheia als App installieren</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
          {showIosHint
            ? 'Tippe unten auf „App installieren“ – Anleitung für Safari/iPhone folgt.'
            : 'Einmal installieren, dann öffnet sich das Dashboard wie eine native App – auch vom Handy.'}
        </p>
        <button type="button" className="btn-primary mt-2 px-3 py-1.5 text-xs" onClick={onInstall}>
          <Download className="h-3.5 w-3.5" />
          App installieren
        </button>
      </div>
      <button type="button" className="shrink-0 rounded-md p-1 text-zinc-500 hover:bg-surface-3" onClick={onDismiss} aria-label="Schließen">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function InstallModal({
  open,
  onClose,
  onInstall,
  isIos,
  isAndroid,
  hasNativePrompt,
}: {
  open: boolean;
  onClose: () => void;
  onInstall: () => void;
  isIos: boolean;
  isAndroid: boolean;
  hasNativePrompt: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface-1 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <Smartphone className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-100">App installieren</h2>
            <p className="text-xs text-zinc-500">Aletheia auf den Home-Bildschirm legen</p>
          </div>
        </div>

        {hasNativePrompt && (
          <button type="button" className="btn-primary mb-4 w-full" onClick={() => void onInstall()}>
            <Download className="h-4 w-4" />
            Jetzt installieren
          </button>
        )}

        {isIos && (
          <ol className="mb-4 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-zinc-400">
            <li>
              Tippe unten in Safari auf <Share className="mb-0.5 inline h-3.5 w-3.5" /> <strong className="text-zinc-300">Teilen</strong>
            </li>
            <li>
              Wähle <strong className="text-zinc-300">Zum Home-Bildschirm</strong>
            </li>
            <li>Tippe oben rechts auf <strong className="text-zinc-300">Hinzufügen</strong></li>
          </ol>
        )}

        {isAndroid && !hasNativePrompt && (
          <ol className="mb-4 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-zinc-400">
            <li>
              Menü <strong className="text-zinc-300">⋮</strong> (oben rechts in Chrome)
            </li>
            <li>
              <strong className="text-zinc-300">App installieren</strong> oder <strong className="text-zinc-300">Zum Startbildschirm hinzufügen</strong>
            </li>
          </ol>
        )}

        {!isIos && !isAndroid && (
          <ol className="mb-4 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-zinc-400">
            <li>Chrome/Edge: Adressleiste → Symbol <strong className="text-zinc-300">Installieren</strong></li>
            <li>Oder Menü → <strong className="text-zinc-300">App installieren</strong></li>
          </ol>
        )}

        <button type="button" className="btn-ghost w-full" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}
