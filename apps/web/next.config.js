/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@veridion/ui',
    '@veridion/shared',
    '@veridion/sdk',
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  experimental: {
    typedRoutes: false,
  },
};

module.exports = nextConfig;
