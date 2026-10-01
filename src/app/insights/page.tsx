import { createClient } from "@/lib/supabase/server";
import SyncButton from "@/app/insights/SyncButton";
import ImportForm from "@/app/insights/ImportForm";
import RetentionChart from "@/app/insights/RetentionChart";

export default async function InsightsPage() {
  const supabase = await createClient();

  const { data: credentials } = await supabase
    .from("tiktok_credentials")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (!credentials) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-3xl">
          📊
        </div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800">Insights</h1>
        <p className="mb-7 text-neutral-500">
          Connect your TikTok account to see how your videos are doing.
        </p>
        <a
          href="/api/auth/tiktok/authorize"
          className="inline-block rounded-full bg-sky-400 px-6 py-3 font-medium text-white shadow-sm transition hover:bg-sky-500"
        >
          Connect TikTok
        </a>
      </main>
    );
  }

  const { data: videos } = await supabase
    .from("tiktok_videos")
    .select("*")
    .order("posted_at", { ascending: false });

  const { data: studioImports } = await supabase
    .from("tiktok_studio_imports")
    .select("*")
    .order("uploaded_at", { ascending: false })
    .limit(1);
  const latestImport = studioImports?.[0];

  const sortedByViews = [...(videos ?? [])].sort((a, b) => b.views - a.views);
  const topVideos = sortedByViews.slice(0, 3);
  const bottomVideos = sortedByViews.slice(-3).reverse();

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-800">Insights ✨</h1>
          <p className="mt-1 text-sm text-neutral-500">How your videos are actually doing.</p>
        </div>
        <SyncButton />
      </div>

      {(!videos || videos.length === 0) && (
        <div className="rounded-2xl bg-neutral-50 p-8 text-center">
          <p className="text-neutral-500">
            No synced videos yet — click &quot;Sync now&quot; to pull your TikTok data.
          </p>
        </div>
      )}

      {videos && videos.length > 0 && (
        <>
          <section className="mb-8 rounded-3xl bg-pink-50 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-800">
              🌟 Top performing
            </h2>
            <VideoList videos={topVideos} />
          </section>

          <section className="mb-8 rounded-3xl bg-sky-50 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-800">
              🌱 Room to grow
            </h2>
            <VideoList videos={bottomVideos} />
          </section>

          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-neutral-800">
              All videos ({videos.length})
            </h2>
            <VideoList videos={sortedByViews} />
          </section>
        </>
      )}

      <section className="rounded-3xl bg-amber-50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-neutral-800">📥 Studio analytics import</h2>
        <p className="mb-4 text-sm text-neutral-600">
          TikTok Studio → Analytics → Download data. Upload the CSV here (watch time %,
          retention, traffic source aren&apos;t available via the API).
        </p>
        <ImportForm />
        {latestImport && (
          <div className="mt-5 rounded-2xl bg-white p-4">
            <p className="mb-3 text-sm text-neutral-500">
              Last import: {latestImport.date_range_start} to {latestImport.date_range_end} (
              {(latestImport.raw_csv_data as Record<string, string>[]).length} rows)
            </p>
            <RetentionChart rows={latestImport.raw_csv_data as Record<string, string>[]} />
          </div>
        )}
      </section>
    </main>
  );
}

type TikTokVideoRow = {
  id: string;
  tiktok_video_id: string;
  posted_at: string | null;
  title: string | null;
  cover_image_url: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  topic_tag: string | null;
  caption_style_tag: string | null;
  performance_summary: string | null;
  performance_verdict: "standout" | "solid" | "underperformed" | null;
};

const VERDICT_STYLES: Record<
  NonNullable<TikTokVideoRow["performance_verdict"]>,
  { label: string; emoji: string; badge: string }
> = {
  standout: { label: "Standout", emoji: "🔥", badge: "bg-pink-100 text-pink-700" },
  solid: { label: "Solid", emoji: "👍", badge: "bg-sky-100 text-sky-700" },
  underperformed: { label: "Underperformed", emoji: "🌱", badge: "bg-amber-100 text-amber-700" },
};

function VideoList({ videos }: { videos: TikTokVideoRow[] }) {
  if (videos.length === 0) {
    return <p className="text-sm text-neutral-400">Nothing here yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {videos.map((video) => {
        const verdict = video.performance_verdict ? VERDICT_STYLES[video.performance_verdict] : null;
        return (
          <li
            key={video.id}
            className="flex gap-4 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-neutral-100"
          >
            <div className="h-28 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
              {video.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.cover_image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl">🎬</div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-medium text-neutral-800">
                  {video.title || "Untitled video"}
                </p>
                {verdict && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${verdict.badge}`}
                  >
                    {verdict.emoji} {verdict.label}
                  </span>
                )}
              </div>

              <p className="mt-0.5 text-xs text-neutral-400">
                {video.posted_at ? new Date(video.posted_at).toLocaleDateString() : "unknown date"}
              </p>

              <p className="mt-1.5 text-sm text-neutral-600">
                {video.views.toLocaleString()} views · {video.likes.toLocaleString()} likes ·{" "}
                {video.comments.toLocaleString()} comments · {video.shares.toLocaleString()} shares
              </p>

              {(video.topic_tag || video.caption_style_tag) && (
                <p className="mt-1 text-xs text-neutral-400">
                  {[video.topic_tag, video.caption_style_tag].filter(Boolean).join(" · ")}
                </p>
              )}

              {video.performance_summary && (
                <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs italic text-neutral-600">
                  {video.performance_summary}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
