/**
 * Phase 2-I 拡張: Brand Icon Map — anchor.locationText から brand-specific icon を選ぶ
 *
 * 設計思想:
 *   - locationText 内の brand keyword 検出で chain identity icon を選択
 *   - 該当なし → null (= 呼出側で CategoryIcon にフォールバック)
 *   - 商標 logo を直接コピーせず、 brand color + 抽象 silhouette で識別性
 *   - Phase 2-H の EXPLICIT_PLACE_KEYWORDS と keyword 共通基盤
 *
 * 不変原則:
 *   - sensitive anchor では本 map を使わず、 CategorySensitiveIcon を優先 (= privacy)
 *   - pure (= no fetch、 入力 mutate なし、 deterministic)
 *   - keyword は集中保守、 priority 順 (= 最初 match を返す)
 *
 * Privacy:
 *   - brand icon 選択は client side のみ、 外部送信なし
 *   - sensitive 系 (= 医療含む) は brand icon を出さず category sensitive icon 優先
 */

import * as React from "react";

import {
  BrandStarbucksIcon,
  BrandDoutorIcon,
  BrandTullysIcon,
  BrandKomedaIcon,
  BrandMcDonaldsIcon,
  BrandMosBurgerIcon,
  BrandKfcIcon,
  BrandSubwayIcon,
  BrandYoshinoyaIcon,
  BrandSukiyaIcon,
  BrandMatsuyaIcon,
  BrandSevenElevenIcon,
  BrandLawsonIcon,
  BrandFamilyMartIcon,
  BrandStationIcon,
  BrandAirportIcon,
  BrandHospitalIcon,
  BrandSalonIcon,
  BrandBankIcon,
  BrandDepartmentStoreIcon,
  type BrandIconProps,
} from "@/components/ui/icons/brand";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BrandIconEntry {
  /** brand 識別子 (= debug / test 用) */
  brand: string;
  /** locationText が含むと判定 trigger する keyword 群 */
  keywords: ReadonlyArray<string>;
  /** 対応する React component */
  icon: React.ComponentType<BrandIconProps>;
  /** brand 表示名 (= aria-label / title 用) */
  displayName: string;
}

/**
 * Brand keyword → icon mapping (priority 順)。
 *
 * 順序設計:
 *   - 長い / 具体的な keyword を先に (= 「スターバックス」 を 「スタバ」 より優先評価)
 *   - 同 brand の主な name と略称を 1 entry にまとめる
 */
export const BRAND_ICON_KEYWORDS: ReadonlyArray<BrandIconEntry> = [
  // ─── Coffee chains ───
  {
    brand: "starbucks",
    keywords: ["スターバックス", "スタバ", "Starbucks", "STARBUCKS"],
    icon: BrandStarbucksIcon,
    displayName: "スターバックス",
  },
  {
    brand: "doutor",
    keywords: ["ドトール", "Doutor", "DOUTOR"],
    icon: BrandDoutorIcon,
    displayName: "ドトール",
  },
  {
    brand: "tullys",
    keywords: ["タリーズ", "Tully", "TULLY"],
    icon: BrandTullysIcon,
    displayName: "タリーズ",
  },
  {
    brand: "komeda",
    keywords: ["コメダ", "KOMEDA"],
    icon: BrandKomedaIcon,
    displayName: "コメダ珈琲店",
  },

  // ─── Fast food ───
  {
    brand: "mcdonalds",
    keywords: ["マクドナルド", "マクド", "マック", "McDonald", "MCDONALD"],
    icon: BrandMcDonaldsIcon,
    displayName: "マクドナルド",
  },
  {
    brand: "mosburger",
    keywords: ["モスバーガー", "モス", "MOS"],
    icon: BrandMosBurgerIcon,
    displayName: "モスバーガー",
  },
  {
    brand: "kfc",
    keywords: ["ケンタッキー", "KFC", "ケンタ"],
    icon: BrandKfcIcon,
    displayName: "ケンタッキー",
  },
  {
    brand: "subway",
    keywords: ["サブウェイ", "Subway", "SUBWAY"],
    icon: BrandSubwayIcon,
    displayName: "サブウェイ",
  },

  // ─── 牛丼 ───
  {
    brand: "yoshinoya",
    keywords: ["吉野家", "Yoshinoya"],
    icon: BrandYoshinoyaIcon,
    displayName: "吉野家",
  },
  {
    brand: "sukiya",
    keywords: ["すき家", "Sukiya"],
    icon: BrandSukiyaIcon,
    displayName: "すき家",
  },
  {
    brand: "matsuya",
    keywords: ["松屋", "Matsuya"],
    icon: BrandMatsuyaIcon,
    displayName: "松屋",
  },

  // ─── Convenience stores ───
  {
    brand: "seven_eleven",
    keywords: ["セブンイレブン", "セブン-イレブン", "セブン", "7-Eleven", "7-ELEVEN"],
    icon: BrandSevenElevenIcon,
    displayName: "セブンイレブン",
  },
  {
    brand: "lawson",
    keywords: ["ローソン", "Lawson", "LAWSON"],
    icon: BrandLawsonIcon,
    displayName: "ローソン",
  },
  {
    brand: "family_mart",
    keywords: ["ファミリーマート", "ファミマ", "FamilyMart", "FAMILYMART"],
    icon: BrandFamilyMartIcon,
    displayName: "ファミリーマート",
  },

  // ─── Transit ───
  {
    brand: "airport",
    keywords: ["空港", "ターミナル", "Airport", "AIRPORT"],
    icon: BrandAirportIcon,
    displayName: "空港",
  },
  {
    brand: "station",
    keywords: ["駅", "Station", "STATION"],
    icon: BrandStationIcon,
    displayName: "駅",
  },

  // ─── Medical / Services ───
  {
    brand: "hospital",
    keywords: ["病院", "総合病院", "大学病院", "クリニック", "医院", "歯科", "歯医者"],
    icon: BrandHospitalIcon,
    displayName: "病院・クリニック",
  },
  {
    brand: "salon",
    keywords: ["美容院", "美容室", "ヘアサロン", "サロン", "Salon"],
    icon: BrandSalonIcon,
    displayName: "美容院",
  },

  // ─── Financial / Commercial ───
  {
    brand: "bank",
    keywords: ["銀行", "信用金庫", "信金", "ATM", "Bank"],
    icon: BrandBankIcon,
    displayName: "銀行",
  },
  {
    brand: "department_store",
    keywords: ["百貨店", "デパート", "三越", "高島屋", "伊勢丹", "西武", "東武", "大丸", "松坂屋"],
    icon: BrandDepartmentStoreIcon,
    displayName: "百貨店",
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PickedBrandIcon {
  icon: React.ComponentType<BrandIconProps>;
  /** brand display 名 (= aria-label / title に使用) */
  displayName: string;
  /** brand 識別子 (= debug / test 用) */
  brand: string;
}

/**
 * locationText から brand-specific icon を選択。
 *
 * @param locationText anchor.locationText (= canonical or free text)
 * @returns 該当 brand icon entry または null (= category fallback)
 */
export function pickBrandIcon(
  locationText: string | null | undefined,
): PickedBrandIcon | null {
  if (!locationText) return null;
  const text = locationText.trim();
  if (!text) return null;

  for (const entry of BRAND_ICON_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (text.includes(keyword)) {
        return {
          icon: entry.icon,
          displayName: entry.displayName,
          brand: entry.brand,
        };
      }
    }
  }
  return null;
}
