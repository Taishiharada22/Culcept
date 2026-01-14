module.exports = [
"[project]/app/layout.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// app/layout.tsx
__turbopack_context__.s([
    "default",
    ()=>RootLayout,
    "metadata",
    ()=>metadata
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
;
;
// ここは「絶対に valid URL」にする（空文字/不正でも落とさない）
function getSiteUrl() {
    const raw = (("TURBOPACK compile-time value", "") ?? "").trim() || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") || "http://localhost:3000";
    try {
        // raw が "culcept.com" みたいに scheme無しでも救う
        if (!/^https?:\/\//i.test(raw)) return new URL(`https://${raw}`);
        return new URL(raw);
    } catch  {
        return new URL("http://localhost:3000");
    }
}
const metadata = {
    metadataBase: getSiteUrl(),
    title: {
        default: "Culcept",
        template: "%s | Culcept"
    },
    description: "Culcept",
    openGraph: {
        title: "Culcept",
        description: "Culcept",
        siteName: "Culcept",
        type: "website"
    }
};
function RootLayout({ children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("html", {
        lang: "ja",
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])("body", {
            children: children
        }, void 0, false, {
            fileName: "[project]/app/layout.tsx",
            lineNumber: 39,
            columnNumber: 13
        }, this)
    }, void 0, false, {
        fileName: "[project]/app/layout.tsx",
        lineNumber: 38,
        columnNumber: 9
    }, this);
}
}),
];

//# sourceMappingURL=app_layout_tsx_271801d7._.js.map