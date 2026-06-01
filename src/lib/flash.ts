/**
 * Build a redirect URL carrying a one-off "flash" message. The global
 * <Toaster> reads `?flash=…`, shows a toast, then strips the param.
 *
 * Usage in a server action:
 *   redirect(flashUrl(`/classes/${id}`, "Workout added"));
 */
export function flashUrl(path: string, message: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}flash=${encodeURIComponent(message)}`;
}
