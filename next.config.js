/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.sansad.in' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
