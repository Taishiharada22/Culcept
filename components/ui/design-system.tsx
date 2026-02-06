// components/ui/design-system.tsx
// Culcept Design System - 「使う上での美しさ」を追求
"use client";

import { ReactNode, forwardRef } from "react";
import Link from "next/link";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

// =============================================================================
// 基本レイアウト
// =============================================================================

interface PageContainerProps {
    children: ReactNode;
    className?: string;
    /** ページの最大幅 */
    maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
}

const maxWidthClasses = {
    sm: "max-w-2xl",
    md: "max-w-4xl",
    lg: "max-w-5xl",
    xl: "max-w-6xl",
    "2xl": "max-w-7xl",
    full: "max-w-full",
};

export function PageContainer({ children, className, maxWidth = "2xl" }: PageContainerProps) {
    return (
        <div className={cn("min-h-screen bg-[#0a0a0f]", className)}>
            <div className={cn("mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8", maxWidthClasses[maxWidth])}>
                {children}
            </div>
        </div>
    );
}

// =============================================================================
// ページヘッダー - 各ページの顔
// =============================================================================

interface PageHeaderProps {
    /** ページタイトル */
    title: string;
    /** サブタイトル（オプション） */
    subtitle?: string;
    /** アイコン（絵文字またはReactNode） */
    icon?: ReactNode;
    /** 右側のアクション */
    actions?: ReactNode;
    /** 戻るリンク */
    backHref?: string;
    backLabel?: string;
}

export function PageHeader({ title, subtitle, icon, actions, backHref, backLabel }: PageHeaderProps) {
    return (
        <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
        >
            {/* 戻るリンク */}
            {backHref && (
                <Link
                    href={backHref}
                    className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors mb-4"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    {backLabel || "戻る"}
                </Link>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    {icon && (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-2xl shrink-0">
                            {icon}
                        </div>
                    )}
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="text-sm text-white/50 mt-1">{subtitle}</p>
                        )}
                    </div>
                </div>
                {actions && <div className="flex items-center gap-3">{actions}</div>}
            </div>
        </motion.header>
    );
}

// =============================================================================
// カード - 情報をグループ化
// =============================================================================

interface CardProps {
    children: ReactNode;
    className?: string;
    /** ホバーエフェクト */
    hoverable?: boolean;
    /** パディング */
    padding?: "none" | "sm" | "md" | "lg";
    /** as link */
    href?: string;
}

const paddingClasses = {
    none: "",
    sm: "p-4",
    md: "p-5",
    lg: "p-6",
};

export function Card({ children, className, hoverable = false, padding = "md", href }: CardProps) {
    const baseClasses = cn(
        "rounded-2xl bg-white/[0.03] border border-white/[0.06]",
        paddingClasses[padding],
        hoverable && "transition-all duration-200 hover:bg-white/[0.06] hover:border-white/10",
        className
    );

    if (href) {
        return (
            <Link href={href} className={cn(baseClasses, "block")}>
                {children}
            </Link>
        );
    }

    return <div className={baseClasses}>{children}</div>;
}

// =============================================================================
// ボタン - 一貫したアクション
// =============================================================================

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    icon?: ReactNode;
    loading?: boolean;
    children?: ReactNode;
}

const buttonVariants = {
    primary: "bg-white text-black hover:bg-white/90",
    secondary: "bg-white/10 text-white hover:bg-white/15 border border-white/10",
    ghost: "text-white/70 hover:text-white hover:bg-white/10",
    danger: "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20",
};

const buttonSizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = "primary", size = "md", icon, loading, children, className, disabled, ...props }, ref) => {
        return (
            <motion.button
                ref={ref}
                whileHover={{ scale: disabled ? 1 : 1.02 }}
                whileTap={{ scale: disabled ? 1 : 0.98 }}
                className={cn(
                    "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-colors",
                    buttonVariants[variant],
                    buttonSizes[size],
                    (disabled || loading) && "opacity-50 cursor-not-allowed",
                    className
                )}
                disabled={disabled || loading}
                {...props}
            >
                {loading ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                ) : icon}
                {children}
            </motion.button>
        );
    }
);
Button.displayName = "Button";

