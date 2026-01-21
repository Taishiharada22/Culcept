const path = require("path");

const plugin = require("next-intl/plugin");
const createNextIntlPlugin = plugin.default ?? plugin;
const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {
        root: path.join(__dirname),
    },
    productionBrowserSourceMaps: true,

    experimental: {
        serverActions: {
            // 画像をServer Actionで受けるなら必要（デフォは 1MB）
            bodySizeLimit: "100mb",
        },
    },
};

module.exports = withNextIntl(nextConfig);
