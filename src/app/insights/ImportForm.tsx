"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ImportForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file || !dateRangeStart || !dateRangeEnd) return;

    setStatus("uploading");
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("date_range_start", dateRangeStart);
      formData.append("date_range_end", dateRangeEnd);

      const response = await fetch("/api/tiktok/import", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Import failed");

      form.reset();
      router.refresh();
      setStatus("idle");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Import failed");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 text-sm">
      <div>
        <label className="mb-1 block text-neutral-600">Export covers</label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            required
            value={dateRangeStart}
            onChange={(e) => setDateRangeStart(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1.5"
          />
          <span>to</span>
          <input
            type="date"
            required
            value={dateRangeEnd}
            onChange={(e) => setDateRangeEnd(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1.5"
          />
        </div>
      </div>
      <input type="file" name="file" accept=".csv" required className="text-sm" />
      <button
        type="submit"
        disabled={status === "uploading"}
        className="rounded-md bg-black px-4 py-2 text-white"
      >
        {status === "uploading" ? "Importing…" : "Import Studio export"}
      </button>
      {status === "error" && <p className="w-full text-red-600">{errorMessage}</p>}
    </form>
  );
}
