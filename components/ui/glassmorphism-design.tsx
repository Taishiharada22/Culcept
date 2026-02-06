// components/ui/glassmorphism-design.tsx
// ライトモード + グラスモーフィズム デザインシステム
"use client";

import { ReactNode, useEffect, useRef, useState, createContext, useContext } from "react";
import { motion, useScroll, useTransform, useSpring, useInView, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";

// =============================================================================
// テーマコンテキスト
// =============================================================================

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
    theme: "light",
    toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>("light");

    useEffect(() => {
        const saved = localStorage.getItem("culcept-theme") as Theme;
        if (saved) setTheme(saved);
    }, []);

    const toggle = () => {
        const next = theme === "light" ? "dark" : "light";
        setTheme(next);
        localStorage.setItem("culcept-theme", next);
    };

    return (
        <ThemeContext.Provider value={{ theme, toggle }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);

// =============================================================================
// ライト背景 - カラフルなグラデーションオーブ
// =============================================================================

export function LightBackground({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn("relative min-h-screen overflow-hidden", className)}>
            {/* ベース背景 - 明るいグレー/ホワイト */}
            <div className="fixed inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50" />

            {/* カラフルなグラデーションオーブ */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                {/* ピンク/パープル オーブ */}
                <motion.div
                    className="absolute -top-40 -right-40 w-96 h-96 rounded-full"
                    style={{
                        background: "radial-gradient(circle, rgba(236,72,153,0.3) 0%, rgba(168,85,247,0.2) 50%, transparent 70%)",
                        filter: "blur(60px)",
                    }}
                    animate={{
                        x: [0, 30, 0],
                        y: [0, 20, 0],
                    }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* シアン/ブルー オーブ */}
                <motion.div
                    className="absolute top-1/3 -left-40 w-80 h-80 rounded-full"
                    style={{
                        background: "radial-gradient(circle, rgba(6,182,212,0.25) 0%, rgba(59,130,246,0.15) 50%, transparent 70%)",
                        filter: "blur(60px)",
                    }}
                    animate={{
                        x: [0, -20, 0],
                        y: [0, 30, 0],
                    }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* イエロー/オレンジ オーブ */}
                <motion.div
                    className="absolute bottom-20 right-1/4 w-72 h-72 rounded-full"
                    style={{
                        background: "radial-gradient(circle, rgba(251,191,36,0.2) 0%, rgba(249,115,22,0.15) 50%, transparent 70%)",
                        filter: "blur(60px)",
                    }}
                    animate={{
                        x: [0, 25, 0],
                        y: [0, -25, 0],
                    }}
                    transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* グリーン オーブ */}
                <motion.div
                    className="absolute bottom-1/3 left-1/3 w-64 h-64 rounded-full"
                    style={{
                        background: "radial-gradient(circle, rgba(34,197,94,0.2) 0%, rgba(16,185,129,0.1) 50%, transparent 70%)",
                        filter: "blur(60px)",
                    }}
                    animate={{
                        x: [0, -15, 0],
                        y: [0, 15, 0],
                    }}
                    transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
                />
            </div>

            {/* グリッドパターン（薄く） */}
            <div
                className="fixed inset-0 opacity-[0.03] pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
                    backgroundSize: "60px 60px",
                }}
            />

            {/* コンテンツ */}
            <div className="relative z-10">{children}</div>
        </div>
    );
}

// =============================================================================
// グラスカード - メインのカードコンポーネント
// =============================================================================

interface GlassCardProps {
    children: ReactNode;
    className?: string;
    href?: string;
    onClick?: () => void;
    variant?: "default" | "elevated" | "bordered" | "gradient";
    hoverEffect?: boolean;
    padding?: "none" | "sm" | "md" | "lg";
}

