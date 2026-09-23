import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { storagePath } = await request.json();
  if (!storagePath) {
    return NextResponse.json({ error: "storagePath is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: imageBlob, error: downloadError } = await supabase.storage
    .from("overlay-images")
    .download(storagePath);
  if (downloadError || !imageBlob) {
    return NextResponse.json({ error: "Could not download image" }, { status: 500 });
  }

  const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

  const removeBgForm = new FormData();
  removeBgForm.append("image_file", new Blob([imageBuffer]), "image.png");
  removeBgForm.append("size", "auto");

  const removeBgResponse = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": process.env.REMOVE_BG_API_KEY! },
    body: removeBgForm,
  });

  if (!removeBgResponse.ok) {
    const errText = await removeBgResponse.text();
    return NextResponse.json({ error: `remove.bg error: ${errText}` }, { status: 502 });
  }

  const resultBuffer = Buffer.from(await removeBgResponse.arrayBuffer());
  const newStoragePath = `${storagePath}-nobg.png`;

  const { error: uploadError } = await supabase.storage
    .from("overlay-images")
    .upload(newStoragePath, resultBuffer, { contentType: "image/png" });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("overlay-images")
    .createSignedUrl(newStoragePath, 3600);
  if (signError || !signed) {
    return NextResponse.json({ error: "Could not sign the new image URL" }, { status: 500 });
  }

  return NextResponse.json({ storagePath: newStoragePath, previewUrl: signed.signedUrl });
}
