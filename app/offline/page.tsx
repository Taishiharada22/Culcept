// app/offline/page.tsx
export const metadata = {
    title: "オフライン",
    description: "インターネット接続がありません",
};

export default function OfflinePage() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
            <div className="text-center">
                <div className="text-8xl mb-6">📡</div>
                <h1 className="text-2xl font-bold mb-2">オフラインです</h1>
                <p className="text-gray-600 mb-6">
                    インターネット接続を確認してください
                </p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-purple-500 text-white rounded-full font-medium hover:bg-purple-600 transition-colors"
                >
                    再読み込み
                </button>

                <div className="mt-12 text-left max-w-sm mx-auto">
                    <h2 className="font-semibold mb-3">オフラインでも使える機能:</h2>
                    <ul className="space-y-2 text-sm text-gray-600">
                        <li className="flex items-center gap-2">
                            <span className="text-green-500">✓</span>
                            キャッシュされたページの閲覧
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-green-500">✓</span>
                            お気に入りの確認
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-gray-400">✗</span>
                            新しいアイテムの読み込み
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="text-gray-400">✗</span>
                            いいね/スキップの送信
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
