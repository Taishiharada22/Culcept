// app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: ["/", "/drops", "/drops/"],
                disallow: ["/admin", "/admin/", "/drops/new", "/drops/*/edit"],
            },
        ],
        sitemap: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") + "/sitemap.xml",
    };
}
