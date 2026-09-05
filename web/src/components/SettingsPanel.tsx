import { useEffect, useState } from 'react';
import { RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { Card } from './ui';
import { api } from '../lib/api';
import type { BotSettings } from '../lib/types';

interface Field {
  key: keyof BotSettings;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

const FIELDS: Field[] = [
  {
    key: 'minEntryScore',
    label: 'Mindest-Score',
    hint: '45–55 = optimaler Bereich für aktive Trades mit guter Filterung',
    min: 30, max: 90, step: 1, unit: 'Pkt.',
  },
  {
    key: 'riskPerTradePct',
    label: 'Einsatz pro Trade',
    hint: 'Bei Mini-Konten hoch lassen (~75–85%), damit Mindestordergröße erreicht wird',
    min: 5, max: 95, step: 1, unit: '%',
  },
  {
    key: 'maxOpenPositions',
    label: 'Max. Positionen',
    hint: 'Gleichzeitig gehaltene Coins',
    min: 1, max: 8, step: 1, unit: '',
  },
  {
    key: 'stopLossPct',
    label: 'Stop-Loss',
    hint: 'Verlustbegrenzung je Position',
    min: 5, max: 50, step: 1, unit: '%',
  },
  {
    key: 'takeProfitPct',
    label: 'Take-Profit',
    hint: 'Gewinnmitnahme nach Abzug von Gebühren und Slippage',
    min: 10, max: 200, step: 5, unit: '%',
  },
  {
    key: 'trailingStopPct',
    label: 'Trailing-Stop',
    hint: 'Rückgang vom Höchststand bis zum Exit',
    min: 4, max: 50, step: 1, unit: '%',
  },
  {
    key: 'maxHoldMinutes',
    label: 'Max. Haltedauer',
    hint: 'Positionen ohne Momentum werden nach dieser Zeit geschlossen',
    min: 5, max: 480, step: 5, unit: 'Min.',
  },
  {
    key: 'maxSlippagePct',
    label: 'Max. Slippage',
    hint: 'Toleranz bei Preisschwankungen während der Ausführung',
    min: 0.5, max: 25, step: 0.5, unit: '%',
  },
  {
    key: 'minLiquidityUsd',
    label: 'Mindest-Liquidität',
    hint: 'Schutz vor extrem dünnen Pools',
    min: 5000, max: 500_000, step: 5000, unit: '$',
  },
  {
    key: 'dailyLossLimitPct',
    label: 'Tagesverlustlimit',
    hint: 'Keine neuen Einstiege nach diesem Tagesverlust',
    min: 5, max: 80, step: 1, unit: '%',
  },
  {
    key: 'maxDrawdownPct',
    label: 'Maximaler Drawdown',
    hint: 'Schutzgrenze: keine neuen Trades bei hohem Drawdown',
    min: 10, max: 90, step: 1, unit: '%',
  },
];

export function SettingsPanel({
  settings,
  isPaper,
  onNotify,
  onRefresh,
}: {
  settings: BotSettings;
  isPaper: boolean;
  onNotify: (message: string, ok?: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<BotSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [paperBalance, setPaperBalance] = useState('4.4');

  useEffect(() => setDraft(settings), [settings]);

  const dirty = FIELDS.some((field) => draft[field.key] !== settings[field.key]);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateSettings(draft);
      onNotify('Einstellungen gespeichert', true);
      await onRefresh();
    } catch (err) {
      onNotify((err as Error).message, false);
    } finally {
      setSaving(false);
    }
  };

  const resetPaper = async () => {
    const balance = Number(paperBalance);
    if (!Number.isFinite(balance) || balance <= 0) {
      onNotify('Gültigen Startbetrag eingeben', false);
      return;
    }
    try {
      await api.resetPaper(balance);
      onNotify(`Demokonto auf $${balance.toFixed(2)} zurückgesetzt`, true);
      await onRefresh();
    } catch (err) {
      onNotify((err as Error).message, false);
    }
  };

  return (
    <Card
      title="Strategie & Risiko"
      icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
      action={
        dirty && (
          <button type="button" className="btn-primary py-1 px-3 text-xs" onClick={save} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            Speichern
          </button>
        )
      }
      bodyClassName="p-4 sm:p-5 space-y-4"
    >
      <div className="space-y-3">
        {FIELDS.map(({ key, label, hint, min, max, step, unit }) => {
          const val = Number(draft[key] ?? settings[key]);
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <label htmlFor={key} className="font-medium text-zinc-300">
                  {label}
                </label>
                <span className="num font-semibold text-zinc-100">
                  {val.toLocaleString('de-DE')} {unit}
                </span>
              </div>
              <input
                id={key}
                type="range"
                min={min}
                max={max}
                step={step}
                value={val}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                className="h-1.5 w-full accent-accent bg-surface-3 rounded-lg cursor-pointer"
              />
              <p className="text-[10px] text-zinc-500">{hint}</p>
            </div>
          );
        })}
      </div>

      {isPaper && (
        <div className="border-t border-border/80 pt-4">
          <h4 className="text-xs font-medium text-zinc-300">Demokonto zurücksetzen</h4>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Setzt Demo-Guthaben, Historie und Statistik zurück.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              step="0.1"
              min="1"
              value={paperBalance}
              onChange={(e) => setPaperBalance(e.target.value)}
              className="input max-w-[120px]"
              placeholder="4.40"
            />
            <button type="button" className="btn-ghost" onClick={resetPaper}>
              <RotateCcw className="h-3.5 w-3.5" />
              Zurücksetzen
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
