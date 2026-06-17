import { randomBytes } from "node:crypto";

/**
 * Mint a coach invitation code: `<TENANT-SLUG>-<USR>-<HEX>`, e.g. `SRC-TAY-9X3K`.
 *
 * The slug + username prefix are diagnostic (you can tell at a glance which
 * tenant and roughly which coach the code came from); the 4-character hex
 * suffix is the random part — unique per call, but the column has a unique
 * constraint so callers should still retry on collision.
 */
export function mintInvitationCode(slug: string, username: string): string {
  const head = (username || "").slice(0, 3).toUpperCase().padEnd(3, "X");
  const tail = randomBytes(2).toString("hex").toUpperCase();
  return `${slug.toUpperCase()}-${head}-${tail}`;
}
