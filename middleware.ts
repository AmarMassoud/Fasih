import { NextResponse } from "next/server";
import { auth, authEnabled } from "@/auth";

const gate = auth((req) => {
  if (req.auth?.user) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/login")) return NextResponse.next();
  const login = new URL("/login", req.nextUrl);
  return NextResponse.redirect(login);
});

export default authEnabled ? gate : () => NextResponse.next();

export const config = {
  // Only the tool itself and its APIs are gated - the landing and info
  // pages are public.
  matcher: ["/app/:path*", "/api/voice", "/api/tts", "/api/convert"],
};
