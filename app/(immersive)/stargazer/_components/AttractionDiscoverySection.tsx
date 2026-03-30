// app/stargazer/_components/AttractionDiscoverySection.tsx
// 魅力パターン可視化 — Stated vs Instant の乖離を可視化
"use client";

import { motion } from "framer-motion";
import type { AttractionProfile } from "@/lib/orbiter/types";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";

type Props = {
  attractionProfile: AttractionProfile;
};

export default function AttractionDiscoverySection({
  attractionProfile,
}: Props) {
  const { statedPreferences, instantAttraction, divergences } =
    attractionProfile;

  // Look up axis info
  const getAxisLabels = (axisId: string) => {
    const axisInfo = TRAIT_AXES.find((a) => a.id === axisId);
    return axisInfo
      ? { left: axisInfo.labelLeft, right: axisInfo.labelRight }
      : { left: axisId, right: axisId };
  };

  return (
    <div className="space-y-4">
      <motion.div
        className="card-section py-4 px-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex flex-wrap gap-2">
          <span
            className="text-sm px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(96,165,250,0.12)",
              color: "rgba(53,110,196,0.92)",
            }}
          >
            青 = 自分で言語化している好み
          </span>
          <span
            className="text-sm px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(190,170,110,0.12)",
              color: "rgba(128,104,44,0.92)",
            }}
          >
            金 = 実際のLike/Passから見える反応
          </span>
          <span
            className="text-sm px-2.5 py-1 rounded-full"
            style={{
              background: "rgba(244,114,182,0.12)",
              color: "rgba(181,73,130,0.92)",
            }}
          >
            ピンク = そのズレ
          </span>
        </div>
        <p
          className="mt-3 text-base leading-7"
          style={{ color: "rgba(40,46,70,0.94)" }}
        >
          上から順に、「自覚している好み」「実際に惹かれる軸」「その食い違い」を見ています。
          バーが長いほど、その軸での反応が強いことを表します。
        </p>
      </motion.div>

      {/* Stated Preferences Summary */}
      <motion.div
        className="card-instrument py-4 px-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-sm font-mono-sg"
            style={{ color: "rgba(74,132,214,0.84)", letterSpacing: "0.1em" }}
          >
            STATED
          </span>
          <span
            className="text-sm px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(96,165,250,0.08)",
              color: "rgba(74,132,214,0.84)",
            }}
          >
            自分が思う好み
          </span>
        </div>

        {/* Similarity vs Complementarity bar */}
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span style={{ color: "rgba(42,48,70,0.94)" }}>似た人に安心しやすい</span>
            <span style={{ color: "rgba(42,48,70,0.94)" }}>違う人に惹かれやすい</span>
          </div>
          <div
            className="h-2 rounded-full relative overflow-hidden"
            style={{ background: "rgba(0,0,0,0.04)" }}
          >
            <div
              className="absolute top-0 left-1/2 w-px h-full"
              style={{ background: "rgba(160,170,200,0.15)" }}
            />
            <div
              className="absolute top-0 h-full rounded-full transition-all"
              style={{
                left: "4%",
                width: `${Math.max(8, statedPreferences.similarityVsComplementarity * 92)}%`,
                background:
                  "linear-gradient(90deg, rgba(96,165,250,0.4), rgba(139,92,246,0.4))",
              }}
            />
          </div>
          <p
            className="mt-2 text-sm leading-6"
            style={{ color: "rgba(58,64,86,0.9)" }}
          >
            自分では「似たタイプ」と「補完してくれるタイプ」のどちらを求めているかを示しています。
          </p>
        </div>

        {/* Desired types */}
        {statedPreferences.desiredTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {statedPreferences.desiredTypes.map((t) => (
              <span
                key={t}
                className="text-sm px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(96,165,250,0.06)",
                  border: "1px solid rgba(96,165,250,0.1)",
                  color: "rgba(74,132,214,0.84)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </motion.div>

      {/* Instant Attraction — behavioral pattern */}
      {instantAttraction && (
        <motion.div
          className="card-instrument py-4 px-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-mono-sg"
                style={{
                  color: "rgba(146,118,56,0.84)",
                  letterSpacing: "0.1em",
                }}
              >
                INSTANT
              </span>
              <span
                className="text-sm px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(190,170,110,0.08)",
                  color: "rgba(146,118,56,0.84)",
                }}
              >
                実際に惹かれる傾向
              </span>
            </div>
            <span
              className="text-sm font-mono-sg"
              style={{
                color:
                  instantAttraction.confidence > 0.7
                    ? "rgba(64,184,104,0.84)"
                    : "rgba(86,92,116,0.82)",
              }}
            >
              {Math.round(instantAttraction.confidence * 100)}%
            </span>
          </div>

          {/* Pattern badge */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-sm px-2 py-0.5 rounded"
              style={{
                background:
                  instantAttraction.pattern === "similar"
                    ? "rgba(74,222,128,0.08)"
                    : instantAttraction.pattern === "complementary"
                      ? "rgba(244,114,182,0.08)"
                      : "rgba(139,92,246,0.08)",
                color:
                  instantAttraction.pattern === "similar"
                    ? "rgba(64,184,104,0.84)"
                    : instantAttraction.pattern === "complementary"
                      ? "rgba(210,92,152,0.84)"
                      : "rgba(116,84,198,0.84)",
              }}
            >
              {instantAttraction.pattern === "similar"
                ? "類似型 — 似た人に惹かれる"
                : instantAttraction.pattern === "complementary"
                  ? "補完型 — 違う人に惹かれる"
                  : "混合型 — 軸によって異なる"}
            </span>
          </div>

          {/* Top axes */}
          <div className="space-y-2">
            {instantAttraction.topAxes.slice(0, 5).map((aw, i) => {
              const labels = getAxisLabels(aw.axis);
              const absWeight = Math.abs(aw.weight);
              const preferSide = aw.weight < 0 ? labels.left : labels.right;
              return (
                <motion.div
                  key={aw.axis}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.05 }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-sm"
                      style={{
                        color:
                          absWeight > 0.5
                            ? "rgba(128,104,44,0.94)"
                            : "rgba(42,48,70,0.92)",
                        fontWeight: absWeight > 0.5 ? 600 : 400,
                      }}
                    >
                      {preferSide}
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: "rgba(76,82,106,0.86)" }}
                    >
                      （{labels.left} ↔ {labels.right} のどちら側に反応しやすいか）
                    </span>
                  </div>
                  {/* Weight bar */}
                  <div
                    className="h-1 rounded-full relative overflow-hidden"
                    style={{ background: "rgba(0,0,0,0.03)" }}
                  >
                    <div
                      className="absolute top-0 left-0 h-full rounded-full"
                      style={{
                        width: `${absWeight * 100}%`,
                        background:
                          absWeight > 0.5
                            ? "rgba(190,170,110,0.5)"
                            : absWeight > 0.3
                              ? "rgba(139,92,246,0.4)"
                              : "rgba(120,125,140,0.25)",
                      }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Divergences — where stated ≠ actual */}
      {divergences.length > 0 && (
        <motion.div
          className="card-contradiction py-4 px-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-sm font-mono-sg"
              style={{
                color: "rgba(210,92,152,0.84)",
                letterSpacing: "0.1em",
              }}
            >
              DIVERGENCE
            </span>
            <span
              className="text-sm px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(244,114,182,0.08)",
                color: "rgba(210,92,152,0.84)",
              }}
            >
              思い込み vs 本能
            </span>
          </div>

          <p
            className="text-sm mb-3 leading-[1.7]"
            style={{ color: "rgba(42,48,70,0.92)" }}
          >
            「こういう人が好き」と思っていることと、実際に心が動くパターンが違う場所。
            これを知ることは、自分の本当の欲求を理解する第一歩。
          </p>

          <div className="space-y-3">
            {divergences.map((d, i) => {
              const labels = getAxisLabels(d.axis);
              const statedSide =
                d.statedDirection < 0 ? labels.left : labels.right;
              const actualSide =
                d.actualDirection < 0 ? labels.left : labels.right;
              return (
                <motion.div
                  key={d.axis}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.08 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-sm px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(96,165,250,0.08)",
                        color: "rgba(74,132,214,0.84)",
                      }}
                    >
                      思:{statedSide}
                    </span>
                    <span
                      className="text-sm"
                      style={{ color: "rgba(86,92,116,0.82)" }}
                    >
                      →
                    </span>
                    <span
                      className="text-sm px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(190,170,110,0.08)",
                        color: "rgba(146,118,56,0.84)",
                      }}
                    >
                      実:{actualSide}
                    </span>
                  </div>
                  <p
                    className="text-base leading-[1.7]"
                    style={{ color: "rgba(24,30,50,0.95)" }}
                  >
                    {d.narrative}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* No instant data yet */}
      {!instantAttraction && (
        <motion.div
          className="card-mystery py-4 px-4 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p
            className="text-base"
            style={{ color: "rgba(42,48,70,0.92)" }}
          >
            Rendezvousでの選択を重ねると、あなたの無自覚な魅力パターンが浮かび上がります。
          </p>
          <p
            className="text-sm mt-2"
            style={{ color: "rgba(86,92,116,0.82)" }}
          >
            あと{5}件以上のLike/Pass判断が必要です
          </p>
        </motion.div>
      )}
    </div>
  );
}
