"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authCallbackUrl } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { emailSchema, firstError, loginSchema, passwordSchema, signupSchema, usernameSchema } from "@/lib/validation";

function safeNextPath(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-Mail oder Passwort ist falsch.";
  if (m.includes("email not confirmed")) return "Bitte bestätige zuerst deine E-Mail-Adresse.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Diese E-Mail-Adresse ist bereits registriert.";
  if (m.includes("rate limit") || m.includes("too many")) return "Zu viele Versuche. Bitte warte kurz.";
  if (m.includes("password") && m.includes("weak")) return "Das Passwort ist zu schwach.";
  if (m.includes("same password")) return "Das neue Passwort muss sich vom alten unterscheiden.";
  if (m.includes("session") && m.includes("missing")) return "Keine gültige Sitzung. Bitte fordere den Link erneut an.";
  return message;
}

export async function signUp(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    username: formData.get("username"),
    displayName: formData.get("displayName") ?? "",
    acceptTerms: formData.get("acceptTerms") === "on",
    confirmAge: formData.get("confirmAge") === "on",
  });
  if (!parsed.success) {
    const e = firstError(parsed.error);
    return { ok: false, error: e.message, field: e.field };
  }
  const { email, password, username, displayName } = parsed.data;
  const supabase = await createClient();

  const { data: available, error: availErr } = await supabase.rpc("is_username_available", { p_username: username });
  if (availErr) return { ok: false, error: "Nutzername konnte nicht geprüft werden." };
  if (!available) return { ok: false, error: "Dieser Nutzername ist bereits vergeben.", field: "username" };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authCallbackUrl(),
      data: {
        username,
        display_name: displayName || username,
        accepted_terms: "true",
        accepted_terms_at: new Date().toISOString(),
      },
    },
  });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };

  // Bei aktivierter E-Mail-Bestätigung gibt es noch keine Session.
  if (!data.session) {
    redirect(`/signup/check-email?email=${encodeURIComponent(email)}`);
  }
  redirect("/");
}

export async function signIn(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    const e = firstError(parsed.error);
    return { ok: false, error: e.message, field: e.field };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  redirect(safeNextPath(formData.get("next")));
}

export async function signInWithOAuth(provider: "google" | "github", next?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${authCallbackUrl()}?next=${encodeURIComponent(safeNextPath(next))}`,
    },
  });
  if (error || !data.url) return { ok: false, error: error ? friendlyAuthError(error.message) : "Anmeldung fehlgeschlagen." };
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error).message, field: "email" };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${authCallbackUrl()}?next=${encodeURIComponent("/reset-password")}`,
  });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true };
}

export async function updatePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((d) => d.password === d.confirm, { message: "Die Passwörter stimmen nicht überein.", path: ["confirm"] })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    const e = firstError(parsed.error);
    return { ok: false, error: e.message, field: e.field };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true };
}

export async function resendSignupConfirmation(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error).message, field: "email" };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: authCallbackUrl() },
  });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  return { ok: true };
}

/** Onboarding für OAuth-Nutzer: Nutzername wählen, Alter & AGB bestätigen. */
export async function completeOnboarding(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = z
    .object({
      username: usernameSchema,
      acceptTerms: z.literal(true, { message: "Bitte akzeptiere die Nutzungsbedingungen und Datenschutzerklärung." }),
      confirmAge: z.literal(true, { message: "Du musst mindestens 16 Jahre alt sein." }),
    })
    .safeParse({
      username: formData.get("username"),
      acceptTerms: formData.get("acceptTerms") === "on",
      confirmAge: formData.get("confirmAge") === "on",
    });
  if (!parsed.success) {
    const e = firstError(parsed.error);
    return { ok: false, error: e.message, field: e.field };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  if (profile && profile.username !== parsed.data.username) {
    const { data: available } = await supabase.rpc("is_username_available", { p_username: parsed.data.username });
    if (!available) return { ok: false, error: "Dieser Nutzername ist bereits vergeben.", field: "username" };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ username: parsed.data.username, accepted_terms_at: new Date().toISOString() })
    .eq("id", user.id);
  if (profileError) return { ok: false, error: "Profil konnte nicht gespeichert werden." };

  const { error } = await supabase.auth.updateUser({
    data: { accepted_terms: "true", accepted_terms_at: new Date().toISOString(), username: parsed.data.username },
  });
  if (error) return { ok: false, error: friendlyAuthError(error.message) };
  redirect("/");
}
