import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: [
      'instagramimagesbucket.s3.amazonaws.com',
      'instagramimagesbucket.s3.us-east-2.amazonaws.com',
    ],
  }
};

export default nextConfig;
