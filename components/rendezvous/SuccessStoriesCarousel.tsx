"use client";

/**
 * SuccessStoriesCarousel
 * 承認済みの成功ストーリーをカルーセル表示
 */

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";

type Story = {
  id: string;
  category: string;
  title: string;
  body: string;
  emoji: string;
  created_at: string;
};

const CATEGORY_COLOR: Record<string, string> = {
  romantic: "#EC4899",
  friendship: "#6366F1",
  cocreation: "#F59E0B",
  community: "#8B5CF6",
};

export default function SuccessStoriesCarousel() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/rendezvous/stories")
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setStories(res.stories);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || stories.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 10,
          paddingLeft: 4,
        }}
      >
        <div
          style={{
            width: 2.5,
            height: 12,
            borderRadius: 2,
            background: "#6366F1",
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(30,30,60,0.6)",
            letterSpacing: 0.5,
          }}
        >
          みんなのストーリー
        </span>
      </div>

      <div
        ref={scrollRef}
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          paddingBottom: 4,
          msOverflowStyle: "none",
          scrollbarWidth: "none",
        }}
      >
        {stories.map((story, i) => {
          const color = CATEGORY_COLOR[story.category] ?? "#6366F1";
          return (
            <motion.div
              key={story.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              style={{
                minWidth: 240,
                maxWidth: 240,
                scrollSnapAlign: "start",
                padding: "16px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.8)",
                backdropFilter: "blur(8px)",
                border: `1px solid ${color}12`,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>{story.emoji}</span>
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {story.category}
                </span>
              </div>
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#1E1E3C",
                  marginBottom: 6,
                  lineHeight: 1.4,
                }}
              >
                {story.title}
              </h3>
              <p
                style={{
                  fontSize: 11,
                  color: "rgba(30,30,60,0.55)",
                  lineHeight: 1.6,
                  margin: 0,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {story.body}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
