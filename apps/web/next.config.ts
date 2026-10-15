import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  logging: {
    fetches: { fullUrl: false },
    incomingRequests: {
      ignore: [/\/api\/integrations\/meta\/callback/],
    },
  },
};

export default nextConfig;
