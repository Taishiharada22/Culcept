'use client';

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
            value={`${avgCtr.toFixed(1)}%`}
            icon="❤️"
            trend={avgCtr > 10 ? 'up' : avgCtr < 5 ? 'down' : 'neutral'}
          />
          <KPICard
            title="スワイプ率"
            value={`${avgSwipeRate.toFixed(1)}%`}
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
                style={{ height: `${Math.min(m.ctr * 3, 100)}%` }}
                title={`${m.date}: ${m.ctr.toFixed(1)}%`}
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
            className={`text-sm ${
              trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400'
            }`}
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
