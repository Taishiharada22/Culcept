"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function LegalFooter() {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(!!document.querySelector("[data-theme='dark']"));
  }, []);

  // Home page uses fixed full-screen layout — footer would overlap and intercept clicks
  if (pathname === "/") return null;

  return (
    <footer
      className="border-t py-6 text-center"
      style={{
        borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgb(241,245,249)",
        background: isDark ? "#08061a" : undefined,
        marginTop: 0,
      }}
    >
      <div className="flex flex-wrap justify-center gap-4">
        {[
          { href: "/legal/terms", label: "利用規約" },
          { href: "/legal/privacy", label: "プライバシーポリシー" },
          { href: "/legal/commercial", label: "特定商取引法に基づく表記" },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-xs no-underline"
            style={{ color: isDark ? "rgba(255,255,255,0.25)" : "rgb(148,163,184)" }}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <p
        className="mt-2 text-xs"
        style={{ color: isDark ? "rgba(255,255,255,0.15)" : "rgb(203,213,225)" }}
      >
        &copy; 2026 Aneurasync
      </p>
    </footer>
  );
}
