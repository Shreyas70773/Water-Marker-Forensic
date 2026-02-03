import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/auth/sign-in(.*)",
  "/auth/sign-up(.*)",
  "/detect",
  "/api/detect(.*)",
  "/api/detect-video(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // For public routes, allow access
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // For protected routes, check authentication
  const { userId } = await auth();
  
  if (!userId) {
    const signInUrl = new URL("/auth/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