export function GlassCard({
    children,
    className,
    href,
    onClick,
    variant = "default",
    hoverEffect = true,
    padding = "md",
}: GlassCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    const variants = {
        default: "bg-white/60 backdrop-blur-xl border border-white/80 shadow-lg shadow-black/5",
        elevated: "bg-white/80 backdrop-blur-2xl border border-white shadow-xl shadow-black/10",
        bordered: "bg-white/40 backdrop-blur-lg border-2 border-slate-200/60",
        gradient: "bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-xl border border-white/60 shadow-lg",
    };

    const paddings = {
        none: "",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
    };

    const content = (
        <motion.div
            className={cn(
                "rounded-3xl overflow-hidden transition-all duration-300",
                variants[variant],
                paddings[padding],
                hoverEffect && "hover:shadow-2xl hover:shadow-black/10 hover:bg-white/80",
                className
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            whileHover={hoverEffect ? { y: -4, scale: 1.01 } : {}}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
            {children}
        </motion.div>
    );

    if (href) {
        return <Link href={href} className="block">{content}</Link>;
    }
    if (onClick) {
        return <button onClick={onClick} className="block w-full text-left">{content}</button>;
    }
    return content;
}

// =============================================================================
// グラスヘッダー - ナビゲーションバー
// =============================================================================

interface GlassNavbarProps {
    children: ReactNode;
    transparent?: boolean;
}

export function GlassNavbar({ children, transparent = false }: GlassNavbarProps) {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <motion.header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
                scrolled || !transparent
                    ? "bg-white/70 backdrop-blur-2xl border-b border-slate-200/50 shadow-sm"
                    : "bg-transparent"
            )}
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
                {children}
            </div>
        </motion.header>
    );
}

// =============================================================================
// グラスボタン
// =============================================================================

interface GlassButtonProps {
    children: ReactNode;
    variant?: "primary" | "secondary" | "ghost" | "gradient" | "danger";
    size?: "xs" | "sm" | "md" | "lg";
    href?: string;
    type?: "button" | "submit" | "reset";
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
    loading?: boolean;
    icon?: ReactNode;
    fullWidth?: boolean;
}

export function GlassButton({
    children,
    variant = "primary",
    size = "md",
    href,
    type,
    onClick,
    className,
    disabled,
    loading,
    icon,
    fullWidth,
}: GlassButtonProps) {
    const variants = {
        primary: "bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/20",
        secondary: "bg-white/80 backdrop-blur-lg text-slate-700 border border-slate-200 hover:bg-white hover:border-slate-300",
        ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80",
        gradient: "bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 text-white hover:opacity-90 shadow-lg shadow-purple-500/25",
        danger: "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20",
    };

    const sizes = {
        xs: "px-3 py-1.5 text-xs",
        sm: "px-4 py-2 text-sm",
        md: "px-6 py-3 text-base",
        lg: "px-8 py-4 text-lg",
    };

    const buttonClasses = cn(
        "inline-flex items-center justify-center gap-2 font-semibold rounded-2xl transition-all duration-300",
        variants[variant],
        sizes[size],
        disabled && "opacity-50 cursor-not-allowed",
        fullWidth && "w-full",
        className
    );

    const content = (
        <>
            {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            )}
            {icon && !loading && icon}
            {children}
        </>
    );

    if (href && !disabled) {
        return (
            <motion.a
                href={href}
                className={buttonClasses}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
            >
                {content}
            </motion.a>
        );
    }

    return (
        <motion.button
            type={type}
            onClick={onClick}
            disabled={disabled || loading}
            className={buttonClasses}
            whileHover={!disabled ? { scale: 1.02 } : {}}
            whileTap={!disabled ? { scale: 0.98 } : {}}
        >
            {content}
        </motion.button>
    );
}

// =============================================================================
// グラスインプット
// =============================================================================

interface GlassInputProps {
    placeholder?: string;
    value?: string;
    defaultValue?: string;
    onChange?: (value: string) => void;
    onSubmit?: (value: string) => void;
    type?: "text" | "email" | "password" | "search";
    name?: string;
    id?: string;
    autoComplete?: string;
    required?: boolean;
    disabled?: boolean;
    icon?: ReactNode;
    className?: string;
    size?: "sm" | "md" | "lg";
}

