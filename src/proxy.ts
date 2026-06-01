import { NextResponse, type NextRequest } from "next/server";
import { decodeToken, SESSION_COOKIE } from "@/lib/auth";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/_next") || pathname.startsWith("/uploads")) {
    return NextResponse.next();
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!decodeToken(token)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
