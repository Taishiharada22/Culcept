// components/ui/revolutionary-design.tsx
// 画期的なデザインシステム - 2024年最新トレンド
"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useSpring, useInView, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";

// =============================================================================
// グローバル背景エフェクト - メッシュグラデーション + 光のオーブ
// =============================================================================

export function MeshGradientBackground({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn("relative min-h-screen overflow-hidden", className)}>
            {/* ベース背景 */}
            <div className="fixed inset-0 bg-[#030014]" />

            {/* メッシュグラデーション */}
            <div className="fixed inset-0 opacity-40">
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] animate-slow-spin">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/30 rounded-full blur-[128px]" />
                    <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-blue-500/20 rounded-full blur-[128px]" />
                    <div className="absolute bottom-1/4 left-1/2 w-72 h-72 bg-cyan-500/20 rounded-full blur-[128px]" />
                </div>
            </div>

            {/* ノイズテクスチャ */}
            <div
                className="fixed inset-0 opacity-[0.015] pointer-events-none"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* コンテンツ */}
            <div className="relative z-10">{children}</div>
        </div>
    );
}

// =============================================================================
// 光のオーブ - マウス追従エフェクト
// =============================================================================

export function MouseFollowOrb() {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const springConfig = { damping: 25, stiffness: 150 };
    const x = useSpring(0, springConfig);
    const y = useSpring(0, springConfig);

    useEffect(() => {
        const handleMouse = (e: MouseEvent) => {
            x.set(e.clientX - 200);
            y.set(e.clientY - 200);
        };
        window.addEventListener("mousemove", handleMouse);
        return () => window.removeEventListener("mousemove", handleMouse);
    }, [x, y]);

    return (
        <motion.div
            className="fixed w-[400px] h-[400px] rounded-full pointer-events-none z-0"
            style={{
                x,
                y,
                background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
                filter: "blur(40px)",
            }}
        />
    );
}

// =============================================================================
// 3Dカード - ホバーで傾く
// =============================================================================

interface Card3DProps {
    children: ReactNode;
    className?: string;
    href?: string;
    glowColor?: string;
}

export function Card3D({ children, className, href, glowColor = "rgba(139,92,246,0.5)" }: Card3DProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [rotateX, setRotateX] = useState(0);
    const [rotateY, setRotateY] = useState(0);
    const [isHovered, setIsHovered] = useState(false);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const mouseX = e.clientX - centerX;
        const mouseY = e.clientY - centerY;
        setRotateX(-mouseY / 10);
        setRotateY(mouseX / 10);
    };

    const handleMouseLeave = () => {
        setRotateX(0);
        setRotateY(0);
        setIsHovered(false);
    };

    const content = (
        <motion.div
            ref={ref}
            className={cn(
                "relative rounded-3xl p-[1px] transition-all duration-300",
                className
            )}
            style={{
                transformStyle: "preserve-3d",
                perspective: "1000px",
            }}
            animate={{
                rotateX,
                rotateY,
                scale: isHovered ? 1.02 : 1,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={handleMouseLeave}
        >
            {/* グローエフェクト */}
            <motion.div
                className="absolute inset-0 rounded-3xl opacity-0 transition-opacity duration-500"
                style={{
                    background: `radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), ${glowColor}, transparent 40%)`,
                }}
                animate={{ opacity: isHovered ? 1 : 0 }}
            />

            {/* ボーダーグラデーション */}
            <div
                className="absolute inset-0 rounded-3xl"
                style={{
                    background: isHovered
                        ? "linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))"
                        : "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))",
                    transition: "background 0.3s ease",
                }}
            />

            {/* 内側コンテンツ */}
            <div className="relative rounded-3xl bg-white/[0.03] backdrop-blur-xl overflow-hidden">
                {children}
            </div>
        </motion.div>
    );

    if (href) {
        return <Link href={href} className="block">{content}</Link>;
    }
    return content;
}

// =============================================================================
// グラスモーフィズムヘッダー
// =============================================================================

interface GlassHeaderProps {
    children: ReactNode;
    transparent?: boolean;
}

export function GlassHeader({ children, transparent = false }: GlassHeaderProps) {
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
                    ? "bg-black/40 backdrop-blur-2xl border-b border-white/[0.08]"
                    : "bg-transparent"
            )}
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
            <div className="max-w-7xl mx-auto px-6 py-4">
                {children}
            </div>
        </motion.header>
    );
}

// =============================================================================
// ヒーローセクション - フルスクリーン + パララックス
// =============================================================================

interface HeroSectionProps {
    title: string;
    subtitle?: string;
    children?: ReactNode;
    backgroundElement?: ReactNode;
}

