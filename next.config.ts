import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Experimental features
  experimental: {
    // Optimize server component imports
    optimizePackageImports: ['@anthropic-ai/sdk', 'openai']
  },

  // Environment variables that should be available on the client
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL
  }
};

export default nextConfig;
