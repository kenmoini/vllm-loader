import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnLoginPage = req.nextUrl.pathname === "/login";
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");

  // Allow auth routes
  if (isAuthRoute) {
    return;
  }

  // Redirect logged-in users away from login page
  if (isOnLoginPage && isLoggedIn) {
    return Response.redirect(new URL("/", req.nextUrl));
  }

  // Allow login page
  if (isOnLoginPage) {
    return;
  }

  // Protect API routes
  if (isApiRoute && !isLoggedIn) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Protect all other routes
  if (!isLoggedIn) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
