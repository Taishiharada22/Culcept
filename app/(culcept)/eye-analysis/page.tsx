import EyeAnalysisClient from "./EyeAnalysisClient";

export const metadata = {
  title: "目の分析 | Aneurasync",
  description: "目の形と色を分析します",
};

export default function EyeAnalysisPage() {
  return <EyeAnalysisClient />;
}