// リンクとして使えるボタン
interface ButtonLinkProps {
    href: string;
    variant?: "primary" | "secondary" | "ghost";
    size?: "sm" | "md" | "lg";
    icon?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function ButtonLink({ href, variant = "primary", size = "md", icon, children, className }: ButtonLinkProps) {
    return (
        <Link
            href={href}
            className={cn(
                "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200",
                buttonVariants[variant],
                buttonSizes[size],
                className
            )}
        >
            {icon}
            {children}
        </Link>
    );
}

// =============================================================================
// 入力フィールド
// =============================================================================

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, icon, className, ...props }, ref) => {
        return (
            <div className="space-y-1.5">
                {label && (
                    <label className="block text-sm font-medium text-white/70">
                        {label}
                    </label>
                )}
                <div className="relative">
                    {icon && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                            {icon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        className={cn(
                            "w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-4 py-3 text-white placeholder-white/30",
                            "focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all",
                            icon && "pl-10",
                            error && "border-red-500/50",
                            className
                        )}
                        {...props}
                    />
                </div>
                {error && (
                    <p className="text-sm text-red-400">{error}</p>
                )}
            </div>
        );
    }
);
Input.displayName = "Input";

// =============================================================================
// 検索バー - より目立つ
// =============================================================================

interface SearchBarProps {
    placeholder?: string;
    defaultValue?: string;
    onSearch?: (value: string) => void;
    className?: string;
}

export function SearchBar({ placeholder = "検索...", defaultValue, onSearch, className }: SearchBarProps) {
    return (
        <div className={cn("relative", className)}>
            <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
                type="text"
                placeholder={placeholder}
                defaultValue={defaultValue}
                className="w-full rounded-2xl bg-white/[0.03] border border-white/[0.08] pl-12 pr-4 py-4 text-white placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all text-base"
                onChange={(e) => onSearch?.(e.target.value)}
            />
        </div>
    );
}

// =============================================================================
// メトリックカード - 数値を表示
// =============================================================================

interface MetricCardProps {
    label: string;
    value: string | number;
    change?: string;
    changeType?: "positive" | "negative" | "neutral";
    icon?: ReactNode;
}

export function MetricCard({ label, value, change, changeType = "neutral", icon }: MetricCardProps) {
    const changeColors = {
        positive: "text-emerald-400",
        negative: "text-red-400",
        neutral: "text-white/50",
    };

    return (
        <Card padding="md">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-white/50">{label}</p>
                    <p className="text-2xl font-bold text-white mt-1">{value}</p>
                    {change && (
                        <p className={cn("text-sm mt-1", changeColors[changeType])}>
                            {change}
                        </p>
                    )}
                </div>
                {icon && (
                    <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center text-lg">
                        {icon}
                    </div>
                )}
            </div>
        </Card>
    );
}

// =============================================================================
// ナビゲーションメニューアイテム
// =============================================================================

interface NavItemProps {
    href: string;
    icon: ReactNode;
    label: string;
    description?: string;
    badge?: string | number;
    active?: boolean;
}

export function NavItem({ href, icon, label, description, badge, active }: NavItemProps) {
    return (
        <Link href={href} className="block group">
            <div
                className={cn(
                    "flex items-center gap-4 p-4 rounded-xl transition-all duration-200",
                    active
                        ? "bg-white/10 border border-white/10"
                        : "hover:bg-white/[0.03] border border-transparent"
                )}
            >
                <div
                    className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center text-xl transition-colors",
                        active ? "bg-white/10" : "bg-white/[0.03] group-hover:bg-white/[0.06]"
                    )}
                >
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={cn("font-medium", active ? "text-white" : "text-white/80")}>
                            {label}
                        </span>
                        {badge !== undefined && (
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs text-white/70">
                                {badge}
                            </span>
                        )}
                    </div>
                    {description && (
                        <p className="text-sm text-white/40 mt-0.5 truncate">{description}</p>
                    )}
                </div>
                <svg
                    className={cn(
                        "w-5 h-5 transition-all",
                        active ? "text-white/50" : "text-white/20 group-hover:text-white/40 group-hover:translate-x-0.5"
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </div>
        </Link>
    );
}

// =============================================================================
// 空状態
// =============================================================================

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
        >
            {icon && (
                <div className="text-5xl mb-4 opacity-30">{icon}</div>
            )}
            <h3 className="text-lg font-medium text-white/80 mb-2">{title}</h3>
            {description && (
                <p className="text-sm text-white/40 mb-6 max-w-sm mx-auto">{description}</p>
            )}
            {action}
        </motion.div>
    );
}

