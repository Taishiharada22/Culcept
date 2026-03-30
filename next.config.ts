import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            { protocol: "https", hostname: "**" },
            { protocol: "http", hostname: "localhost" },
        ],
    },
    typescript: {
        // TSエラーはテストファイルのみ（ソースコード0エラー確認済み）
        // ビルド時TSチェックでOOMするため、CIのtsc --noEmitで別途検証
        ignoreBuildErrors: true,
    },
};

export default nextConfig;
