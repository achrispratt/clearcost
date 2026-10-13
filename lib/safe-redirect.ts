/**
 * Restrict post-login redirects to same-origin paths. Rejects absolute URLs,
 * protocol-relative "//evil.com", backslash tricks, and "@evil.com" (which
 * becomes userinfo when appended to an origin).
 */
export function safeNextPath(next: string | null | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\")
  ) {
    return "/";
  }
  return next;
}
