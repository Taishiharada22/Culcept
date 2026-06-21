const path = require("path");
const { withSentryConfig } = require("@sentry/nextjs");

const plugin = require("next-intl/plugin");
const createNextIntlPlugin = plugin.default ?? plugin;
const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {
        // worktree では node_modules が main dir にあるため TURBOPACK_ROOT で上書き可能
        root: process.env.TURBOPACK_ROOT ?? path.join(__dirname),
    },
    images: {
        qualities: [75, 90, 95],
        remotePatterns: [
            // Supabase Storage — ユーザーアップロード画像（アバター、商品、ショップ等）
            {
                protocol: "https",
                hostname: "aljavfujeqcwnqryjmhl.supabase.co",
                pathname: "/storage/v1/object/public/**",
            },
            // QR コード生成 API
            { protocol: "https", hostname: "api.qrserver.com" },
            // ローカル開発
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

    typescript: {
        // TSエラーはテストファイルのみ（ソースコード0エラー確認済み）
        // ビルド時TSチェックでOOMするため、CIのtsc --noEmitで別途検証
        ignoreBuildErrors: true,
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
