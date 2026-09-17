import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-8 px-6 py-32 text-center">
      <h1 className="text-3xl font-semibold">Jillian&apos;s Auto-Editor</h1>
      <p className="text-neutral-600">Studio, Insights, and Ideas — nothing else.</p>
      <div className="flex gap-4">
        <Link href="/studio" className="rounded-md bg-black px-5 py-2.5 text-white">
          Studio
        </Link>
        <Link href="/insights" className="rounded-md bg-black px-5 py-2.5 text-white">
          Insights
        </Link>
      </div>
    </main>
  );
}
