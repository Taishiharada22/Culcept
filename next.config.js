const path = require("path");

// CJS/ESMどっちの形で来ても動くように吸収
const plugin = require("next-intl/plugin");
const createNextIntlPlugin = plugin.default ?? plugin;

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    turbopack: {
        root: path.join(__dirname),
    },
};

module.exports = withNextIntl(nextConfig);
