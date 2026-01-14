const path = require("path");

const plugin = require("next-intl/plugin");
const createNextIntlPlugin = plugin.default ?? plugin;
const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {
        root: path.join(__dirname),
    },
    // ✅ 本番ブラウザでソースマップを配信（原因特定用）
    productionBrowserSourceMaps: true,
};

module.exports = withNextIntl(nextConfig);
