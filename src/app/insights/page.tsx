import { createClient } from "@/lib/supabase/server";
import SyncButton from "@/app/insights/SyncButton";
import ImportForm from "@/app/insights/ImportForm";

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
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="mb-4 text-2xl font-semibold">Insights</h1>
        <p className="mb-6 text-neutral-600">Connect your TikTok account to see your video performance.</p>
        <a
          href="/api/auth/tiktok/authorize"
          className="inline-block rounded-md bg-black px-5 py-2.5 text-white"
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
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Insights</h1>
        <SyncButton />
      </div>

      {(!videos || videos.length === 0) && (
        <p className="text-neutral-600">
          No synced videos yet — click &quot;Sync now&quot; to pull your TikTok data.
        </p>
      )}

      {videos && videos.length > 0 && (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-medium">Top performing</h2>
            <VideoList videos={topVideos} />
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-lg font-medium">Bottom performing</h2>
            <VideoList videos={bottomVideos} />
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-lg font-medium">All videos ({videos.length})</h2>
            <VideoList videos={sortedByViews} />
          </section>
        </>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Studio analytics import</h2>
        <p className="mb-3 text-sm text-neutral-600">
          TikTok Studio → Analytics → Download data. Upload the CSV here (watch time %,
          retention, traffic source aren&apos;t available via the API).
        </p>
        <ImportForm />
        {latestImport && (
          <p className="mt-3 text-sm text-neutral-500">
            Last import: {latestImport.date_range_start} to {latestImport.date_range_end} (
            {(latestImport.raw_csv_data as unknown[]).length} rows)
          </p>
        )}
      </section>
    </main>
  );
}

type TikTokVideoRow = {
  id: string;
  tiktok_video_id: string;
  posted_at: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  topic_tag: string | null;
  caption_style_tag: string | null;
};

function VideoList({ videos }: { videos: TikTokVideoRow[] }) {
  return (
    <ul className="space-y-3">
      {videos.map((video) => (
        <li key={video.id} className="rounded-lg border border-neutral-200 p-4 text-sm">
          <p className="mb-1 text-neutral-500">
            {video.posted_at ? new Date(video.posted_at).toLocaleDateString() : "unknown date"}
          </p>
          <p className="text-neutral-700">
            {video.views.toLocaleString()} views · {video.likes.toLocaleString()} likes ·{" "}
            {video.comments.toLocaleString()} comments · {video.shares.toLocaleString()} shares
          </p>
        </li>
      ))}
    </ul>
  );
}
