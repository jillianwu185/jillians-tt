import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { STYLE_KIT } from "@/lib/style-kit";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildTool(fontKeys: string[]) {
  return {
    name: "update_edit_recipe",
    description: "Apply the user's requested changes to the video edit recipe.",
    input_schema: {
      type: "object" as const,
      properties: {
        mood: { type: "string", description: "Overall mood/tone, e.g. 'light and fun'." },
        caption_style: {
          type: "string",
          enum: ["two_layer_headline", "karaoke_reveal", "static_block"],
        },
        caption_font: { type: "string", enum: fontKeys, description: "Font used for all captions." },
        accent_color: {
          type: "string",
          description: "Hex color. Prefer one of the Style Kit colors unless the user asks for something else.",
        },
        new_emphasis_moments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              word: {
                type: "string",
                description: "The exact word from the transcript to emphasize (must match a transcript word).",
              },
              treatment: {
                type: "string",
                enum: ["punch_in_zoom", "keyword_callout", "both"],
              },
              zoomLevel: { type: "number", description: "Zoom scale, e.g. 1.18 for a subtle punch-in, 1.4 for a strong one. Defaults to 1.18." },
              calloutText: { type: "string", description: "Defaults to the word itself if omitted." },
              calloutFont: { type: "string", enum: fontKeys },
              calloutColor: { type: "string", description: "Hex color, defaults to Style Kit yellow." },
            },
            required: ["word", "treatment"],
          },
        },
        reasoning: {
          type: "string",
          description: "One or two sentences explaining what changed, shown to the user.",
        },
      },
    },
  };
}

export async function POST(request: NextRequest) {
  const { video_id, prompt } = await request.json();
  if (!video_id || !prompt) {
    return NextResponse.json({ error: "video_id and prompt are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: recipe, error: recipeError } = await supabase
    .from("edit_recipes")
    .select("*")
    .eq("video_id", video_id)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (recipeError || !recipe) {
    return NextResponse.json({ error: "No edit recipe found" }, { status: 404 });
  }

  const { data: transcript, error: transcriptError } = await supabase
    .from("transcripts")
    .select("words")
    .eq("video_id", video_id)
    .single();
  if (transcriptError || !transcript) {
    return NextResponse.json({ error: "No transcript found" }, { status: 404 });
  }

  const { data: fontRows } = await supabase.from("fonts").select("key, display_name");
  const fontKeys = (fontRows ?? []).map((f) => f.key);
  const fontDescriptions = (fontRows ?? []).map((f) => `${f.key} (${f.display_name})`).join(", ");

  const transcriptText = (transcript.words as { word: string; start: number }[])
    .map((w) => `${w.word}(${w.start.toFixed(2)}s)`)
    .join(" ");

  const currentFontMap = (recipe.font_map ?? {}) as Record<string, string>;

  const systemPrompt = `You are editing a short TikTok video for a single creator using a fixed brand Style Kit.

Style Kit colors: ${JSON.stringify(STYLE_KIT.colors)}
Caption styles available: two_layer_headline, karaoke_reveal, static_block
Fonts available: ${fontDescriptions}

Current recipe: mood=${recipe.mood ?? "none"}, caption_style=${recipe.caption_style ?? "none"}, caption_font=${currentFontMap.caption ?? "airy"}, accent_color=${recipe.accent_color ?? "none"}
Existing emphasis moments: ${JSON.stringify(recipe.emphasis_moments ?? [])}

Full transcript with word timestamps: ${transcriptText}

The user will give you an instruction to update the edit. Use the update_edit_recipe tool to describe the changes. Only include fields that should change. For new_emphasis_moments, "word" must exactly match a word from the transcript above (case-insensitive is fine, but use the transcript's spelling).`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
    tools: [buildTool(fontKeys)],
    tool_choice: { type: "tool", name: "update_edit_recipe" },
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json({ error: "Model did not return a valid update" }, { status: 502 });
  }

  const patch = toolUse.input as {
    mood?: string;
    caption_style?: string;
    caption_font?: string;
    accent_color?: string;
    new_emphasis_moments?: {
      word: string;
      treatment: "punch_in_zoom" | "keyword_callout" | "both";
      zoomLevel?: number;
      calloutText?: string;
      calloutFont?: string;
      calloutColor?: string;
    }[];
    reasoning?: string;
  };

  const words = transcript.words as { word: string; start: number; end: number }[];
  const newMoments = (patch.new_emphasis_moments ?? []).map((m) => {
    const match = words.find(
      (w) => w.word.trim().toLowerCase().replace(/[.,!?]/g, "") === m.word.trim().toLowerCase()
    );
    return {
      word: m.word,
      start: match?.start ?? 0,
      end: match?.end ?? 0,
      treatment: m.treatment,
      source: "prompt" as const,
      approved: true,
      zoomLevel: m.zoomLevel ?? 1.18,
      calloutText: m.calloutText ?? m.word.toUpperCase(),
      calloutFont: m.calloutFont ?? "airy",
      calloutColor: m.calloutColor ?? STYLE_KIT.colors.yellow,
    };
  });

  const updatedRecipe = {
    video_id,
    prompt_history: [
      ...(recipe.prompt_history ?? []),
      { prompt, response: patch.reasoning ?? "", created_at: new Date().toISOString() },
    ],
    mood: patch.mood ?? recipe.mood,
    caption_style: patch.caption_style ?? recipe.caption_style,
    font_map: { ...currentFontMap, caption: patch.caption_font ?? currentFontMap.caption ?? "airy" },
    cuts: recipe.cuts,
    captions: recipe.captions,
    emphasis_moments: [...(recipe.emphasis_moments ?? []), ...newMoments],
    accent_color: patch.accent_color ?? recipe.accent_color,
    version: recipe.version + 1,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("edit_recipes")
    .insert(updatedRecipe)
    .select()
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ recipe: inserted, reasoning: patch.reasoning });
}
