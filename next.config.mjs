/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  async headers() {
    // Position is in the URL, so caches key on it; never cache gated pages by show alone.
    return [{ source: "/s/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] }];
  },
};
