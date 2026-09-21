import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.from("fonts").select("*").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fonts: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { google_font_family, display_name } = await request.json();
  if (!google_font_family) {
    return NextResponse.json({ error: "google_font_family is required" }, { status: 400 });
  }

  // Verify the font actually exists on Google Fonts before saving it.
  const checkResponse = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(google_font_family)}&display=swap`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  if (!checkResponse.ok) {
    return NextResponse.json(
      { error: `"${google_font_family}" doesn't look like a valid Google Font name` },
      { status: 400 }
    );
  }

  const key = slugify(google_font_family);
  const { data, error } = await supabase
    .from("fonts")
    .insert({
      key,
      display_name: display_name ?? google_font_family,
      google_font_family,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ font: data });
}
