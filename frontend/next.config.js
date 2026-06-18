/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'export',
  // Ẩn Next.js dev indicator (chữ "N" góc dưới màn hình) khi chạy dev server
  devIndicators: false,
  // Cho phép cross-origin request từ Cloudflare tunnel (*.trycloudflare.com)
  allowedDevOrigins: ['*.trycloudflare.com'],
  // Cho phép bỏ qua lỗi TypeScript/ESLint tạm thời khi build để hỗ trợ kiểm tra và gỡ lỗi thủ công mượt mà hơn
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