// =============================================================================
// グリッドレイアウト
// =============================================================================

interface GridProps {
    children: ReactNode;
    cols?: 1 | 2 | 3 | 4;
    gap?: "sm" | "md" | "lg";
    className?: string;
}

const gridColsClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

const gridGapClasses = {
    sm: "gap-3",
    md: "gap-4",
    lg: "gap-6",
};

export function Grid({ children, cols = 3, gap = "md", className }: GridProps) {
    return (
        <div className={cn("grid", gridColsClasses[cols], gridGapClasses[gap], className)}>
            {children}
        </div>
    );
}

// =============================================================================
// タブ
// =============================================================================

interface TabsProps {
    tabs: { id: string; label: string; count?: number }[];
    activeTab: string;
    onChange: (id: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
    return (
        <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onChange(tab.id)}
                    className={cn(
                        "flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        activeTab === tab.id
                            ? "bg-white text-black"
                            : "text-white/60 hover:text-white hover:bg-white/[0.05]"
                    )}
                >
                    {tab.label}
                    {tab.count !== undefined && (
                        <span className={cn(
                            "ml-2 px-1.5 py-0.5 rounded text-xs",
                            activeTab === tab.id ? "bg-black/10" : "bg-white/10"
                        )}>
                            {tab.count}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}

// =============================================================================
// セクション区切り
// =============================================================================

interface SectionProps {
    title?: string;
    subtitle?: string;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function Section({ title, subtitle, action, children, className }: SectionProps) {
    return (
        <section className={cn("space-y-4", className)}>
            {(title || action) && (
                <div className="flex items-end justify-between gap-4">
                    <div>
                        {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
                        {subtitle && <p className="text-sm text-white/40 mt-0.5">{subtitle}</p>}
                    </div>
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}

// =============================================================================
// バッジ
// =============================================================================

interface BadgeProps {
    children: ReactNode;
    variant?: "default" | "success" | "warning" | "error";
    className?: string;
}

const badgeVariants = {
    default: "bg-white/10 text-white/70",
    success: "bg-emerald-500/20 text-emerald-400",
    warning: "bg-amber-500/20 text-amber-400",
    error: "bg-red-500/20 text-red-400",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
    return (
        <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
            badgeVariants[variant],
            className
        )}>
            {children}
        </span>
    );
}

// =============================================================================
// アバター
// =============================================================================

interface AvatarProps {
    src?: string | null;
    alt?: string;
    size?: "sm" | "md" | "lg";
    fallback?: string;
    className?: string;
}

const avatarSizes = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-14 h-14 text-xl",
};

export function Avatar({ src, alt, size = "md", fallback, className }: AvatarProps) {
    if (src) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={src}
                alt={alt || ""}
                className={cn("rounded-full object-cover bg-white/10", avatarSizes[size], className)}
            />
        );
    }

    return (
        <div className={cn(
            "rounded-full bg-white/10 flex items-center justify-center text-white/60 font-medium",
            avatarSizes[size],
            className
        )}>
            {fallback || alt?.charAt(0).toUpperCase() || "?"}
        </div>
    );
}
