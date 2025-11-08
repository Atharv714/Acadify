import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Redirect root to dashboard
  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // For simplicity, we'll check for a cookie that would be set after login
  // In a real app, you'd verify the session token with Firebase Admin SDK
  const session = request.cookies.get("session");

  // If the user is not logged in and trying to access a protected route
  if (!session && isProtectedRoute(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Temporarily disable automatic redirects for logged-in users on auth pages
  // to prevent interference with manual navigation
  // if (session && isAuthRoute(request.nextUrl.pathname)) {
  //   console.log("Redirecting to dashboard - logged in user on auth page");
  //   const url = request.nextUrl.clone();
  //   url.pathname = "/dashboard";
  //   return NextResponse.redirect(url);
  // }

  return NextResponse.next();
}

// Add your protected routes here
function isProtectedRoute(pathname: string): boolean {
  const protectedRoutes = ["/dashboard", "/profile", "/create-organization"];

  return protectedRoutes.some((route) => pathname.startsWith(route));
}

// Auth routes that logged-in users shouldn't access
function isAuthRoute(pathname: string): boolean {
  const authRoutes = ["/login", "/signup"];
  return authRoutes.includes(pathname);
}

export const config = {
  matcher: [
    "/", // include root
    "/dashboard/:path*",
    "/profile/:path*",
    "/create-organization/:path*",
    "/login",
    "/signup",
  ],
};