export function GlassInput({
    placeholder,
    value,
    defaultValue,
    onChange,
    onSubmit,
    type = "text",
    name,
    id,
    autoComplete,
    required,
    disabled,
    icon,
    className,
    size = "md",
}: GlassInputProps) {
    const [focused, setFocused] = useState(false);
    const [internalValue, setInternalValue] = useState(value ?? defaultValue ?? "");

    useEffect(() => {
        if (value !== undefined) setInternalValue(value);
    }, [value]);

    const sizes = {
        sm: "py-2 text-sm",
        md: "py-3 text-base",
        lg: "py-4 text-lg",
    };

    return (
        <motion.div
            className={cn("relative group", className)}
            animate={{ scale: focused ? 1.01 : 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
            {/* グローエフェクト */}
            <motion.div
                className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 opacity-0 blur-md"
                animate={{ opacity: focused ? 0.3 : 0 }}
            />

            <div className="relative">
                {icon && (
                    <div className={cn(
                        "absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300",
                        focused ? "text-purple-500" : "text-slate-400"
                    )}>
                        {icon}
                    </div>
                )}

                <input
                    type={type}
                    value={internalValue}
                    name={name}
                    id={id}
                    autoComplete={autoComplete}
                    required={required}
                    disabled={disabled}
                    onChange={(e) => {
                        setInternalValue(e.target.value);
                        onChange?.(e.target.value);
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(e) => e.key === "Enter" && onSubmit?.(internalValue)}
                    placeholder={placeholder}
                    className={cn(
                        "w-full rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/80 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-400 focus:bg-white transition-all duration-300",
                        icon ? "pl-12 pr-4" : "px-4",
                        sizes[size],
                        disabled && "opacity-60 cursor-not-allowed"
                    )}
                />
            </div>
        </motion.div>
    );
}

// =============================================================================
// グラスタブ
// =============================================================================

interface GlassTabsProps {
    tabs: { id: string; label: string; icon?: ReactNode }[];
    activeTab: string;
    onChange: (id: string) => void;
    className?: string;
}

export function GlassTabs({ tabs, activeTab, onChange, className }: GlassTabsProps) {
    return (
        <div className={cn(
            "inline-flex items-center gap-1 p-1.5 rounded-2xl bg-slate-100/80 backdrop-blur-lg border border-slate-200/50",
            className
        )}>
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onChange(tab.id)}
                    className={cn(
                        "relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2",
                        activeTab === tab.id
                            ? "text-slate-900"
                            : "text-slate-500 hover:text-slate-700"
                    )}
                >
                    {activeTab === tab.id && (
                        <motion.div
                            layoutId="activeTab"
                            className="absolute inset-0 bg-white rounded-xl shadow-sm"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                        {tab.icon}
                        {tab.label}
                    </span>
                </button>
            ))}
        </div>
    );
}

// =============================================================================
// グラスモーダル
// =============================================================================

interface GlassModalProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    title?: string;
    size?: "sm" | "md" | "lg" | "xl" | "full";
}

