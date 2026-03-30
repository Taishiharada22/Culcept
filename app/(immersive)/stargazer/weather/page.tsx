// app/stargazer/weather/page.tsx
// Inner Weather — 心の天気を観測する
import type { Metadata } from "next";
import WeatherClient from "./WeatherClient";
import FeatureGateGuard from "../_shared/FeatureGateGuard";

export const metadata: Metadata = {
  title: "Inner Weather — 心の天気",
  description:
    "あなたの内なる天気を観測する。快晴も嵐も、すべてがあなたの大切な気象データ。",
};

export default function InnerWeatherPage() {
  return (
    <FeatureGateGuard feature="inner_weather">
      <WeatherClient />
    </FeatureGateGuard>
  );
}
