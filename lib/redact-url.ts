/**
 * Drops the query string and fragment from a URL before it leaves the
 * browser or server in analytics or error reports. Search pages carry the
 * user's coordinates (`lat`, `lng`), typed location and OAuth codes in the
 * query string, so only the origin and path are kept.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split(/[?#]/)[0];
  }
}
