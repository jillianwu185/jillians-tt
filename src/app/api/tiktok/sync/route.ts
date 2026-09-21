import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}

async function refreshAccessTokenIfNeeded(
  supabase: SupabaseClient,
  credentials: { id: string; access_token: string; refresh_token: string; expires_at: string }
) {
  const expiresAt = new Date(credentials.expires_at).getTime();
  if (expiresAt - Date.now() > 5 * 60 * 1000) {
    return credentials.access_token;
  }

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: credentials.refresh_token,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? "Failed to refresh TikTok token");
  }

  await supabase
    .from("tiktok_credentials")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", credentials.id);

  return data.access_token;
}

export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}

async function handleSync(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: credentials, error: credentialsError } = await supabase
    .from("tiktok_credentials")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (credentialsError || !credentials) {
    return NextResponse.json({ error: "TikTok not connected" }, { status: 400 });
  }

  const accessToken = await refreshAccessTokenIfNeeded(supabase, credentials);

  const fields = "id,title,view_count,like_count,comment_count,share_count,create_time";
  const videoListResponse = await fetch(
    `https://open.tiktokapis.com/v2/video/list/?fields=${fields}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ max_count: 20 }),
    }
  );
  const videoListData = await videoListResponse.json();
  if (!videoListResponse.ok) {
    return NextResponse.json(
      { error: videoListData.error?.message ?? "Failed to fetch TikTok videos" },
      { status: 502 }
    );
  }

  type TikTokVideo = {
    id: string;
    title: string;
    view_count: number;
    like_count: number;
    comment_count: number;
    share_count: number;
    create_time: number;
  };
  const videos: TikTokVideo[] = videoListData.data?.videos ?? [];

  type RenderWithRecipe = {
    rendered_at: string;
    edit_recipes: { caption_style: string | null; videos: { topic_tag: string | null } | null } | null;
  };
  const { data: renders } = await supabase
    .from("renders")
    .select("rendered_at, edit_recipes(caption_style, videos(topic_tag))")
    .order("rendered_at", { ascending: false });
  const rendersTyped = (renders ?? []) as unknown as RenderWithRecipe[];

  const MATCH_WINDOW_MS = 72 * 60 * 60 * 1000;

  for (const video of videos) {
    const postedAt = new Date(video.create_time * 1000);

    const match = rendersTyped
      .filter((r) => {
        const renderedAt = new Date(r.rendered_at);
        return renderedAt <= postedAt && postedAt.getTime() - renderedAt.getTime() <= MATCH_WINDOW_MS;
      })
      .sort((a, b) => new Date(b.rendered_at).getTime() - new Date(a.rendered_at).getTime())[0];

    await supabase.from("tiktok_videos").upsert(
      {
        tiktok_video_id: video.id,
        posted_at: postedAt.toISOString(),
        views: video.view_count,
        likes: video.like_count,
        comments: video.comment_count,
        shares: video.share_count,
        caption_style_tag: match?.edit_recipes?.caption_style ?? undefined,
        topic_tag: match?.edit_recipes?.videos?.topic_tag ?? undefined,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "tiktok_video_id" }
    );
  }

  return NextResponse.json({ synced: videos.length });
}
