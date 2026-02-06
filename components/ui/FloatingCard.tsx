// components/ui/FloatingCard.tsx
"use client";

import { ReactNode, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface FloatingCardProps {
    children: ReactNode;
    className?: string;
    depth?: number;
    glare?: boolean;
}

export default function FloatingCard({
    children,
    className = "",
    depth = 20,
    glare = true,
}: FloatingCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [depth, -depth]), {
        stiffness: 300,
        damping: 30,
    });
    const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-depth, depth]), {
        stiffness: 300,
        damping: 30,
    });

    const glareX = useTransform(mouseX, [-0.5, 0.5], ["-100%", "200%"]);
    const glareY = useTransform(mouseY, [-0.5, 0.5], ["-100%", "200%"]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        mouseX.set(x);
        mouseY.set(y);
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        mouseX.set(0);
        mouseY.set(0);
    };

    return (
        <motion.div
            className={`relative ${className}`}
            style={{
                perspective: 1000,
            }}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={handleMouseLeave}
        >
            <motion.div
                className="relative w-full h-full"
                style={{
                    rotateX,
                    rotateY,
                    transformStyle: "preserve-3d",
                }}
            >
                {children}

                {/* Glare effect */}
                {glare && isHovered && (
                    <motion.div
                        className="absolute inset-0 pointer-events-none rounded-3xl overflow-hidden"
                        style={{ transformStyle: "preserve-3d", transform: "translateZ(1px)" }}
                    >
                        <motion.div
                            className="absolute w-full h-full"
                            style={{
                                background:
                                    "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.5) 55%, transparent 60%)",
                                x: glareX,
                                y: glareY,
                            }}
                        />
                    </motion.div>
                )}
            </motion.div>
        </motion.div>
    );
}
