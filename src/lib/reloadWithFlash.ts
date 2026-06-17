/**
 * Force a full-page reload while carrying a one-off success message through
 * the URL. The global `<Toaster>` picks up `?flash=…` and shows it.
 *
 * Why a full reload at all: inside iOS WeChat's WKWebView (the dominant
 * browser for our China users), `router.refresh()`'s RSC payload sometimes
 * serves a cached version, so a just-saved meal/water/weight row wouldn't
 * appear in the list until the user pulled to refresh. A hard navigation
 * guarantees the page reflects the saved data.
 */
export function reloadWithFlash(message: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("flash", message);
  // Keep the hash (e.g. `#meal`) so the user lands on the right section.
  window.location.href = url.toString();
}
