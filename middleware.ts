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
  // Everything is protected except the auth endpoints, the login page,
  // and static assets.
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
