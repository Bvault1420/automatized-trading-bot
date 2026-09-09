"use client";

import { useState } from "react";
import { submitReport } from "@/actions/social";
import { REPORT_REASONS } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { FieldError, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

interface Props {
  open: boolean;
  onClose: () => void;
  targetType: "game" | "comment" | "user";
  targetId: string;
}

export function ReportDialog({ open, onClose, targetType, targetId }: Props) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  const submit = async () => {
    setPending(true);
    setError(null);
    const res = await submitReport({ targetType, targetId, reason, details });
    setPending(false);
    if (!res.ok) return setError(res.error);
    toast("Danke für deine Meldung. Wir prüfen den Inhalt.", "success");
    setDetails("");
    onClose();
  };

  const label = targetType === "game" ? "Spiel melden" : targetType === "comment" ? "Kommentar melden" : "Nutzer melden";

  return (
    <Sheet open={open} onClose={onClose} title={label}>
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted">
          Wähle einen Grund. Meldungen sind vertraulich; die Person wird nicht informiert, wer gemeldet hat.
        </p>
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Grund</legend>
          {REPORT_REASONS.map((r) => (
            <label
              key={r.value}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10"
            >
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="accent-accent"
              />
              {r.label}
            </label>
          ))}
        </fieldset>
        <Textarea
          placeholder="Optional: Details (z. B. wo genau das Problem auftritt)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={1000}
        />
        <FieldError>{error}</FieldError>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} type="button">Abbrechen</Button>
          <Button onClick={submit} loading={pending} type="button">Melden</Button>
        </div>
      </div>
    </Sheet>
  );
}
