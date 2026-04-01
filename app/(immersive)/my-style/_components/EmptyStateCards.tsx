"use client";

import React from "react";
import { motion } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

interface EmptyStateProps {
    onAction: () => void;
    onDemo?: () => void;
}

const hiddenStyle = { opacity: 0, scale: 0.97, y: 12 };
const visibleStyle = { opacity: 1, scale: 1, y: 0 };

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={hiddenStyle}
            animate={visibleStyle}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex items-center justify-center py-10 px-4"
        >
            <div className="max-w-sm w-full space-y-5 text-center">
                {children}
            </div>
        </motion.div>
    );
}

function FuturePreview({ items }: { items: string[] }) {
    return (
        <ul className="mx-auto max-w-xs space-y-1.5 text-left">
            {items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    {item}
                </li>
            ))}
        </ul>
    );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full rounded-xl bg-slate-900 py-3 text-[13px] font-bold text-white transition hover:bg-slate-800"
        >
            {label}
        </button>
    );
}

function DemoLink({ onDemo }: { onDemo?: () => void }) {
    if (!onDemo) return null;
    return (
        <button
            onClick={onDemo}
            className="text-[12px] text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2 decoration-slate-300"
        >
            デモデータで体験
        </button>
    );
}

/* ------------------------------------------------------------------ */
/*  Wardrobe empty state                                              */
/* ------------------------------------------------------------------ */

export function WardrobeEmptyState({ onAction, onDemo }: EmptyStateProps) {
    return (
        <Shell>
            <h3 className="text-[17px] font-black text-slate-900">
                最初の一着で、何が始まる？
            </h3>
            <FuturePreview items={[
                "色と素材の傾向が自動で浮かぶ",
                "天気に合わせたコーデ提案が始まる",
                "着回しの法則が見えてくる",
            ]} />
            <ActionButton label="アイテムを追加" onClick={onAction} />
            <DemoLink onDemo={onDemo} />
        </Shell>
    );
}

/* ------------------------------------------------------------------ */
/*  Setups empty state                                                */
/* ------------------------------------------------------------------ */

export function SetupsEmptyState({ onAction, onDemo }: EmptyStateProps) {
    return (
        <Shell>
            <h3 className="text-[17px] font-black text-slate-900">
                どう組み合わせると、自分らしくなる？
            </h3>
            <FuturePreview items={[
                "手持ちの服で配色スコアを確認",
                "フラットレイで並べて比較できる",
                "気分 × 印象でセットを記録",
            ]} />
            <ActionButton label="まず持ち物を登録" onClick={onAction} />
            <DemoLink onDemo={onDemo} />
        </Shell>
    );
}

/* ------------------------------------------------------------------ */
/*  Styles empty state                                                */
/* ------------------------------------------------------------------ */

export function StylesEmptyState({ onAction, onDemo }: EmptyStateProps) {
    return (
        <Shell>
            <h3 className="text-[17px] font-black text-slate-900">
                あなたのスタイル言語を発見する
            </h3>
            <FuturePreview items={[
                "スワイプで好みを学習",
                "自分だけのスタイル軸が浮かぶ",
                "惹かれる世界観が言語化される",
            ]} />
            <ActionButton label="スワイプ学習を始める" onClick={onAction} />
            <DemoLink onDemo={onDemo} />
        </Shell>
    );
}

/* ------------------------------------------------------------------ */
/*  Identity empty state                                              */
/* ------------------------------------------------------------------ */

export function IdentityEmptyState({ onAction, onDemo }: EmptyStateProps) {
    return (
        <Shell>
            <h3 className="text-[17px] font-black text-slate-900">
                12軸のスタイルDNAが待っている
            </h3>
            <FuturePreview items={[
                "深層スタイル傾向を12軸で可視化",
                "内面と外見の関係性が見える",
                "5着以上 + スワイプ学習で解放",
            ]} />
            <ActionButton label="持ち物を登録" onClick={onAction} />
            <DemoLink onDemo={onDemo} />
        </Shell>
    );
}

/* ------------------------------------------------------------------ */
/*  Insights empty state                                              */
/* ------------------------------------------------------------------ */

export function InsightsEmptyState({ onAction, onDemo }: EmptyStateProps) {
    return (
        <Shell>
            <h3 className="text-[17px] font-black text-slate-900">
                全機能が交差する場所
            </h3>
            <FuturePreview items={[
                "DNA・ペルソナ・素材の全データが統合",
                "あなただけのインサイトが生まれる",
                "各機能のデータが揃うと解放",
            ]} />
            <ActionButton label="データを育てる" onClick={onAction} />
            <DemoLink onDemo={onDemo} />
        </Shell>
    );
}
