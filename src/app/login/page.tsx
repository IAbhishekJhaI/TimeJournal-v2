"use client";

import type React from "react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Clock, Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const params = useSearchParams();
  const callbackError = params.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(callbackError);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--accent)",
              color: "var(--accent-contrast)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Clock size={22} />
          </span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500 }}>TimeJournal</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Log your time, 15 minutes at a time.
            </div>
          </div>
        </div>

        {status === "sent" ? (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: 20,
              textAlign: "center",
            }}
          >
            <Mail size={28} style={{ color: "var(--accent)", marginBottom: 8 }} />
            <p style={{ fontWeight: 500, margin: "0 0 4px" }}>Check your email</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              We sent a magic link to {email}. Open it on this device to sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label
              htmlFor="email"
              style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                height: 44,
                padding: "0 12px",
                fontSize: 16,
                color: "var(--text)",
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius)",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={status === "sending"}
              style={{
                width: "100%",
                height: 44,
                marginTop: 12,
                fontSize: 15,
                fontWeight: 500,
                color: "var(--accent-contrast)",
                background: "var(--accent)",
                border: "none",
                borderRadius: "var(--radius)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: status === "sending" ? 0.7 : 1,
              }}
            >
              {status === "sending" ? (
                <>
                  <Loader2 size={16} className="tj-spin" /> Sending…
                </>
              ) : (
                "Send magic link"
              )}
            </button>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12, textAlign: "center" }}>
              Invite-only. Sign-in is restricted to invited emails.
            </p>
          </form>
        )}

        {message && status !== "sent" ? (
          <p style={{ fontSize: 13, color: "var(--danger)", marginTop: 12 }}>{message}</p>
        ) : null}
      </div>
      <style>{`.tj-spin{animation:tjspin 1s linear infinite}@keyframes tjspin{to{transform:rotate(360deg)}}`}</style>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
