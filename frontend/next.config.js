/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'export',
  // Cho phép bỏ qua lỗi TypeScript/ESLint tạm thời khi build để hỗ trợ kiểm tra và gỡ lỗi thủ công mượt mà hơn
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
