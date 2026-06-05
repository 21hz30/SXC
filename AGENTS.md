<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Mobile / H5 — every page must be responsive

Every page must work on a phone (H5), not just desktop. Whenever you create or
change a page, do a quick mobile pass before you're done:

- Use responsive padding/containers — `p-4 sm:p-6 lg:p-8`, not a bare `p-8`.
- Multi-column grids must collapse on small screens: start at `grid-cols-1` and
  add `sm:`/`lg:` columns. Never ship a plain `grid-cols-2/3/4` (it crushes on
  phones).
- Wide or fixed layouts (tables, the calendar time grids, multi-column
  dashboards, side-by-side headers) need a mobile plan: stack, wrap, or
  horizontal-scroll with a `min-w-[…]`.
- The left sidebar is desktop-only (`hidden md:flex`); phones navigate via
  `src/components/MobileNav.tsx` (top bar + ☰ drawer). Keep that working.
- Verify at a 375px-wide viewport.

Desktop styling must stay untouched — express the mobile rules as the base, with
larger-breakpoint (`sm:`/`md:`/`lg:`) overrides for desktop.