export function GlassModal({ isOpen, onClose, children, title, size = "md" }: GlassModalProps) {
    const sizes = {
        sm: "max-w-md",
        md: "max-w-lg",
        lg: "max-w-2xl",
        xl: "max-w-4xl",
        full: "max-w-[95vw] max-h-[95vh]",
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* オーバーレイ */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm"
                    />

                    {/* モーダル */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className={cn(
                            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full",
                            sizes[size]
                        )}
                    >
                        <div className="bg-white/90 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-black/10 border border-white overflow-hidden">
                            {title && (
                                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/50">
                                    <h2 className="text-xl font-bold text-slate-900">{title}</h2>
                                    <button
                                        onClick={onClose}
                                        className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            )}
                            <div className="p-6">
                                {children}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// =============================================================================
// フェードイン
// =============================================================================

interface FadeInViewProps {
    children: ReactNode;
    delay?: number;
    direction?: "up" | "down" | "left" | "right";
    className?: string;
}

export function FadeInView({ children, delay = 0, direction = "up", className }: FadeInViewProps) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-50px" });

    const directions = {
        up: { y: 30 },
        down: { y: -30 },
        left: { x: 30 },
        right: { x: -30 },
    };

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, ...directions[direction] }}
            animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
            transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

// =============================================================================
// バッジ
// =============================================================================

interface GlassBadgeProps {
    children: ReactNode;
    variant?: "default" | "success" | "warning" | "danger" | "info" | "gradient";
    size?: "sm" | "md";
    className?: string;
}

export function GlassBadge({ children, variant = "default", size = "md", className }: GlassBadgeProps) {
    const variants = {
        default: "bg-slate-100 text-slate-700 border-slate-200",
        success: "bg-emerald-50 text-emerald-700 border-emerald-200",
        warning: "bg-amber-50 text-amber-700 border-amber-200",
        danger: "bg-red-50 text-red-700 border-red-200",
        info: "bg-blue-50 text-blue-700 border-blue-200",
        gradient: "bg-gradient-to-r from-pink-500 to-purple-500 text-white border-transparent",
    };

    const sizes = {
        sm: "px-2 py-0.5 text-xs",
        md: "px-3 py-1 text-sm",
    };

    return (
        <span className={cn(
            "inline-flex items-center font-medium rounded-full border",
            variants[variant],
            sizes[size],
            className
        )}>
            {children}
        </span>
    );
}

// =============================================================================
// フローティングナビゲーション（ライト版）
// =============================================================================

interface FloatingNavLightProps {
    items: { href: string; label: string; icon: ReactNode; active?: boolean }[];
    activeHref?: string;
}

export function FloatingNavLight({ items, activeHref }: FloatingNavLightProps) {
    return (
        <div className="flex items-center gap-1 p-2 rounded-full bg-white/80 backdrop-blur-2xl border border-slate-200/50 shadow-xl shadow-black/10">
            {items.map((item) => {
                const isActive = activeHref ? item.href === activeHref : item.active;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "relative px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2",
                            isActive
                                ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-500/25"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        )}
                    >
                        {item.icon}
                        <span className="hidden sm:inline">{item.label}</span>
                    </Link>
                );
            })}
        </div>
    );
}

// =============================================================================
// プログレスリング
// =============================================================================

interface ProgressRingProps {
    progress: number; // 0-100
    size?: number;
    strokeWidth?: number;
    className?: string;
    children?: ReactNode;
}

export function ProgressRing({
    progress,
    size = 120,
    strokeWidth = 8,
    className,
    children,
}: ProgressRingProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <div className={cn("relative inline-flex items-center justify-center", className)}>
            <svg width={size} height={size} className="-rotate-90">
                {/* 背景リング */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-slate-200"
                />
                {/* プログレスリング */}
                <motion.circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="url(#progressGradient)"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    style={{
                        strokeDasharray: circumference,
                    }}
                />
                <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#ec4899" />
                        <stop offset="50%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                </defs>
            </svg>
            {children && (
                <div className="absolute inset-0 flex items-center justify-center">
                    {children}
                </div>
            )}
        </div>
    );
}

// =============================================================================
// スケルトンローダー
// =============================================================================

interface SkeletonProps {
    className?: string;
    variant?: "text" | "circular" | "rectangular";
    width?: number | string;
    height?: number | string;
}

export function Skeleton({ className, variant = "text", width, height }: SkeletonProps) {
    const variants = {
        text: "rounded-lg",
        circular: "rounded-full",
        rectangular: "rounded-2xl",
    };

    return (
        <motion.div
            className={cn(
                "bg-slate-200/80",
                variants[variant],
                className
            )}
            style={{ width, height }}
            animate={{
                opacity: [0.5, 1, 0.5],
            }}
            transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
            }}
        />
    );
}

// =============================================================================
// アバター
// =============================================================================

interface AvatarProps {
    src?: string;
    alt?: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    fallback?: string;
    className?: string;
    online?: boolean;
}

