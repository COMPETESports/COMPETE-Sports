/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // A flyer is downscaled to 1568px before upload, which usually lands
  // around 300-600KB once base64-encoded. A dense one can approach the 1MB
  // default and fail with an unhelpful error, so give it room.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};
export default nextConfig;
