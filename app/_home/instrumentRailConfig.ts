/**
 * InstrumentRail configuration for the Home page.
 * Extracted to keep AneurasyncHome.tsx focused on orchestration.
 */
import type { InstrumentItem } from "@/components/home/InstrumentRail";
import type { IdentityLiveData } from "@/hooks/useHomeData";

type InstrumentConfigContext = {
  sgData: { observationCount?: number; confidence?: number; archetype?: string; archetypeCode?: string } | null;
  identityLive: IdentityLiveData;
  ptData: { pct: number } | null;
  instrumentUsedToday: Record<string, boolean>;
};

export function buildInstrumentItems(ctx: InstrumentConfigContext): InstrumentItem[] {
  const { sgData, identityLive, ptData, instrumentUsedToday } = ctx;
  const il = identityLive as any;

  return [
    {
      key: "human-os",
      icon: "⚡",
      label: "今日の自分",
      color: "#8B5CF6",
      progress: 0,
      pulse: "strong",
      href: "/stargazer/engine",
      usedToday: instrumentUsedToday.stargazer,
      flyoutPages: [
        {
          title: "中にあるもの",
          status: {
            label: "毎日更新",
            pulseLabel: "強",
            body: "深層観測データから、今日の判断・状態・予測を導くエンジンです。",
          },
          rows: [
            { icon: "🌤", label: "今日の状態", desc: "エネルギーと注意点の推定" },
            { icon: "⚡", label: "判断エンジン", desc: "迷ったら未来の自分に聞く" },
            { icon: "🔮", label: "Self vs Oracle", desc: "自分をどこまで予測できる？" },
          ],
        },
        {
          title: "やること",
          body: "今日の介入を確認し、迷いがあれば判断エンジンに相談。夜は Self vs Oracle の結果入力。",
          subBody: "⏱ 1〜3分 / 💡 日常の判断がそのまま観測になる",
        },
        {
          title: "得られるもの",
          body: "「未来の自分が先に試す」体験。判断精度と自己理解の深化。",
          cta: { label: "今日の自分を見る", href: "/stargazer/engine" },
        },
      ],
    },
    {
      key: "stargazer",
      icon: "🧠",
      label: "Stargazer",
      color: "#6366F1",
      progress: Math.min(100, Math.round(((sgData?.observationCount ?? 0) / 100) * 100)),
      pulse: "strong",
      href: "/stargazer",
      usedToday: instrumentUsedToday.stargazer,
      flyoutPages: [
        {
          title: "中にあるもの",
          status: {
            label: "今日更新",
            pulseLabel: "強",
            body: "いまの思考状態を観測して、判断の変化を更新する中枢です。",
          },
          rows: [
            { icon: "🔭", label: "観測", desc: "100の問いで判断特性を観測" },
            { icon: "⭐", label: "マップ", desc: "4軸のアーキタイプと矛盾パターン" },
            { icon: "📊", label: "日次", desc: "毎日の内面変化の記録と予測" },
            { icon: "📈", label: "成長", desc: "過去の自分との変化の軌跡" },
          ],
        },
        {
          title: "やること",
          body: "質問に直感で答える。正解はありません。",
          subBody: "⏱ 5〜10分 / 💡 途中で中断OK / 📊 進捗は保存されます",
        },
        {
          title: "得られるもの",
          body: "自分でも気づかなかった判断原理と内面の矛盾。「自分って、そういう人間だったのか」という瞬間。",
          progress: {
            current: sgData?.observationCount ?? 0,
            total: 100,
            label: "観測完了",
          },
          cta: { label: "観測する", href: "/stargazer" },
        },
      ],
    },
    {
      key: "origin",
      icon: "📝",
      label: "Origin",
      color: "#EAB308",
      progress: il.origin?.pct ?? 0,
      pulse: "medium",
      href: "/origin",
      usedToday: instrumentUsedToday.origin,
      flyoutPages: [
        {
          title: "中にあるもの",
          status: {
            label: "日々蓄積",
            pulseLabel: "中",
            body: "その日の出来事と感情が履歴として積み上がり、あなたの変化の文脈になります。",
          },
          rows: [
            { icon: "📝", label: "日記", desc: "今日の出来事・感情を記録" },
            { icon: "🗺", label: "地図", desc: "生活圏・行動パターンの可視化" },
            { icon: "🔄", label: "軌跡", desc: "過去の記録から浮かぶ変化の流れ" },
          ],
        },
        {
          title: "やること",
          body: "今日あったことを一言で記録する。感情タグを選ぶ。",
          subBody: "⏱ 1〜3分 / 毎日の記録が力になります",
        },
        {
          title: "得られるもの",
          body: "生活パターンと行動原理が見える。Stargazerの内面観測とクロスして「現実で選ぶもの」と「内面で求めるもの」のズレが浮かぶ。",
          cta: { label: "記録する", href: "/origin" },
        },
      ],
    },
    {
      key: "phenotype",
      icon: "🫀",
      label: "Phenotype",
      color: "#EC4899",
      progress: ptData?.pct ?? 0,
      pulse: (ptData?.pct ?? 0) > 0 ? "none" : "soft",
      href: "/body-color/avatar",
      usedToday: instrumentUsedToday.phenotype,
      flyoutPages: [
        {
          title: "中にあるもの",
          status: {
            label: (ptData?.pct ?? 0) > 0 ? "基礎保持" : "基礎入力",
            pulseLabel: (ptData?.pct ?? 0) > 0 ? undefined : "低",
            body: "顔立ちと身体の基礎データで、似合う提案の精度を長く支える土台です。",
          },
          rows: [
            { icon: "🎨", label: "パーソナルカラー", desc: "肌・髪・瞳の色調分析" },
            { icon: "👤", label: "顔型", desc: "輪郭・バランスの分析" },
            { icon: "📐", label: "骨格", desc: "体型タイプの判定" },
          ],
        },
        {
          title: "やること",
          body: "写真を1枚撮るだけ。一度やれば完了です。",
          subBody: "⏱ 3分 / 📸 カメラ使用",
        },
        {
          title: "得られるもの",
          body: "あなたに似合う色・形がわかる。Genome Cardに身体特性が載る。",
          progress: (ptData?.pct ?? 0) > 0
            ? { current: ptData?.pct ?? 0, total: 100, label: "分析進捗" }
            : undefined,
          cta: { label: "分析する", href: "/body-color/avatar" },
        },
      ],
    },
    {
      key: "calendar",
      icon: "📅",
      label: "Calendar",
      color: "#14B8A6",
      progress: 0,
      pulse: "soft",
      href: "/calendar",
      usedToday: instrumentUsedToday.calendar,
      flyoutPages: [
        {
          title: "中にあるもの",
          status: {
            label: "今日記録",
            pulseLabel: "低",
            body: "その日の服と条件を記録して、提案が現実に合うように育てる場所です。",
          },
          rows: [
            { icon: "☀️", label: "天気連動", desc: "天気×気分×予定でAIが提案" },
            { icon: "📸", label: "記録", desc: "今日着たものを写真・タグで記録" },
            { icon: "📊", label: "傾向", desc: "着こなしパターンの可視化" },
          ],
        },
        {
          title: "やること",
          body: "今日着たものを記録する。写真またはタグで。",
          subBody: "⏱ 1分 / 毎日の積み重ねがStyle DNAに反映",
        },
        {
          title: "得られるもの",
          body: "天気×気分×予定から最適コーデをAIが提案。着こなしパターンがStyle DNAに反映される。",
          cta: { label: "記録する", href: "/calendar" },
        },
      ],
    },
    {
      key: "style",
      icon: "👗",
      label: "Style",
      color: "#A855F7",
      progress: il.style?.pct ?? 0,
      pulse: (il.style?.pct ?? 0) > 0 ? "none" : "soft",
      href: "/my-style?source=aneurasync&mode=sync",
      usedToday: instrumentUsedToday.style,
      flyoutPages: [
        {
          title: "中にあるもの",
          status: {
            label: (il.style?.pct ?? 0) > 0 ? "好み更新" : "好み入力",
            pulseLabel: (il.style?.pct ?? 0) > 0 ? undefined : "低",
            body: "美意識の傾向を増やすほど、提案の方向性と解像度が深くなります。",
          },
          rows: [
            { icon: "🎯", label: "スタイルクイズ", desc: "好みの傾向を判定する問い" },
            { icon: "🧬", label: "Style DNA", desc: "美意識の構造を可視化" },
            { icon: "💡", label: "提案", desc: "DNAに基づくコーデ提案" },
          ],
        },
        {
          title: "やること",
          body: "スタイルクイズに答える。直感で選ぶだけ。",
          subBody: "⏱ 5〜10分 / 一度回答すれば完了",
        },
        {
          title: "得られるもの",
          body: "スタイルDNAがGenome Cardに反映される。自分の美意識の構造がわかる。",
          progress: (il.style?.pct ?? 0) > 0
            ? { current: il.style?.pct ?? 0, total: 100, label: "回答進捗" }
            : undefined,
          cta: { label: "入力する", href: "/my-style?source=aneurasync&mode=sync" },
        },
      ],
    },
  ];
}
