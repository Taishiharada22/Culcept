"use client";

import dynamic from "next/dynamic";

// 動的インポートでクライアントサイドのみで実行
const ServiceWorkerRegistration = dynamic(
    () => import("./ServiceWorkerRegistration"),
    { ssr: false }
);

const InstallPrompt = dynamic(
    () => import("./InstallPrompt"),
    { ssr: false }
);

export function PWAProvider({ children }: { children: React.ReactNode }) {
    return (
        <>
            <ServiceWorkerRegistration />
            {children}
            <InstallPrompt />
        </>
    );
}

export { ServiceWorkerRegistration, InstallPrompt };
