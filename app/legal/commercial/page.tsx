/**
 * 特定商取引法に基づく表記
 * Commercial Transaction Law disclosure page (server component)
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | Aneurasync",
};

const ROWS: { label: string; value: string }[] = [
  { label: "事業者名", value: "原田大志" },
  { label: "代表者", value: "原田大志" },
  { label: "所在地", value: "千葉県成田市土屋152イグアス103" },
  { label: "連絡先", value: "support@aneurasync.app" },
  { label: "電話番号", value: "07021693735" },
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
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(135deg, #0a0a19 0%, #0f0f2e 100%)",
        padding: "40px 16px 80px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          width: "100%",
        }}
      >
        {/* Back link */}
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            textDecoration: "none",
            marginBottom: 32,
          }}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          トップへ戻る
        </a>

        {/* Title */}
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#fff",
            marginBottom: 8,
          }}
        >
          特定商取引法に基づく表記
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.45)",
            marginBottom: 32,
          }}
        >
          Disclosure under the Specified Commercial Transactions Act
        </p>

        {/* Table card */}
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(24px)",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.1)",
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.label}
                  style={{
                    borderBottom:
                      i < ROWS.length - 1
                        ? "1px solid rgba(255,255,255,0.06)"
                        : "none",
                  }}
                >
                  <th
                    style={{
                      padding: "16px 20px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.7)",
                      textAlign: "left",
                      verticalAlign: "top",
                      whiteSpace: "nowrap",
                      width: "35%",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    {row.label}
                  </th>
                  <td
                    style={{
                      padding: "16px 20px",
                      fontSize: 13,
                      color: "rgba(255,255,255,0.6)",
                      lineHeight: 1.7,
                    }}
                  >
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <p
          style={{
            marginTop: 24,
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            lineHeight: 1.7,
            textAlign: "center",
          }}
        >
          本表記は特定商取引法第11条に基づく表示です。
        </p>
      </div>
    </div>
  );
}
