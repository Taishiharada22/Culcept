import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            className={cn(
                "h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none ring-offset-white placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-900",
                className
            )}
            {...props}
        />
    );
}
