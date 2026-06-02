import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to THIS directory. Without this, Turbopack walks up
  // and picks the parent checkout (/Users/peterzhang/SXC) as the root because
  // it also has a package-lock.json — making the dev server straddle two
  // directories. `import.meta.dirname` stays correct in every worktree.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
