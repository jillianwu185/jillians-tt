import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const { messages } = await request.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: videos } = await supabase
    .from("tiktok_videos")
    .select("posted_at, views, likes, comments, shares, caption_style_tag, topic_tag")
    .order("posted_at", { ascending: false })
    .limit(50);

  const { data: recipes } = await supabase
    .from("edit_recipes")
    .select("mood, caption_style, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const hasEnoughData = (videos?.length ?? 0) >= 5;

  const systemPrompt = `You are a brainstorming partner for a single TikTok creator, helping generate video topic ideas.

Rules:
- Every suggestion must be traceable to a real pattern in the data provided below once there is enough data (5+ synced videos). If there isn't enough data yet, say so plainly and do NOT fabricate a pattern — you can still brainstorm generic ideas, just be explicit that they aren't backed by her own performance data yet.
- Keep responses conversational and concise.

Has enough data: ${hasEnoughData}

TikTok video performance (most recent first): ${JSON.stringify(videos ?? [])}

Recent edit recipes (mood/caption style used in the app): ${JSON.stringify(recipes ?? [])}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find((c) => c.type === "text");
  const reply = textBlock && textBlock.type === "text" ? textBlock.text : "";

  return NextResponse.json({ reply });
}
