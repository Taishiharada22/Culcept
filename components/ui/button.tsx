import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-zinc-900 text-white hover:bg-zinc-800",
                outline: "border border-zinc-200 bg-white hover:bg-zinc-50",
                ghost: "hover:bg-zinc-100",
                destructive: "bg-red-600 text-white hover:bg-red-500",
            },
            size: {
                default: "h-10 px-4",
                sm: "h-9 px-3",
                lg: "h-11 px-5",
            },
        },
        defaultVariants: { variant: "default", size: "default" },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
    const Comp: any = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
