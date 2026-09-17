import { cookies } from "next/headers";
import Link from "next/link";

type TikTokVideo = {
  id: string;
  title: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  create_time: number;
};

async function getVideos(accessToken: string): Promise<TikTokVideo[]> {
  const fields = "id,title,view_count,like_count,comment_count,share_count,create_time";
  const res = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${fields}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ max_count: 20 }),
    cache: "no-store",
  });
  const data = await res.json();
  return data?.data?.videos ?? [];
}

export default async function InsightsPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("tiktok_access_token")?.value;

  if (!accessToken) {
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

  const videos = await getVideos(accessToken);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-6 text-2xl font-semibold">Insights</h1>
      {videos.length === 0 ? (
        <p className="text-neutral-600">No videos found on this account yet.</p>
      ) : (
        <ul className="space-y-4">
          {videos.map((video) => (
            <li key={video.id} className="rounded-lg border border-neutral-200 p-4">
              <p className="mb-2 font-medium">{video.title || "(untitled)"}</p>
              <p className="text-sm text-neutral-600">
                {video.view_count} views · {video.like_count} likes · {video.comment_count} comments ·{" "}
                {video.share_count} shares
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link href="/" className="mt-8 inline-block text-sm underline">
        Back home
      </Link>
    </main>
  );
}
