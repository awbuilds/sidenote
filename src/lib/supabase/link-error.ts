/**
 * GoTrue returns expired/invalid link errors in the URL fragment:
 * `#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid…`
 *
 * `parseAuthLinkError` is pure so it can be tested without a DOM;
 * `readAuthLinkError` captures the hash once per page load (the capture keeps
 * the message stable even after the fragment is cleared) and strips it from
 * the address bar so a refresh does not replay it.
 */
export function parseAuthLinkError(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const raw = params.get("error_description") ?? params.get("error");
  if (raw === null || raw === "") return null;
  return raw.replace(/\+/g, " ");
}

let captured: string | null | undefined;

export function readAuthLinkError(): string | null {
  if (captured !== undefined) return captured;
  if (typeof window === "undefined") return null;

  captured = parseAuthLinkError(window.location.hash);
  if (captured !== null) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return captured;
}
