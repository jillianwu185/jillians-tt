"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });
    if (error) {
      setErrorMessage(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col items-center gap-6 px-6 py-32 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.png" alt="" className="h-14 w-14" />
      <h1 className="text-2xl font-bold text-neutral-800">Sign in</h1>
      {status === "sent" ? (
        <p className="rounded-2xl bg-sky-50 px-5 py-4 text-neutral-600">
          Check your email for a login link. ✉️
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-full border border-neutral-200 px-4 py-2.5 text-center"
          />
          <button
            type="submit"
            className="rounded-full bg-sky-400 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-sky-500"
          >
            Send login link
          </button>
          {status === "error" && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}
        </form>
      )}
    </main>
  );
}
