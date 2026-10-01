"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SyncButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing" | "error">("idle");

  async function handleSync() {
    setStatus("syncing");
    try {
      const response = await fetch("/api/tiktok/sync", { method: "POST" });
      if (!response.ok) throw new Error("Sync failed");
      router.refresh();
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={status === "syncing"}
      className="rounded-full bg-sky-400 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-60"
    >
      {status === "syncing" ? "Syncing…" : status === "error" ? "Sync failed, retry" : "🔄 Sync now"}
    </button>
  );
}
