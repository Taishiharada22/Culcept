"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LightBackground } from "@/components/ui/glassmorphism-design";

export type AuctionSaleMode = "fixed" | "auction";

const AuctionModePageContext = React.createContext<{
    saleMode: AuctionSaleMode;
    setSaleMode: React.Dispatch<React.SetStateAction<AuctionSaleMode>>;
} | null>(null);

const BID_BAR_HEIGHTS = [28, 42, 58, 76];

function RisingBidBars() {
    return (
        <div className="absolute bottom-8 left-4 flex items-end gap-1.5 sm:bottom-10 sm:left-[6%]">
            {BID_BAR_HEIGHTS.map((height, index) => (
                <motion.span
                    key={`auction-bid-bar-${height}`}
                    className="block w-1.5 rounded-full bg-gradient-to-t from-indigo-500/75 via-violet-400/85 to-fuchsia-200/95 shadow-[0_0_14px_rgba(167,139,250,0.38)]"
                    animate={{
                        height: [16 + index * 2, height, 18 + index * 2],
                        opacity: [0.42, 0.92, 0.48],
                    }}
                    transition={{
                        duration: 1.3 + index * 0.22,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: index * 0.12,
                    }}
                />
            ))}
        </div>
    );
}

function HammerPriceAccent() {
    return (
        <div className="absolute right-4 top-20 sm:right-[8%] sm:top-16">
            <div className="relative h-24 w-24 sm:h-28 sm:w-28">
                <motion.div
                    className="absolute left-1/2 top-1 h-12 w-2 -translate-x-1/2 rounded-full bg-violet-100/80 shadow-[0_0_20px_rgba(196,181,253,0.35)]"
                    animate={{ y: [-2, 18, -2], opacity: [0.5, 0.95, 0.5] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute left-1/2 top-0 h-4 w-14 -translate-x-1/2 rounded-md border border-violet-100/90 bg-gradient-to-r from-violet-200/95 to-indigo-200/90 shadow-[0_8px_28px_-16px_rgba(76,29,149,0.85)]"
                    animate={{ y: [0, 16, 0], rotate: [-18, -6, -18] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="absolute bottom-3 left-1/2 h-2 w-16 -translate-x-1/2 rounded-full bg-white/40 shadow-[0_0_16px_rgba(196,181,253,0.5)]" />
                <motion.span
                    className="absolute bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-violet-100/90"
                    animate={{ scale: [0.5, 2.3], opacity: [0, 0.62, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", times: [0, 0.45, 1] }}
                />
                <motion.span
                    className="absolute bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-fuchsia-100/80"
                    animate={{ scale: [0.4, 2.8], opacity: [0, 0.5, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.2, times: [0, 0.45, 1] }}
                />
            </div>
        </div>
    );
}

function AuctionModeBackdrop({ active }: { active: boolean }) {
    return (
        <AnimatePresence>
            {active ? (
                <motion.div
                    key="auction-mode-backdrop"
                    className="pointer-events-none fixed inset-0 -z-10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                >
                    <div
                        className="absolute inset-0"
                        style={{
                            background:
                                "radial-gradient(circle at 14% 12%, rgba(192,132,252,0.42), transparent 42%), radial-gradient(circle at 82% 82%, rgba(99,102,241,0.34), transparent 46%), linear-gradient(135deg, rgba(46,16,101,0.42), rgba(76,29,149,0.34) 42%, rgba(91,33,182,0.26))",
                        }}
                    />
                    <motion.div
                        className="absolute inset-0"
                        style={{
                            background:
                                "radial-gradient(circle at 48% 20%, rgba(255,255,255,0.28), transparent 52%), radial-gradient(circle at 56% 74%, rgba(216,180,254,0.14), transparent 48%)",
                        }}
                        animate={{ opacity: [0.35, 0.62, 0.35] }}
                        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute inset-0"
                        style={{
                            background: "linear-gradient(120deg, transparent 0%, rgba(216,180,254,0.12) 40%, transparent 72%)",
                        }}
                        animate={{ x: ["-35%", "32%", "-35%"] }}
                        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute -top-24 right-[-80px] h-[320px] w-[320px] rounded-full bg-violet-500/35 blur-3xl"
                        animate={{ scale: [0.95, 1.08, 0.95], opacity: [0.35, 0.55, 0.35] }}
                        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <motion.div
                        className="absolute bottom-[-120px] left-[-80px] h-[340px] w-[340px] rounded-full bg-indigo-500/30 blur-3xl"
                        animate={{ scale: [1.05, 0.92, 1.05], opacity: [0.3, 0.5, 0.3] }}
                        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut", delay: 0.35 }}
                    />
                    <RisingBidBars />
                    <HammerPriceAccent />
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}

export function AuctionModePageShell({
    children,
    initialSaleMode = "fixed",
    saleMode: controlledSaleMode,
}: {
    children: React.ReactNode;
    initialSaleMode?: AuctionSaleMode;
    saleMode?: AuctionSaleMode;
}) {
    const [internalSaleMode, setInternalSaleMode] = React.useState<AuctionSaleMode>(initialSaleMode);
    const saleMode = controlledSaleMode ?? internalSaleMode;

    return (
        <AuctionModePageContext.Provider value={{ saleMode, setSaleMode: setInternalSaleMode }}>
            <LightBackground>
                <AuctionModeBackdrop active={saleMode === "auction"} />
                {children}
            </LightBackground>
        </AuctionModePageContext.Provider>
    );
}

export function useAuctionModePage() {
    const context = React.useContext(AuctionModePageContext);
    if (!context) {
        throw new Error("useAuctionModePage must be used within AuctionModePageShell");
    }
    return context;
}
