/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    const apiTarget =
      process.env.API_PROXY_TARGET ||
      process.env.API_SERVER_URL ||
      'http://localhost:3000';

    return [
      {
        source: '/api/:path*',
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
