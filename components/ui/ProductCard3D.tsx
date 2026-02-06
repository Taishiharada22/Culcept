// components/ui/ProductCard3D.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

interface ProductCard3DProps {
    id: string;
    imageUrl: string;
    title?: string;
    price?: number;
    tags?: string[];
    onLike?: () => void;
    onDislike?: () => void;
    onSave?: () => void;
}

export default function ProductCard3D({
    id,
    imageUrl,
    title,
    price,
    tags = [],
    onLike,
    onDislike,
    onSave,
}: ProductCard3DProps) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [isLiked, setIsLiked] = useState(false);
    const [showHeart, setShowHeart] = useState(false);

    const handleDoubleTap = () => {
        if (!isLiked) {
            setIsLiked(true);
            setShowHeart(true);
            onLike?.();
            setTimeout(() => setShowHeart(false), 1000);
        }
    };

    return (
        <motion.div
            className="relative w-full aspect-[3/4] cursor-pointer"
            style={{ perspective: 1000 }}
            onDoubleClick={handleDoubleTap}
        >
            <motion.div
                className="relative w-full h-full"
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
                style={{ transformStyle: "preserve-3d" }}
            >
                {/* Front */}
                <div
                    className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl"
                    style={{ backfaceVisibility: "hidden" }}
                >
                    {/* Image */}
                    <div className="relative w-full h-full">
                        <img
                            src={imageUrl}
                            alt={title || id}
                            className="w-full h-full object-cover"
                        />

                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                        {/* Heart animation on double tap */}
                        <AnimatePresence>
                            {showHeart && (
                                <motion.div
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1.5, opacity: 1 }}
                                    exit={{ scale: 2, opacity: 0 }}
                                    className="absolute inset-0 flex items-center justify-center"
                                >
                                    <span className="text-8xl">❤️</span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Top actions */}
                        <div className="absolute top-4 right-4 flex gap-2">
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsFlipped(true);
                                }}
                                className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg"
                            >
                                <span className="text-lg">ℹ️</span>
                            </motion.button>
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSave?.();
                                }}
                                className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg"
                            >
                                <span className="text-lg">🔖</span>
                            </motion.button>
                        </div>

                        {/* Bottom info */}
                        <div className="absolute bottom-0 left-0 right-0 p-5">
                            {title && (
                                <h3 className="text-white font-bold text-lg mb-1 line-clamp-1">
                                    {title}
                                </h3>
                            )}
                            {price && (
                                <p className="text-white/90 font-bold text-xl">
                                    ¥{price.toLocaleString()}
                                </p>
                            )}
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {tags.slice(0, 3).map((tag) => (
                                        <span
                                            key={tag}
                                            className="px-2 py-0.5 bg-white/20 backdrop-blur-sm rounded-full text-xs text-white"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Like indicator */}
                        {isLiked && (
                            <div className="absolute top-4 left-4">
                                <span className="text-2xl">❤️</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Back */}
                <div
                    className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6"
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                >
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsFlipped(false);
                        }}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
                    >
                        <span className="text-white">✕</span>
                    </motion.button>

                    <div className="h-full flex flex-col text-white">
                        <h3 className="text-xl font-bold mb-4">{title || "Item Details"}</h3>

                        {price && (
                            <div className="mb-4">
                                <p className="text-sm text-white/60">Price</p>
                                <p className="text-2xl font-bold">¥{price.toLocaleString()}</p>
                            </div>
                        )}

                        <div className="mb-4">
                            <p className="text-sm text-white/60 mb-2">Tags</p>
                            <div className="flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="px-3 py-1 bg-white/10 rounded-full text-sm"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div className="mt-auto flex gap-3">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsLiked(true);
                                    onLike?.();
                                }}
                                className="flex-1 py-3 bg-gradient-to-r from-pink-500 to-rose-500 rounded-xl font-bold"
                            >
                                ❤️ Like
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSave?.();
                                }}
                                className="flex-1 py-3 bg-white/10 rounded-xl font-bold"
                            >
                                🔖 Save
                            </motion.button>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Action buttons below card */}
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 flex gap-4">
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onDislike}
                    className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center border-2 border-slate-200"
                >
                    <span className="text-2xl">👎</span>
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                        setIsLiked(true);
                        setShowHeart(true);
                        onLike?.();
                        setTimeout(() => setShowHeart(false), 1000);
                    }}
                    className="w-16 h-16 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 shadow-lg flex items-center justify-center"
                >
                    <span className="text-3xl">❤️</span>
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={onSave}
                    className="w-14 h-14 rounded-full bg-white shadow-lg flex items-center justify-center border-2 border-slate-200"
                >
                    <span className="text-2xl">⭐</span>
                </motion.button>
            </div>
        </motion.div>
    );
}