export function HeroSection({ title, subtitle, children, backgroundElement }: HeroSectionProps) {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start start", "end start"]
    });

    const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
    const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

    return (
        <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden">
            {/* 背景要素 */}
            {backgroundElement && (
                <motion.div style={{ y }} className="absolute inset-0">
                    {backgroundElement}
                </motion.div>
            )}

            {/* テキストコンテンツ */}
            <motion.div
                style={{ opacity }}
                className="relative z-10 text-center px-6 max-w-5xl mx-auto"
            >
                <motion.h1
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight"
                >
                    <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
                        {title}
                    </span>
                </motion.h1>

                {subtitle && (
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-6 text-xl sm:text-2xl text-white/50 max-w-2xl mx-auto"
                    >
                        {subtitle}
                    </motion.p>
                )}

                {children && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-10"
                    >
                        {children}
                    </motion.div>
                )}
            </motion.div>

            {/* スクロールインジケーター */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="absolute bottom-10 left-1/2 -translate-x-1/2"
            >
                <motion.div
                    animate={{ y: [0, 10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-6 h-10 rounded-full border-2 border-white/30 flex items-start justify-center p-2"
                >
                    <motion.div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                </motion.div>
            </motion.div>
        </section>
    );
}

// =============================================================================
// アニメーション付きボタン
// =============================================================================

interface MagneticButtonProps {
    children: ReactNode;
    variant?: "primary" | "secondary" | "ghost" | "gradient";
    size?: "sm" | "md" | "lg";
    href?: string;
    onClick?: () => void;
    className?: string;
    disabled?: boolean;
    loading?: boolean;
}

export function MagneticButton({
    children,
    variant = "primary",
    size = "md",
    href,
    onClick,
    className,
    disabled,
    loading
}: MagneticButtonProps) {
    const ref = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const handleMouse = (e: React.MouseEvent) => {
        if (!ref.current || disabled) return;
        const rect = ref.current.getBoundingClientRect();
        setPosition({
            x: e.clientX - rect.left - rect.width / 2,
            y: e.clientY - rect.top - rect.height / 2,
        });
    };

    const reset = () => setPosition({ x: 0, y: 0 });

    const variants = {
        primary: "bg-white text-black hover:bg-white/90",
        secondary: "bg-white/10 text-white border border-white/20 hover:bg-white/20",
        ghost: "text-white/70 hover:text-white",
        gradient: "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500",
    };

    const sizes = {
        sm: "px-4 py-2 text-sm",
        md: "px-6 py-3 text-base",
        lg: "px-8 py-4 text-lg",
    };

    const buttonClasses = cn(
        "relative inline-flex items-center justify-center gap-2 font-medium rounded-full transition-all duration-300",
        variants[variant],
        sizes[size],
        disabled && "opacity-50 cursor-not-allowed",
        className
    );

    const content = (
        <>
            {loading && (
                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            )}
            {children}
        </>
    );

    const motionProps = {
        animate: { x: position.x * 0.3, y: position.y * 0.3 },
        transition: { type: "spring" as const, stiffness: 150, damping: 15, mass: 0.1 },
        onMouseMove: handleMouse,
        onMouseLeave: reset,
        whileTap: disabled ? {} : { scale: 0.95 },
    };

    if (href && !disabled) {
        return (
            <motion.a
                ref={ref as any}
                href={href}
                className={buttonClasses}
                {...motionProps}
            >
                {content}
            </motion.a>
        );
    }

    return (
        <motion.button
            ref={ref as any}
            onClick={onClick}
            disabled={disabled || loading}
            className={buttonClasses}
            {...motionProps}
        >
            {content}
        </motion.button>
    );
}

// =============================================================================
// フェードイン on スクロール
// =============================================================================

interface FadeInProps {
    children: ReactNode;
    delay?: number;
    direction?: "up" | "down" | "left" | "right";
    className?: string;
}

export function FadeIn({ children, delay = 0, direction = "up", className }: FadeInProps) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    const directions = {
        up: { y: 40 },
        down: { y: -40 },
        left: { x: 40 },
        right: { x: -40 },
    };

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, ...directions[direction] }}
            animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
            transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
            className={className}
        >
            {children}
        </motion.div>
    );
}

// =============================================================================
// テキストアニメーション - 文字単位
// =============================================================================

interface AnimatedTextProps {
    text: string;
    className?: string;
    delay?: number;
}

export function AnimatedText({ text, className, delay = 0 }: AnimatedTextProps) {
    const words = text.split(" ");

    return (
        <motion.span className={className}>
            {words.map((word, i) => (
                <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                        duration: 0.5,
                        delay: delay + i * 0.1,
                        ease: [0.16, 1, 0.3, 1]
                    }}
                    className="inline-block mr-[0.25em]"
                >
                    {word}
                </motion.span>
            ))}
        </motion.span>
    );
}

// =============================================================================
// グラデーションボーダーカード
// =============================================================================

interface GradientBorderCardProps {
    children: ReactNode;
    className?: string;
    gradientFrom?: string;
    gradientTo?: string;
}

