"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  FadeInView,
  BREATHE,
} from "@/components/ui/glassmorphism-design";
import DailyInterventionCard from "@/components/stargazer/engine/DailyInterventionCard";
import ExperimentCard from "@/components/stargazer/engine/ExperimentCard";
import DecisionEngineCard from "@/components/stargazer/engine/DecisionEngineCard";
import SelfVsOracleCard from "@/components/stargazer/engine/SelfVsOracleCard";

export default function EngineClient() {
  // globals.css の html,body { height:100% } を解除してスクロール可能にする
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlH = html.style.height;
    const prevBodyH = body.style.height;
    html.style.height = "auto";
    body.style.height = "auto";
    return () => {
      html.style.height = prevHtmlH;
      body.style.height = prevBodyH;
    };
  }, []);

  return (
    <div
      className="mx-auto w-full max-w-lg px-4"
      style={{ paddingTop: BREATHE.lg, paddingBottom: BREATHE.lg }}
    >
      {/* ページタイトル */}
      <FadeInView direction="up">
        <motion.h1
          className="mb-1 text-center text-2xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--sg-font-display, inherit)" }}
        >
          今日の自分
        </motion.h1>
        <p className="mb-8 text-center text-sm opacity-60">
          深層観測が導く、今日の判断と気づき
        </p>
      </FadeInView>

      {/* Section 1: Daily Intervention */}
      <section style={{ marginBottom: BREATHE.md }}>
        <FadeInView direction="up" delay={0.1}>
          <DailyInterventionCard />
        </FadeInView>
      </section>

      {/* Section 2: Experiment — 今週のチャレンジ */}
      <section style={{ marginBottom: BREATHE.md }}>
        <FadeInView direction="up" delay={0.15}>
          <ExperimentCard />
        </FadeInView>
      </section>

      {/* Section 3: Decision Engine — 主体験 */}
      <section style={{ marginBottom: BREATHE.md }}>
        <FadeInView direction="up" delay={0.2}>
          <DecisionEngineCard />
        </FadeInView>
      </section>

      {/* Section 4: Self vs Oracle */}
      <section style={{ marginBottom: BREATHE.md }}>
        <FadeInView direction="up" delay={0.3}>
          <SelfVsOracleCard />
        </FadeInView>
      </section>
    </div>
  );
}