export function Avatar({ src, alt, size = "md", fallback, className, online }: AvatarProps) {
    const sizes = {
        xs: "w-6 h-6 text-xs",
        sm: "w-8 h-8 text-sm",
        md: "w-10 h-10 text-base",
        lg: "w-14 h-14 text-lg",
        xl: "w-20 h-20 text-xl",
    };

    return (
        <div className={cn("relative inline-block", className)}>
            <div className={cn(
                "rounded-full overflow-hidden bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-medium",
                sizes[size]
            )}>
                {src ? (
                    <img src={src} alt={alt} className="w-full h-full object-cover" />
                ) : (
                    <span>{fallback || "?"}</span>
                )}
            </div>
            {online !== undefined && (
                <span className={cn(
                    "absolute bottom-0 right-0 block rounded-full ring-2 ring-white",
                    size === "xs" || size === "sm" ? "w-2 h-2" : "w-3 h-3",
                    online ? "bg-emerald-500" : "bg-slate-400"
                )} />
            )}
        </div>
    );
}

// =============================================================================
// 統計カード
// =============================================================================

interface StatCardProps {
    label: string;
    value: string | number;
    change?: { value: number; positive: boolean };
    icon?: ReactNode;
    className?: string;
}

export function StatCard({ label, value, change, icon, className }: StatCardProps) {
    return (
        <GlassCard className={className} padding="md">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-slate-500">{label}</p>
                    <p className="mt-1 text-3xl font-bold text-slate-900">{value}</p>
                    {change && (
                        <p className={cn(
                            "mt-1 text-sm font-medium flex items-center gap-1",
                            change.positive ? "text-emerald-600" : "text-red-600"
                        )}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d={change.positive ? "M5 10l7-7m0 0l7 7m-7-7v18" : "M19 14l-7 7m0 0l-7-7m7 7V3"}
                                />
                            </svg>
                            {Math.abs(change.value)}%
                        </p>
                    )}
                </div>
                {icon && (
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500/10 to-purple-500/10 flex items-center justify-center text-purple-600">
                        {icon}
                    </div>
                )}
            </div>
        </GlassCard>
    );
}

// =============================================================================
// ライブパルス（オンライン/ライブ表示）
// =============================================================================

export function LivePulse({ className }: { className?: string }) {
    return (
        <span className={cn("relative flex h-3 w-3", className)}>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
    );
}

// =============================================================================
// カウントダウンタイマー
// =============================================================================

interface CountdownProps {
    targetDate: Date;
    onComplete?: () => void;
    className?: string;
}

export function Countdown({ targetDate, onComplete, className }: CountdownProps) {
    const [timeLeft, setTimeLeft] = useState({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
    });

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date().getTime();
            const distance = targetDate.getTime() - now;

            if (distance < 0) {
                clearInterval(timer);
                onComplete?.();
                return;
            }

            setTimeLeft({
                days: Math.floor(distance / (1000 * 60 * 60 * 24)),
                hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
                seconds: Math.floor((distance % (1000 * 60)) / 1000),
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [targetDate, onComplete]);

    const TimeUnit = ({ value, label }: { value: number; label: string }) => (
        <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/50 shadow-lg flex items-center justify-center">
                <span className="text-2xl font-bold text-slate-900">
                    {String(value).padStart(2, "0")}
                </span>
            </div>
            <span className="mt-2 text-xs font-medium text-slate-500 uppercase">{label}</span>
        </div>
    );

    return (
        <div className={cn("flex items-center gap-3", className)}>
            <TimeUnit value={timeLeft.days} label="Days" />
            <span className="text-2xl font-bold text-slate-300">:</span>
            <TimeUnit value={timeLeft.hours} label="Hours" />
            <span className="text-2xl font-bold text-slate-300">:</span>
            <TimeUnit value={timeLeft.minutes} label="Mins" />
            <span className="text-2xl font-bold text-slate-300">:</span>
            <TimeUnit value={timeLeft.seconds} label="Secs" />
        </div>
    );
}
