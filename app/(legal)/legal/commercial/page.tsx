import type { Metadata } from "next";
import {
  LegalPage,
  LegalParagraph,
  LegalSection,
  LegalTable,
} from "@/app/legal/_components/LegalPage";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | Aneurasync",
  description: "Aneurasync の特定商取引法に基づく表記",
};

const ROWS: { label: string; value: string }[] = [
  { label: "事業者名", value: "（※事業者名を入力）" },
  { label: "代表者", value: "（※代表者名を入力）" },
  { label: "所在地", value: "（※住所を入力）" },
  { label: "連絡先", value: "support@aneurasync.app" },
  { label: "販売価格", value: "基本利用：無料 / 有料プラン：別途アプリ内に表示" },
  { label: "支払方法", value: "クレジットカード決済（Stripe）" },
  { label: "支払時期", value: "購入手続き完了時" },
  { label: "商品の引渡し時期", value: "購入手続き完了後、即時利用可能" },
  {
    label: "返品・キャンセル",
    value: "デジタルコンテンツのため、購入後の返品・返金は原則不可",
  },
  {
    label: "動作環境",
    value: "モダンブラウザ（Chrome, Safari, Firefox, Edge最新版）",
  },
];

export default function CommercialTransactionPage() {
  return (
    <LegalPage
      title="特定商取引法に基づく表記"
      description="Aneurasync の有料機能および関連サービスに関する表示事項です。"
    >
      <LegalSection title="表示事項" first>
        <LegalTable rows={ROWS} />
      </LegalSection>
      <LegalSection title="補足">
        <LegalParagraph>
          本表記は特定商取引法第11条に基づく表示です。
        </LegalParagraph>
      </LegalSection>
    </LegalPage>
  );
}
