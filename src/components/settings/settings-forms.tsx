"use client";

import { useActionState, useState } from "react";
import { deleteMyAccount, exportMyData, updateProfile } from "@/actions/account";
import { updatePassword } from "@/actions/auth";
import { LIMITS } from "@/lib/config";
import type { ActionResult, Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { UsernameField } from "@/components/auth/username-field";
import { AvatarUpload } from "@/components/settings/avatar-upload";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateProfile, null);
  const err = (field: string) => (state && !state.ok && state.field === field ? state.error : null);
  return (
    <form action={action} className="space-y-4">
      <AvatarUpload userId={profile.id} name={profile.display_name || profile.username} initialUrl={profile.avatar_url} />
      <UsernameField defaultValue={profile.username} currentUsername={profile.username} error={err("username")} />
      <div>
        <Label htmlFor="displayName">Anzeigename</Label>
        <Input id="displayName" name="displayName" defaultValue={profile.display_name} maxLength={LIMITS.displayName} required />
        <FieldError>{err("displayName")}</FieldError>
      </div>
      <div>
        <Label htmlFor="bio" hint={`max. ${LIMITS.bio} Zeichen`}>Bio</Label>
        <Textarea id="bio" name="bio" defaultValue={profile.bio} maxLength={LIMITS.bio} />
      </div>
      <div>
        <Label htmlFor="website" hint="optional">Website</Label>
        <Input id="website" name="website" defaultValue={profile.website ?? ""} placeholder="https://" inputMode="url" />
        <FieldError>{err("website")}</FieldError>
      </div>
      {state && !state.ok && !state.field && <FieldError>{state.error}</FieldError>}
      {state?.ok && <FieldSuccess>Profil gespeichert.</FieldSuccess>}
      <Button type="submit" loading={pending}>Speichern</Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updatePassword, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="new-password" hint={`mind. ${LIMITS.password.min} Zeichen`}>Neues Passwort</Label>
        <Input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={LIMITS.password.min} />
      </div>
      <div>
        <Label htmlFor="confirm-password">Wiederholen</Label>
        <Input id="confirm-password" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {state && !state.ok && <FieldError>{state.error}</FieldError>}
      {state?.ok && <FieldSuccess>Passwort aktualisiert.</FieldSuccess>}
      <Button type="submit" variant="secondary" loading={pending}>Passwort ändern</Button>
    </form>
  );
}

export function DataExportButton() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = async () => {
    setBusy(true);
    const res = await exportMyData();
    setBusy(false);
    if (!res.ok || !res.data) return toast(res.ok ? "Keine Daten." : res.error, "error");
    const blob = new Blob([res.data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meine-daten-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button type="button" variant="secondary" onClick={run} loading={busy}>
      Meine Daten herunterladen (JSON)
    </Button>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(deleteMyAccount, null);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="outline" className="border-danger/50 text-red-400 hover:bg-danger/10" onClick={() => setOpen(true)}>
        Konto löschen
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-xl border border-danger/40 bg-danger/5 p-4">
      <p className="text-sm text-red-200">
        Dein Konto, alle Spiele, Kommentare, Likes und hochgeladenen Bilder werden <strong>dauerhaft</strong> gelöscht. Das kann nicht rückgängig gemacht werden.
      </p>
      <div>
        <Label htmlFor="confirm-delete">Gib zur Bestätigung <span className="font-mono">LÖSCHEN</span> ein</Label>
        <Input id="confirm-delete" name="confirm" autoComplete="off" required />
      </div>
      {state && !state.ok && <FieldError>{state.error}</FieldError>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
        <Button type="submit" variant="danger" loading={pending}>Endgültig löschen</Button>
      </div>
    </form>
  );
}
