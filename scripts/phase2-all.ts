/**
 * Phase 2: データ量増加 & UI改善
 *
 * 2-1. カード追加（179 → 300枚）
 * 2-2. アルゴリズム切り替えUI追加 (コード生成)
 * 2-3. 推薦精度ダッシュボード作成 (コード生成)
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================
// 2-1. カード追加
// ============================================================

// 追加するカードのテンプレート（多様なカテゴリ）
const CARD_TEMPLATES = {
  // ファッション - アウター
  outerwear: [
    { base: 'bomber_jacket', colors: ['black', 'navy', 'olive', 'burgundy'], tags: ['jacket', 'outerwear', 'bomber', 'casual'] },
    { base: 'trench_coat', colors: ['beige', 'black', 'navy', 'camel'], tags: ['coat', 'outerwear', 'trench', 'formal'] },
    { base: 'puffer_jacket', colors: ['black', 'white', 'red', 'navy'], tags: ['jacket', 'outerwear', 'puffer', 'winter'] },
    { base: 'blazer', colors: ['black', 'navy', 'grey', 'brown'], tags: ['blazer', 'outerwear', 'formal', 'business'] },
    { base: 'cardigan', colors: ['cream', 'grey', 'navy', 'brown'], tags: ['cardigan', 'outerwear', 'knit', 'casual'] },
    { base: 'hoodie', colors: ['black', 'grey', 'white', 'navy'], tags: ['hoodie', 'outerwear', 'casual', 'streetwear'] },
    { base: 'windbreaker', colors: ['black', 'navy', 'red', 'green'], tags: ['jacket', 'outerwear', 'windbreaker', 'sport'] },
    { base: 'varsity_jacket', colors: ['black', 'navy', 'red', 'green'], tags: ['jacket', 'outerwear', 'varsity', 'casual'] },
  ],
  // ファッション - トップス
  tops: [
    { base: 'oxford_shirt', colors: ['white', 'blue', 'pink', 'grey'], tags: ['shirt', 'tops', 'oxford', 'formal'] },
    { base: 'flannel_shirt', colors: ['red', 'blue', 'green', 'grey'], tags: ['shirt', 'tops', 'flannel', 'casual'] },
    { base: 'polo_shirt', colors: ['white', 'navy', 'black', 'green'], tags: ['shirt', 'tops', 'polo', 'casual'] },
    { base: 'henley', colors: ['white', 'grey', 'navy', 'brown'], tags: ['shirt', 'tops', 'henley', 'casual'] },
    { base: 'turtleneck', colors: ['black', 'cream', 'grey', 'navy'], tags: ['sweater', 'tops', 'turtleneck', 'formal'] },
    { base: 'crew_sweater', colors: ['grey', 'navy', 'cream', 'burgundy'], tags: ['sweater', 'tops', 'crew', 'casual'] },
    { base: 'v_neck_sweater', colors: ['black', 'grey', 'navy', 'brown'], tags: ['sweater', 'tops', 'vneck', 'casual'] },
    { base: 'graphic_tee', colors: ['black', 'white', 'grey', 'navy'], tags: ['tshirt', 'tops', 'graphic', 'streetwear'] },
  ],
  // ファッション - ボトムス
  bottoms: [
    { base: 'chinos', colors: ['khaki', 'navy', 'olive', 'grey'], tags: ['pants', 'bottoms', 'chinos', 'casual'] },
    { base: 'joggers', colors: ['black', 'grey', 'navy', 'olive'], tags: ['pants', 'bottoms', 'joggers', 'sport'] },
    { base: 'cargo_pants', colors: ['khaki', 'olive', 'black', 'brown'], tags: ['pants', 'bottoms', 'cargo', 'utility'] },
    { base: 'slim_jeans', colors: ['indigo', 'black', 'grey', 'light_wash'], tags: ['jeans', 'bottoms', 'slim', 'denim'] },
    { base: 'straight_jeans', colors: ['indigo', 'black', 'grey', 'vintage'], tags: ['jeans', 'bottoms', 'straight', 'denim'] },
    { base: 'shorts', colors: ['khaki', 'navy', 'olive', 'grey'], tags: ['shorts', 'bottoms', 'casual', 'summer'] },
    { base: 'dress_pants', colors: ['black', 'navy', 'grey', 'charcoal'], tags: ['pants', 'bottoms', 'dress', 'formal'] },
    { base: 'corduroy_pants', colors: ['brown', 'olive', 'navy', 'cream'], tags: ['pants', 'bottoms', 'corduroy', 'casual'] },
  ],
  // ファッション - シューズ
  footwear: [
    { base: 'sneakers', colors: ['white', 'black', 'grey', 'navy'], tags: ['sneakers', 'footwear', 'casual', 'sport'] },
    { base: 'leather_boots', colors: ['black', 'brown', 'tan', 'burgundy'], tags: ['boots', 'footwear', 'leather', 'formal'] },
    { base: 'chelsea_boots', colors: ['black', 'brown', 'suede_tan', 'grey'], tags: ['boots', 'footwear', 'chelsea', 'casual'] },
    { base: 'loafers', colors: ['black', 'brown', 'burgundy', 'navy'], tags: ['loafers', 'footwear', 'formal', 'classic'] },
    { base: 'oxford_shoes', colors: ['black', 'brown', 'tan', 'burgundy'], tags: ['oxford', 'footwear', 'formal', 'dress'] },
    { base: 'canvas_shoes', colors: ['white', 'black', 'navy', 'red'], tags: ['canvas', 'footwear', 'casual', 'summer'] },
  ],
  // アクセサリー
  accessories: [
    { base: 'leather_belt', colors: ['black', 'brown', 'tan', 'navy'], tags: ['belt', 'accessories', 'leather', 'classic'] },
    { base: 'watch', colors: ['silver', 'gold', 'black', 'rose_gold'], tags: ['watch', 'accessories', 'timepiece', 'classic'] },
    { base: 'sunglasses', colors: ['black', 'tortoise', 'gold', 'silver'], tags: ['sunglasses', 'accessories', 'eyewear', 'classic'] },
    { base: 'scarf', colors: ['grey', 'navy', 'camel', 'burgundy'], tags: ['scarf', 'accessories', 'knit', 'winter'] },
    { base: 'beanie', colors: ['black', 'grey', 'navy', 'cream'], tags: ['beanie', 'accessories', 'knit', 'winter'] },
    { base: 'baseball_cap', colors: ['black', 'navy', 'white', 'khaki'], tags: ['cap', 'accessories', 'casual', 'sport'] },
  ],
  // テック
  tech: [
    { base: 'laptop_sleeve', colors: ['black', 'grey', 'navy', 'brown'], tags: ['tech', 'accessories', 'laptop', 'work'] },
    { base: 'phone_case', colors: ['black', 'clear', 'navy', 'leather'], tags: ['tech', 'accessories', 'phone', 'protection'] },
    { base: 'wireless_earbuds', colors: ['white', 'black', 'navy', 'pink'], tags: ['tech', 'audio', 'earbuds', 'wireless'] },
    { base: 'smart_watch', colors: ['black', 'silver', 'gold', 'pink'], tags: ['tech', 'watch', 'smart', 'fitness'] },
  ],
  // バッグ
  bags: [
    { base: 'backpack', colors: ['black', 'navy', 'olive', 'grey'], tags: ['backpack', 'bags', 'casual', 'travel'] },
    { base: 'messenger_bag', colors: ['black', 'brown', 'navy', 'olive'], tags: ['messenger', 'bags', 'work', 'casual'] },
    { base: 'tote_bag', colors: ['canvas', 'black', 'navy', 'brown'], tags: ['tote', 'bags', 'casual', 'everyday'] },
    { base: 'duffel_bag', colors: ['black', 'navy', 'olive', 'grey'], tags: ['duffel', 'bags', 'travel', 'sport'] },
    { base: 'briefcase', colors: ['black', 'brown', 'tan', 'navy'], tags: ['briefcase', 'bags', 'work', 'formal'] },
  ],
};

async function addCards(targetCount: number = 300) {
  console.log('\n' + '='.repeat(60));
  console.log('📦 Phase 2-1: カード追加');
  console.log('='.repeat(60));

  // 現在のカード数を取得
  const { count: currentCount } = await supabase
    .from('curated_cards')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log(`\n📊 現在のカード数: ${currentCount}`);
  console.log(`📊 目標カード数: ${targetCount}`);

  const cardsToAdd = targetCount - (currentCount || 0);
  if (cardsToAdd <= 0) {
    console.log('✅ すでに目標数に達しています');
    return;
  }

  console.log(`📊 追加予定: ${cardsToAdd}枚\n`);

  // 既存のcard_idを取得
  const { data: existingCards } = await supabase
    .from('curated_cards')
    .select('card_id');
  const existingIds = new Set(existingCards?.map(c => c.card_id) || []);

  // 新規カードを生成
  const newCards: Array<{ card_id: string; image_url: string; tags: string[]; is_active: boolean }> = [];

  for (const [category, templates] of Object.entries(CARD_TEMPLATES)) {
    for (const template of templates) {
      for (const color of template.colors) {
        const cardId = `${template.base}_${color}`.replace(/\s+/g, '_').toLowerCase();

        // 既存のカードはスキップ
        if (existingIds.has(cardId)) continue;

        // 目標数に達したら終了
        if (newCards.length >= cardsToAdd) break;

        newCards.push({
          card_id: cardId,
          image_url: `/cards/${cardId}.png`, // プレースホルダー画像URL
          tags: [...template.tags, color, category],
          is_active: true,
        });
      }
      if (newCards.length >= cardsToAdd) break;
    }
    if (newCards.length >= cardsToAdd) break;
  }

  if (newCards.length === 0) {
    console.log('⚠️ 追加するカードがありません');
    return;
  }

  // バッチでインサート
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < newCards.length; i += batchSize) {
    const batch = newCards.slice(i, i + batchSize);
    const { error } = await supabase
      .from('curated_cards')
      .insert(batch);

    if (error) {
      console.error(`❌ バッチ ${i / batchSize + 1} エラー:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`✅ バッチ ${i / batchSize + 1}: ${batch.length}枚追加`);
    }
  }

  // 最終確認
  const { count: finalCount } = await supabase
    .from('curated_cards')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log(`\n📊 最終カード数: ${finalCount}`);
  console.log(`✅ ${inserted}枚のカードを追加しました！`);
}

// ============================================================
// 2-2. アルゴリズム切り替えUI
// ============================================================

async function createAlgorithmSwitcherUI() {
  console.log('\n' + '='.repeat(60));
  console.log('🎛️  Phase 2-2: アルゴリズム切り替えUI');
  console.log('='.repeat(60));

  const componentPath = '/Users/haradataishi/Aneurasync/app/components/AlgorithmSwitcher.tsx';

  const componentCode = `'use client';

import { useState, useEffect } from 'react';

export type Algorithm = 'diversity' | 'popularity' | 'random' | 'hybrid' | 'collaborative';

interface AlgorithmSwitcherProps {
  onAlgorithmChange?: (algorithm: Algorithm) => void;
  className?: string;
}

const ALGORITHMS: { value: Algorithm; label: string; description: string }[] = [
  { value: 'diversity', label: '多様性重視', description: '様々なカテゴリからバランスよく推薦' },
  { value: 'popularity', label: '人気順', description: '多くのユーザーに支持されたアイテム' },
  { value: 'random', label: 'ランダム', description: '完全ランダムで新しい発見を' },
  { value: 'hybrid', label: 'ハイブリッド', description: '複数アルゴリズムの組み合わせ' },
  { value: 'collaborative', label: '協調フィルタリング', description: '似たユーザーの好みを参考に' },
];

export function AlgorithmSwitcher({ onAlgorithmChange, className = '' }: AlgorithmSwitcherProps) {
  const [currentAlgorithm, setCurrentAlgorithm] = useState<Algorithm>('hybrid');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // ローカルストレージから復元
    const saved = localStorage.getItem('rec_algorithm') as Algorithm | null;
    if (saved && ALGORITHMS.some(a => a.value === saved)) {
      setCurrentAlgorithm(saved);
    }
  }, []);

  const handleSelect = (algorithm: Algorithm) => {
    setCurrentAlgorithm(algorithm);
    localStorage.setItem('rec_algorithm', algorithm);
    setIsOpen(false);
    onAlgorithmChange?.(algorithm);
  };

  const current = ALGORITHMS.find(a => a.value === currentAlgorithm)!;

  return (
    <div className={\`relative \${className}\`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
      >
        <span className="text-gray-500">🎯</span>
        <span className="font-medium">{current.label}</span>
        <svg
          className={\`w-4 h-4 transition-transform \${isOpen ? 'rotate-180' : ''}\`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-lg shadow-lg border z-50">
          <div className="p-2">
            <p className="text-xs text-gray-500 px-2 py-1">推薦アルゴリズム</p>
            {ALGORITHMS.map((algo) => (
              <button
                key={algo.value}
                onClick={() => handleSelect(algo.value)}
                className={\`w-full text-left px-3 py-2 rounded-md transition-colors \${
                  currentAlgorithm === algo.value
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-gray-50'
                }\`}
              >
                <div className="font-medium text-sm">{algo.label}</div>
                <div className="text-xs text-gray-500">{algo.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AlgorithmSwitcher;
`;

  fs.writeFileSync(componentPath, componentCode);
  console.log(`✅ コンポーネント作成: ${componentPath}`);

  // /start ページにインポートする指示
  console.log('\n📝 /start ページへの統合手順:');
  console.log('1. import { AlgorithmSwitcher } from "@/app/components/AlgorithmSwitcher"');
  console.log('2. <AlgorithmSwitcher onAlgorithmChange={handleAlgorithmChange} /> を追加');
  console.log('3. APIリクエストにalgorithmパラメータを追加');
}

// ============================================================
// 2-3. 推薦精度ダッシュボード
// ============================================================

async function createMetricsDashboard() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Phase 2-3: 推薦精度ダッシュボード');
  console.log('='.repeat(60));

  // admin/metrics ディレクトリ作成
  const metricsDir = '/Users/haradataishi/Aneurasync/app/admin/metrics';
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }

  const dashboardCode = `'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface DailyMetrics {
  date: string;
  impressions: number;
  actions: number;
  saves: number;
  skips: number;
  ctr: number;
  swipeRate: number;
  noCardsRate: number;
}

export default function MetricsDashboard() {
  const [metrics, setMetrics] = useState<DailyMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(7);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchMetrics();
  }, [dateRange]);

  async function fetchMetrics() {
    setLoading(true);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - dateRange);

    // インプレッション取得
    const { data: impressions } = await supabase
      .from('recommendation_impressions')
      .select('created_at, id')
      .gte('created_at', startDate.toISOString());

    // アクション取得
    const { data: actions } = await supabase
      .from('recommendation_actions')
      .select('created_at, action')
      .gte('created_at', startDate.toISOString());

    // 日別集計
    const dailyData: Record<string, DailyMetrics> = {};

    impressions?.forEach(imp => {
      const date = imp.created_at.split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = {
          date,
          impressions: 0,
          actions: 0,
          saves: 0,
          skips: 0,
          ctr: 0,
          swipeRate: 0,
          noCardsRate: 0,
        };
      }
      dailyData[date].impressions++;
    });

    actions?.forEach(act => {
      const date = act.created_at.split('T')[0];
      if (!dailyData[date]) return;
      dailyData[date].actions++;
      if (act.action === 'save') dailyData[date].saves++;
      if (act.action === 'skip') dailyData[date].skips++;
    });

    // KPI計算
    Object.values(dailyData).forEach(d => {
      d.ctr = d.impressions > 0 ? (d.saves / d.impressions) * 100 : 0;
      d.swipeRate = d.impressions > 0 ? (d.actions / d.impressions) * 100 : 0;
    });

    const sortedMetrics = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
    setMetrics(sortedMetrics);
    setLoading(false);
  }

  const totals = metrics.reduce(
    (acc, m) => ({
      impressions: acc.impressions + m.impressions,
      actions: acc.actions + m.actions,
      saves: acc.saves + m.saves,
      skips: acc.skips + m.skips,
    }),
    { impressions: 0, actions: 0, saves: 0, skips: 0 }
  );

  const avgCtr = totals.impressions > 0 ? (totals.saves / totals.impressions) * 100 : 0;
  const avgSwipeRate = totals.impressions > 0 ? (totals.actions / totals.impressions) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">📊 推薦精度ダッシュボード</h1>

        {/* 期間選択 */}
        <div className="mb-6">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="px-4 py-2 border rounded-lg"
          >
            <option value={7}>過去7日間</option>
            <option value={14}>過去14日間</option>
            <option value={30}>過去30日間</option>
          </select>
        </div>

        {/* KPIカード */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <KPICard
            title="総インプレッション"
            value={totals.impressions.toLocaleString()}
            icon="👀"
          />
          <KPICard
            title="CTR (いいね率)"
            value={\`\${avgCtr.toFixed(1)}%\`}
            icon="❤️"
            trend={avgCtr > 10 ? 'up' : avgCtr < 5 ? 'down' : 'neutral'}
          />
          <KPICard
            title="スワイプ率"
            value={\`\${avgSwipeRate.toFixed(1)}%\`}
            icon="👆"
          />
          <KPICard
            title="総アクション"
            value={totals.actions.toLocaleString()}
            icon="⚡"
          />
        </div>

        {/* 日別グラフ */}
        <div className="bg-white rounded-xl shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">日別推移</h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">日付</th>
                    <th className="text-right py-2">インプレッション</th>
                    <th className="text-right py-2">アクション</th>
                    <th className="text-right py-2">いいね</th>
                    <th className="text-right py-2">スキップ</th>
                    <th className="text-right py-2">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.date} className="border-b hover:bg-gray-50">
                      <td className="py-2">{m.date}</td>
                      <td className="text-right">{m.impressions}</td>
                      <td className="text-right">{m.actions}</td>
                      <td className="text-right text-green-600">{m.saves}</td>
                      <td className="text-right text-red-600">{m.skips}</td>
                      <td className="text-right font-medium">{m.ctr.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 簡易バーチャート */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-xl font-semibold mb-4">CTR推移</h2>
          <div className="flex items-end gap-1 h-32">
            {metrics.map((m) => (
              <div
                key={m.date}
                className="flex-1 bg-blue-500 rounded-t hover:bg-blue-600 transition-colors"
                style={{ height: \`\${Math.min(m.ctr * 3, 100)}%\` }}
                title={\`\${m.date}: \${m.ctr.toFixed(1)}%\`}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>{metrics[0]?.date || '-'}</span>
            <span>{metrics[metrics.length - 1]?.date || '-'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({
  title,
  value,
  icon,
  trend,
}: {
  title: string;
  value: string;
  icon: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {trend && (
          <span
            className={\`text-sm \${
              trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400'
            }\`}
          >
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
      <div className="mt-2">
        <p className="text-gray-500 text-sm">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}
`;

  fs.writeFileSync(path.join(metricsDir, 'page.tsx'), dashboardCode);
  console.log(`✅ ダッシュボード作成: ${metricsDir}/page.tsx`);
  console.log('\n📝 アクセス方法: http://localhost:3000/admin/metrics');
}

// ============================================================
// メイン実行
// ============================================================

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 Phase 2: データ量増加 & UI改善');
  console.log('='.repeat(60));

  try {
    // 2-1. カード追加
    await addCards(300);

    // 2-2. アルゴリズム切り替えUI
    await createAlgorithmSwitcherUI();

    // 2-3. 推薦精度ダッシュボード
    await createMetricsDashboard();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Phase 2 完了！');
    console.log('='.repeat(60));
    console.log('\n📝 次のステップ:');
    console.log('1. npm run dev でサーバー起動');
    console.log('2. /start ページにAlgorithmSwitcherを統合');
    console.log('3. /admin/metrics でダッシュボード確認');
  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  }
}

main();
