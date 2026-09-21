import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const dateRangeStart = formData.get("date_range_start") as string | null;
  const dateRangeEnd = formData.get("date_range_end") as string | null;

  if (!file || !dateRangeStart || !dateRangeEnd) {
    return NextResponse.json(
      { error: "file, date_range_start, and date_range_end are required" },
      { status: 400 }
    );
  }

  const csvText = await file.text();
  let rows: Record<string, string>[];
  try {
    rows = parse(csvText, { columns: true, skip_empty_lines: true });
  } catch {
    return NextResponse.json({ error: "Could not parse CSV file" }, { status: 400 });
  }

  const { error: insertError } = await supabase.from("tiktok_studio_imports").insert({
    date_range_start: dateRangeStart,
    date_range_end: dateRangeEnd,
    raw_csv_data: rows,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ rows: rows.length });
}
