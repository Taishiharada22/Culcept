import { redirect } from "next/navigation";

export const metadata = {
  title: "顔まわり判定 | Aneurasync",
  description: "顔の特徴を10カテゴリで観測する",
};

export default function FacePhenotypePage() {
  redirect("/body-color/avatar?tab=face");
}
