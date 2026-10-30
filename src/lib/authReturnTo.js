// Shared by the auth pages (Login, Register, and any page that resumes a flow
// after sign-in, e.g. the MCP OAuth consent page). Keep the redirect
// validation in one place — it is security-sensitive and easy to drift.

// Resolve ?returnTo= to a safe same-origin path, else "/".
//
// The same-origin check alone is not enough: a value like /.//evil.com or
// /\evil.com parses same-origin but normalizes to a protocol-relative
// //evil.com when assigned to location.href — an open redirect. So require the
// resolved path to be exactly one leading slash (no "//" prefix, no backslash).
export function appPath(path = '/') {
  const configuredBase = import.meta.env.BASE_URL || '/';
  const basePath = configuredBase.endsWith('/') ? configuredBase : `${configuredBase}/`;
  const value = String(path || '/');
  if (value.startsWith(basePath)) return value;
  // the base without its trailing slash ("/glassmeet") is the app root, not a page inside it
  if (`${value}/` === basePath) return basePath;
  return `${basePath}${value.replace(/^\/+/, '')}`;
}

// What to show for a failed auth request: a dropped connection reads "Failed to fetch" otherwise.
export function authErrorMessage(err, fallback) {
  const message = err?.message || '';
  if (!message) return fallback;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return 'Couldn’t reach GlassMeet. Check your connection and try again.';
  }
  // Supabase's wording when an address it won't create an account for is used (a sign-up, or a
  // Google / LinkedIn sign-in for a new email); guests are told plainly instead
  if (err?.code === 'signup_disabled' || /signups? not allowed/i.test(message)) {
    return 'This address is invalid.';
  }
  return message;
}

export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    // Only access_token/clear_access_token are still URL-read by app-params.js, but the
    // whole bootstrap set stays stripped: one going back to a URL read must not silently
    // become injectable again. Normal app-flow params (e.g. the OAuth consent ctx) are kept.
    for (const p of ["access_token", "clear_access_token", "app_id", "app_base_url", "functions_version", "from_url"]) {
      url.searchParams.delete(p);
    }
    const path = url.pathname + url.search;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    return path;
  } catch {
    return "/";
  }
}