export function GradientBorderCard({
    children,
    className,
    gradientFrom = "from-violet-500",
    gradientTo = "to-cyan-500"
}: GradientBorderCardProps) {
    return (
        <div className={cn("relative p-[1px] rounded-3xl group", className)}>
            {/* グラデーションボーダー */}
            <div className={cn(
                "absolute inset-0 rounded-3xl bg-gradient-to-r opacity-50 group-hover:opacity-100 transition-opacity duration-500",
                gradientFrom,
                gradientTo
            )} />

            {/* 内側 */}
            <div className="relative rounded-3xl bg-[#0a0a0f] p-6 backdrop-blur-xl">
                {children}
            </div>
        </div>
    );
}

// =============================================================================
// 数字カウントアップ
// =============================================================================

interface CountUpProps {
    end: number;
    duration?: number;
    prefix?: string;
    suffix?: string;
    className?: string;
}

export function CountUp({ end, duration = 2, prefix = "", suffix = "", className }: CountUpProps) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true });
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (!isInView) return;

        let startTime: number;
        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
            setCount(Math.floor(progress * end));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }, [isInView, end, duration]);

    return (
        <span ref={ref} className={className}>
            {prefix}{count.toLocaleString()}{suffix}
        </span>
    );
}

// =============================================================================
// 横スクロールセクション
// =============================================================================

interface HorizontalScrollProps {
    children: ReactNode;
    className?: string;
}

export function HorizontalScroll({ children, className }: HorizontalScrollProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "end start"]
    });

    const x = useTransform(scrollYProgress, [0, 1], ["0%", "-50%"]);

    return (
        <div ref={containerRef} className={cn("overflow-hidden", className)}>
            <motion.div style={{ x }} className="flex gap-6">
                {children}
            </motion.div>
        </div>
    );
}

// =============================================================================
// ローディングスピナー
// =============================================================================

export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
    const sizes = { sm: "w-4 h-4", md: "w-8 h-8", lg: "w-12 h-12" };

    return (
        <div className={cn("relative", sizes[size])}>
            <motion.div
                className="absolute inset-0 rounded-full border-2 border-violet-500/20"
            />
            <motion.div
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-500"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
        </div>
    );
}

// =============================================================================
// インタラクティブ検索バー
// =============================================================================

interface SearchBarProps {
    placeholder?: string;
    onSearch?: (value: string) => void;
    className?: string;
}

export function InteractiveSearchBar({ placeholder = "検索...", onSearch, className }: SearchBarProps) {
    const [focused, setFocused] = useState(false);
    const [value, setValue] = useState("");

    return (
        <motion.div
            className={cn(
                "relative group",
                className
            )}
            animate={{
                scale: focused ? 1.02 : 1,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
            {/* グローエフェクト */}
            <motion.div
                className="absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-violet-600 via-cyan-500 to-violet-600 opacity-0 blur-lg transition-opacity duration-500"
                animate={{ opacity: focused ? 0.5 : 0 }}
            />

            {/* 入力フィールド */}
            <div className="relative">
                <svg
                    className={cn(
                        "absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors duration-300",
                        focused ? "text-violet-400" : "text-white/30"
                    )}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>

                <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(e) => e.key === "Enter" && onSearch?.(value)}
                    placeholder={placeholder}
                    className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.1] pl-14 pr-6 py-5 text-lg text-white placeholder-white/30 focus:outline-none focus:border-violet-500/50 transition-all duration-300"
                />
            </div>
        </motion.div>
    );
}

// =============================================================================
// フローティングナビゲーション
// =============================================================================

interface FloatingNavProps {
    items: { href: string; label: string; icon?: ReactNode }[];
}

export function FloatingNav({ items }: FloatingNavProps) {
    const [activeIndex, setActiveIndex] = useState(0);

    return (
        <motion.nav
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
            <div className="flex items-center gap-1 p-2 rounded-full bg-black/60 backdrop-blur-2xl border border-white/10">
                {items.map((item, i) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setActiveIndex(i)}
                        className={cn(
                            "relative px-5 py-2.5 rounded-full text-sm font-medium transition-colors duration-300",
                            activeIndex === i ? "text-white" : "text-white/50 hover:text-white/80"
                        )}
                    >
                        {activeIndex === i && (
                            <motion.div
                                layoutId="activeNav"
                                className="absolute inset-0 bg-white/10 rounded-full"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                        )}
                        <span className="relative z-10 flex items-center gap-2">
                            {item.icon}
                            {item.label}
                        </span>
                    </Link>
                ))}
            </div>
        </motion.nav>
    );
}

// =============================================================================
// Tailwind CSS カスタムアニメーション用
// =============================================================================
// tailwind.config.jsに追加が必要:
// animation: {
//   'slow-spin': 'spin 30s linear infinite',
// }
