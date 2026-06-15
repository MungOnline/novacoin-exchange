/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    // In production (Vercel), BACKEND_URL must be set to your Render backend URL
    // e.g., https://novacoin-backend.onrender.com
    // In local dev, it defaults to http://localhost:5000
    const apiUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
      {
        // Proxy uploads (slip images, QR codes) to the backend
        source: '/uploads/:path*',
        destination: `${apiUrl}/uploads/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
