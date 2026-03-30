"use client";

/**
 * SceneRecommendSection
 * おすすめシーン — 横スクロールカード形式で最大3シーンを表示
 * bestFirst にハイライト + avoidScenes 表示
 */

import type { SceneRecommendationResult, SceneType } from "@/lib/orbiter/types";

const SCENE_ICON: Record<SceneType, string> = {
  cafe: "☕",
  walk: "🚶",
  activity: "🏃",
  group: "👥",
  creative: "🎨",
  food: "🍽️",
  nature: "🌿",
  online: "💻",
  event: "🎪",
};

type Props = {
  sceneRecommendation: SceneRecommendationResult;
};

export default function SceneRecommendSection({ sceneRecommendation }: Props) {
  const { scenes, bestFirst, avoidScenes } = sceneRecommendation;

  if (scenes.length === 0) return null;

  return (
    <div
      style={{
        padding: "20px 16px",
        borderRadius: 16,
        background: "rgba(255, 255, 255, 0.6)",
        border: "1px solid rgba(30, 30, 60, 0.06)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 2.5,
            height: 12,
            borderRadius: 2,
            background: "#3B82F6",
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(30, 30, 60, 0.7)",
            letterSpacing: 0.5,
          }}
        >
          おすすめシーン
        </span>
      </div>

      {/* Horizontal scroll cards */}
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          paddingBottom: 8,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {scenes.map((scene, i) => {
          const isBest = scene.type === bestFirst.type;
          return (
            <div
              key={scene.type}
              style={{
                minWidth: 200,
                flex: "0 0 auto",
                padding: "14px",
                borderRadius: 14,
                background: isBest
                  ? "rgba(59, 130, 246, 0.06)"
                  : "rgba(255, 255, 255, 0.8)",
                border: isBest
                  ? "1px solid rgba(59, 130, 246, 0.15)"
                  : "1px solid rgba(30, 30, 60, 0.05)",
                position: "relative",
              }}
            >
              {/* Best badge */}
              {isBest && (
                <span
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    fontSize: 8,
                    fontWeight: 700,
                    color: "#3B82F6",
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: "rgba(59, 130, 246, 0.1)",
                    letterSpacing: 0.5,
                  }}
                >
                  イチオシ
                </span>
              )}

              {/* Icon + Title */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 20 }}>
                  {SCENE_ICON[scene.type] ?? "📍"}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "rgba(30, 30, 60, 0.8)",
                  }}
                >
                  {scene.title}
                </span>
              </div>

              {/* Description */}
              <p
                style={{
                  fontSize: 11,
                  color: "rgba(30, 30, 60, 0.55)",
                  lineHeight: 1.6,
                  margin: "0 0 8px",
                }}
              >
                {scene.description}
              </p>

              {/* Reason */}
              <p
                style={{
                  fontSize: 10,
                  color: "#3B82F6",
                  margin: 0,
                  fontWeight: 500,
                }}
              >
                💡 {scene.reason}
              </p>

              {/* Confidence bar */}
              <div
                style={{
                  marginTop: 8,
                  height: 3,
                  borderRadius: 2,
                  background: "rgba(59, 130, 246, 0.1)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round(scene.confidenceLevel * 100)}%`,
                    borderRadius: 2,
                    background: "#3B82F6",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Avoid scenes */}
      {avoidScenes.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "rgba(30, 30, 60, 0.4)",
              letterSpacing: 0.3,
            }}
          >
            避けた方がいいかも
          </span>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 6,
            }}
          >
            {avoidScenes.map((avoid) => (
              <span
                key={avoid.type}
                style={{
                  fontSize: 10,
                  color: "rgba(30, 30, 60, 0.45)",
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "rgba(239, 68, 68, 0.04)",
                  border: "1px solid rgba(239, 68, 68, 0.08)",
                }}
              >
                {SCENE_ICON[avoid.type]} {avoid.reason}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
