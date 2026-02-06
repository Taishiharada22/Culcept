// components/ui/ParticleField.tsx
"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface Particle {
    x: number;
    y: number;
    size: number;
    speedX: number;
    speedY: number;
    opacity: number;
    hue: number;
}

interface ParticleFieldProps {
    particleCount?: number;
    className?: string;
    colors?: string[];
    interactive?: boolean;
}

export default function ParticleField({
    particleCount = 50,
    className = "",
    colors = ["#8B5CF6", "#EC4899", "#F97316"],
    interactive = true,
}: ParticleFieldProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const mouseRef = useRef({ x: 0, y: 0 });
    const animationRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const resizeCanvas = () => {
            canvas.width = canvas.offsetWidth * window.devicePixelRatio;
            canvas.height = canvas.offsetHeight * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        };

        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);

        // Initialize particles
        particlesRef.current = Array.from({ length: particleCount }, () => ({
            x: Math.random() * canvas.offsetWidth,
            y: Math.random() * canvas.offsetHeight,
            size: Math.random() * 3 + 1,
            speedX: (Math.random() - 0.5) * 0.5,
            speedY: (Math.random() - 0.5) * 0.5,
            opacity: Math.random() * 0.5 + 0.2,
            hue: Math.floor(Math.random() * colors.length),
        }));

        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            mouseRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        };

        if (interactive) {
            canvas.addEventListener("mousemove", handleMouseMove);
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

            particlesRef.current.forEach((particle, i) => {
                // Update position
                particle.x += particle.speedX;
                particle.y += particle.speedY;

                // Wrap around edges
                if (particle.x < 0) particle.x = canvas.offsetWidth;
                if (particle.x > canvas.offsetWidth) particle.x = 0;
                if (particle.y < 0) particle.y = canvas.offsetHeight;
                if (particle.y > canvas.offsetHeight) particle.y = 0;

                // Interactive mouse effect
                if (interactive) {
                    const dx = mouseRef.current.x - particle.x;
                    const dy = mouseRef.current.y - particle.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 100) {
                        const force = (100 - dist) / 100;
                        particle.x -= (dx / dist) * force * 2;
                        particle.y -= (dy / dist) * force * 2;
                    }
                }

                // Draw particle
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fillStyle = colors[particle.hue];
                ctx.globalAlpha = particle.opacity;
                ctx.fill();

                // Draw connections
                particlesRef.current.slice(i + 1).forEach((otherParticle) => {
                    const dx = particle.x - otherParticle.x;
                    const dy = particle.y - otherParticle.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 80) {
                        ctx.beginPath();
                        ctx.moveTo(particle.x, particle.y);
                        ctx.lineTo(otherParticle.x, otherParticle.y);
                        ctx.strokeStyle = colors[particle.hue];
                        ctx.globalAlpha = (1 - dist / 80) * 0.2;
                        ctx.stroke();
                    }
                });
            });

            ctx.globalAlpha = 1;
            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener("resize", resizeCanvas);
            if (interactive) {
                canvas.removeEventListener("mousemove", handleMouseMove);
            }
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [particleCount, colors, interactive]);

    return (
        <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full pointer-events-auto ${className}`}
        />
    );
}
