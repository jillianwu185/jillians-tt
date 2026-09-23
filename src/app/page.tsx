import Link from "next/link";

const FEATURES = [
  {
    title: "Studio",
    body: "Upload a raw talking-head clip and get back an auto-styled edit: filler words, stutters, and dead air are cut automatically, a header title and caption style are chosen to match the transcript, and emphasis callouts highlight the moments that matter. Drag to retime any cut, callout, or overlay by hand before rendering.",
  },
  {
    title: "Story mode",
    body: "For multi-clip projects, an AI pass reorders clips into a narrative: picks the strongest 3-second hook, drops redundant points so nothing repeats, and lands on a memorable ending, targeting a 30-60 second final cut.",
  },
  {
    title: "Overlays",
    body: "Drop in image or full-video overlays with position, size, and timing controls, six built-in entrance/exit animations, and one-click background removal so an image sits cleanly over the footage.",
  },
  {
    title: "Insights",
    body: "Import a TikTok Studio analytics export to see which posts are actually performing, so future edits lean into what has worked.",
  },
  {
    title: "Ideas",
    body: "A running backlog of video ideas and hooks, kept in one place instead of scattered notes.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-16 px-6 py-20">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold">Jillian&apos;s Auto-Editor</h1>
        <p className="max-w-lg text-neutral-600">
          A personal editing tool that turns a raw talking-head recording into a
          publish-ready TikTok clip — automatic cuts, captions, and styling, with
          manual control over anything worth adjusting by hand.
        </p>
        <div className="flex gap-4">
          <Link href="/studio" className="rounded-md bg-black px-5 py-2.5 text-white">
            Studio
          </Link>
          <Link href="/insights" className="rounded-md bg-black px-5 py-2.5 text-white">
            Insights
          </Link>
          <Link href="/ideas" className="rounded-md bg-black px-5 py-2.5 text-white">
            Ideas
          </Link>
        </div>
      </div>

      <div className="grid gap-8 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{feature.title}</h2>
            <p className="text-sm text-neutral-600">{feature.body}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-neutral-400">
        This is a single-user tool built and used by its owner — Studio, Insights,
        and Ideas require signing in with the owner&apos;s account.
      </p>
    </main>
  );
}
