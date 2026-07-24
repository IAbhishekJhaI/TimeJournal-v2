import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 uses `proxy.ts` (the former `middleware.ts`). clerkMiddleware()
// makes Clerk's auth state available everywhere; it protects nothing by
// default — route guards live in the (app) layout and the API's requireUser().
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals and static files, but run on everything else…
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // …and always run on API routes.
    "/(api|trpc)(.*)",
  ],
};
