"use client";

import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function IdeasPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: input }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failed to get a reply");

      setMessages([...nextMessages, { role: "assistant", content: result.reply }]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col px-6 py-8">
      <h1 className="mb-4 text-2xl font-semibold">Ideas</h1>

      <div className="mb-4 flex-1 space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-neutral-500">
            Ask me for video ideas — I&apos;ll ground suggestions in what&apos;s actually working
            on your TikTok, once there&apos;s enough synced data.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg p-3 text-sm ${
              m.role === "user" ? "ml-auto max-w-[80%] bg-black text-white" : "max-w-[80%] bg-neutral-100"
            }`}
          >
            {m.content}
          </div>
        ))}
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What should I make next?"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-md bg-black px-5 py-2 text-sm text-white"
        >
          {sending ? "…" : "Send"}
        </button>
      </form>
    </main>
  );
}
