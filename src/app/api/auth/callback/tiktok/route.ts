import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("tiktok_oauth_state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(new URL("/?error=oauth_state_mismatch", request.url));
  }

  const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.TIKTOK_REDIRECT_URI!,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(tokenData.error_description ?? "token_exchange_failed")}`, request.url)
    );
  }

  const response = NextResponse.redirect(new URL("/insights", request.url));
  response.cookies.set("tiktok_access_token", tokenData.access_token, {
    httpOnly: true,
    maxAge: tokenData.expires_in ?? 86400,
    path: "/",
  });
  response.cookies.delete("tiktok_oauth_state");
  return response;
}
