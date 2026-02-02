'use client';

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
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
      >
        <span className="text-gray-500">🎯</span>
        <span className="font-medium">{current.label}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
                className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                  currentAlgorithm === algo.value
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-gray-50'
                }`}
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
