const path = require("path");
const { withSentryConfig } = require("@sentry/nextjs");

const plugin = require("next-intl/plugin");
const createNextIntlPlugin = plugin.default ?? plugin;
const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {
        root: path.join(__dirname),
    },
    images: {
        qualities: [75, 90, 95],
        remotePatterns: [
            { protocol: "https", hostname: "**" },
            { protocol: "http", hostname: "localhost" },
        ],
    },
    productionBrowserSourceMaps: false,

    serverExternalPackages: [
        "three",
        "@react-three/fiber",
        "@react-three/drei",
    ],

    outputFileTracingExcludes: {
        "*": ["./public/cards/**/*"],
    },

    experimental: {
        serverActions: {
            // 画像をServer Actionで受けるなら必要（デフォは 1MB）
            bodySizeLimit: "100mb",
        },
    },
};

module.exports = withSentryConfig(withNextIntl(nextConfig), {
    // ソースマップをSentryにアップロード（本番ビルド時のみ）
    silent: true,
    // DSN未設定時はスキップ
    disableServerWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
    disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
    // バンドルサイズ最適化: tree-shake unused Sentry features
    widenClientFileUpload: true,
    hideSourceMaps: true,
    tunnelRoute: "/monitoring",
});
