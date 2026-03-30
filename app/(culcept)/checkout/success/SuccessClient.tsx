// app/checkout/success/SuccessClient.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SuccessClient() {
    const router = useRouter();

    useEffect(() => {
        let n = 0;
        const t = setInterval(() => {
            n += 1;
            router.refresh(); // サーバーで orders の status を再取得
            if (n >= 10) clearInterval(t);
        }, 1500);

        return () => clearInterval(t);
    }, [router]);

    return null;
}
