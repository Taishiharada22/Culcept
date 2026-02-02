// app/components/ui/badge.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-extrabold text-zinc-900",
                className
            )}
            {...props}
        />
    );
}
