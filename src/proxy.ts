import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/terms", "/privacy", "/auth/confirm"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/" ||
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    // Every API route already checks auth itself (session cookie or, for
    // crons/webhooks like /api/tiktok/sync, a bearer secret) and returns a
    // proper 401 JSON response. Gating them here too meant an unauthenticated
    // caller with no session cookie — e.g. Vercel Cron — got redirected to
    // /login (a 307 HTML redirect) before ever reaching that check, silently
    // breaking the daily TikTok sync cron for over a week.
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.match(/\.(?:svg|png|jpg|jpeg|txt|ico)$/)
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
