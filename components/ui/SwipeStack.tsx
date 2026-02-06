// components/ui/SwipeStack.tsx
"use client";

import { useState, useCallback } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence, PanInfo } from "framer-motion";

interface Card {
    id: string;
    imageUrl: string;
    title?: string;
    price?: number;
    tags?: string[];
}

interface SwipeStackProps {
    cards: Card[];
    onSwipe: (id: string, direction: "left" | "right" | "up") => void;
    onEmpty?: () => void;
}

export default function SwipeStack({ cards, onSwipe, onEmpty }: SwipeStackProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [exitDirection, setExitDirection] = useState<"left" | "right" | "up" | null>(null);

    const visibleCards = cards.slice(currentIndex, currentIndex + 3);

    const handleSwipe = useCallback(
        (direction: "left" | "right" | "up") => {
            if (currentIndex >= cards.length) return;

            setExitDirection(direction);
            onSwipe(cards[currentIndex].id, direction);

            setTimeout(() => {
                setCurrentIndex((prev) => prev + 1);
                setExitDirection(null);

                if (currentIndex + 1 >= cards.length) {
                    onEmpty?.();
                }
            }, 300);
        },
        [currentIndex, cards, onSwipe, onEmpty]
    );

    if (visibleCards.length === 0) {
        return (
            <div className="w-full aspect-[3/4] flex items-center justify-center">
                <div className="text-center">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-6xl mb-4"
                    >
                        ✨
                    </motion.div>
                    <p className="text-slate-500">All caught up!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full aspect-[3/4]">
            <AnimatePresence>
                {visibleCards.map((card, index) => (
                    <SwipeCard
                        key={card.id}
                        card={card}
                        index={index}
                        isTop={index === 0}
                        exitDirection={index === 0 ? exitDirection : null}
                        onSwipe={handleSwipe}
                    />
                ))}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-4">
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleSwipe("left")}
                    className="w-14 h-14 rounded-full bg-white shadow-xl border-2 border-red-200 flex items-center justify-center"
                >
                    <span className="text-2xl">✕</span>
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleSwipe("up")}
                    className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 shadow-xl flex items-center justify-center"
                >
                    <span className="text-xl text-white">⭐</span>
                </motion.button>

                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleSwipe("right")}
                    className="w-14 h-14 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 shadow-xl flex items-center justify-center"
                >
                    <span className="text-2xl">❤️</span>
                </motion.button>
            </div>
        </div>
    );
}

interface SwipeCardProps {
    card: Card;
    index: number;
    isTop: boolean;
    exitDirection: "left" | "right" | "up" | null;
    onSwipe: (direction: "left" | "right" | "up") => void;
}

function SwipeCard({ card, index, isTop, exitDirection, onSwipe }: SwipeCardProps) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const rotate = useTransform(x, [-200, 200], [-25, 25]);
    const likeOpacity = useTransform(x, [0, 100], [0, 1]);
    const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);
    const superLikeOpacity = useTransform(y, [-100, 0], [1, 0]);

    const handleDragEnd = (_: any, info: PanInfo) => {
        const threshold = 100;
        const velocity = 500;

        if (info.offset.x > threshold || info.velocity.x > velocity) {
            onSwipe("right");
        } else if (info.offset.x < -threshold || info.velocity.x < -velocity) {
            onSwipe("left");
        } else if (info.offset.y < -threshold || info.velocity.y < -velocity) {
            onSwipe("up");
        }
    };

    const getExitAnimation = () => {
        switch (exitDirection) {
            case "left":
                return { x: -500, rotate: -30, opacity: 0 };
            case "right":
                return { x: 500, rotate: 30, opacity: 0 };
            case "up":
                return { y: -500, opacity: 0 };
            default:
                return {};
        }
    };

    return (
        <motion.div
            className="absolute inset-0"
            style={{
                x: isTop ? x : 0,
                y: isTop ? y : 0,
                rotate: isTop ? rotate : 0,
                scale: 1 - index * 0.05,
                zIndex: 10 - index,
            }}
            initial={{
                scale: 0.95,
                y: index * 10,
            }}
            animate={{
                scale: 1 - index * 0.05,
                y: index * 10,
                ...getExitAnimation(),
            }}
            exit={{
                ...getExitAnimation(),
                transition: { duration: 0.3 },
            }}
            drag={isTop}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={1}
            onDragEnd={handleDragEnd}
        >
            <div className="w-full h-full rounded-3xl overflow-hidden shadow-2xl bg-white">
                {/* Image */}
                <div className="relative w-full h-full">
                    <img
                        src={card.imageUrl}
                        alt={card.title || card.id}
                        className="w-full h-full object-cover"
                        draggable={false}
                    />

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                    {/* Like indicator */}
                    {isTop && (
                        <motion.div
                            className="absolute top-8 right-8 px-6 py-2 border-4 border-green-500 rounded-lg"
                            style={{ opacity: likeOpacity, rotate: 12 }}
                        >
                            <span className="text-green-500 font-black text-3xl">LIKE</span>
                        </motion.div>
                    )}

                    {/* Nope indicator */}
                    {isTop && (
                        <motion.div
                            className="absolute top-8 left-8 px-6 py-2 border-4 border-red-500 rounded-lg"
                            style={{ opacity: nopeOpacity, rotate: -12 }}
                        >
                            <span className="text-red-500 font-black text-3xl">NOPE</span>
                        </motion.div>
                    )}

                    {/* Super like indicator */}
                    {isTop && (
                        <motion.div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                            style={{ opacity: superLikeOpacity }}
                        >
                            <span className="text-cyan-400 text-8xl">⭐</span>
                        </motion.div>
                    )}

                    {/* Info */}
                    <div className="absolute bottom-0 left-0 right-0 p-6">
                        {card.title && (
                            <h3 className="text-white font-bold text-2xl mb-1">{card.title}</h3>
                        )}
                        {card.price && (
                            <p className="text-white/90 font-bold text-xl">
                                ¥{card.price.toLocaleString()}
                            </p>
                        )}
                        {card.tags && card.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {card.tags.slice(0, 4).map((tag) => (
                                    <span
                                        key={tag}
                                        className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm text-white"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
