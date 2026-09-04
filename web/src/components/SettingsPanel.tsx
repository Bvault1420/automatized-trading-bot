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
    hint: 'Höher = deutlich selektiver. Unter 60 rutschen schwache Memes durch',
    min: 30, max: 90, step: 1, unit: 'Pkt.',
  },
  {
    key: 'riskPerTradePct',
    label: 'Einsatz pro Trade',
    hint: 'Kleiner halten – wenige, saubere Trades schlagen viele Verlierer',
    min: 5, max: 60, step: 1, unit: '%',
  },
  {
    key: 'maxOpenPositions',
    label: 'Max. Positionen',
    hint: 'Gleichzeitig offene Trades',
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
    label: 'Erste Gewinnmitnahme',
    hint: 'Bei diesem Gewinn wird der Grossteil verkauft, Rest darf laufen',
    min: 10, max: 200, step: 5, unit: '%',
  },
  {
    key: 'trailingStopPct',
    label: 'Trailing-Stop',
    hint: 'Rückgang vom Höchststand bis zum Ausstieg',
    min: 5, max: 50, step: 1, unit: '%',
  },
  {
    key: 'maxHoldMinutes',
    label: 'Max. Haltedauer',
    hint: 'Seitwärtsläufer und schwache Plus-Trades werden hier beendet',
    min: 5, max: 480, step: 5, unit: 'Min.',
  },
  {
    key: 'maxSlippagePct',
    label: 'Max. Slippage',
    hint: 'Abbruch, wenn die Ausführung teurer wird',
    min: 0.5, max: 25, step: 0.5, unit: '%',
  },
  {
    key: 'minLiquidityUsd',
    label: 'Mindest-Liquidität',
    hint: 'Token mit weniger Liquidität werden ignoriert',
    min: 5000, max: 500_000, step: 5000, unit: '$',
  },
  {
    key: 'dailyLossLimitPct',
    label: 'Tagesverlustlimit',
    hint: 'Bot pausiert nach diesem Tagesverlust',
    min: 5, max: 80, step: 1, unit: '%',
  },
  {
    key: 'maxDrawdownPct',
    label: 'Maximaler Drawdown',
    hint: 'Notaus bei diesem Rückgang vom Höchststand',
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
  const [paperBalance, setPaperBalance] = useState('11');

  // Aenderungen vom Server uebernehmen, solange der Nutzer nichts Offenes hat.
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
      onNotify('Ungültiger Betrag', false);
      return;
    }
    try {
      const result = await api.resetPaper(balance);
      onNotify(result.message, true);
      await onRefresh();
    } catch (err) {
      onNotify((err as Error).message, false);
    }
  };

  return (
    <Card
      title="Strategie-Einstellungen"
      icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
      action={
        dirty && (
          <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={() => void save()} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            Speichern
          </button>
        )
      }
      bodyClassName="p-5 space-y-4"
    >
      <p className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-slate-400">
        Die Strategie filtert Abstürze, zu späte Einstiege und schwache
        Orderbücher vor dem Kauf, nimmt Gewinne früher mit und schneidet
        gescheiterte Trades, bevor der Stop-Loss greift. Weniger Trades, höhere
        Qualität – keine Garantie, aber das ist der Hebel für die Trefferquote.
      </p>
      <div className="space-y-3.5">
        {FIELDS.map((field) => {
          const value = Number(draft[field.key]);
          return (
            <div key={String(field.key)}>
              <div className="flex items-baseline justify-between gap-2">
                <label className="text-xs font-medium text-slate-300">{field.label}</label>
                <span className="num text-xs font-bold text-emerald-400">
                  {field.unit === '$'
                    ? `$${value.toLocaleString('de-DE')}`
                    : `${value}${field.unit ? ` ${field.unit}` : ''}`}
                </span>
              </div>
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={value}
                onChange={(event) => setDraft({ ...draft, [field.key]: Number(event.target.value) })}
                className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-emerald-500"
              />
              <p className="mt-0.5 text-[10px] text-slate-600">{field.hint}</p>
            </div>
          );
        })}
      </div>

      {isPaper && (
        <div className="border-t border-white/[0.06] pt-4">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Simulationskonto zurücksetzen
          </label>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              className="input"
              value={paperBalance}
              onChange={(event) => setPaperBalance(event.target.value)}
              min={1}
              step={1}
            />
            <button type="button" className="btn-ghost shrink-0" onClick={() => void resetPaper()}>
              <RotateCcw className="h-4 w-4" />
              Zurücksetzen
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-600">
            Setzt Startkapital (USD), Positionen und Handelshistorie der Simulation zurück.
          </p>
        </div>
      )}
    </Card>
  );
}
