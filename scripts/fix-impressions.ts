// scripts/fix-impressions.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // service role が必要
);

async function deleteImpressions() {
    // 100件ずつ削除（一括削除の制限回避）
    let deleted = 0;
    while (true) {
        const { data, error } = await supabase
            .from('card_impressions')
            .delete()
            .limit(100)
            .select();

        if (error) {
            console.error('Error:', error);
            break;
        }
        if (!data || data.length === 0) break;

        deleted += data.length;
        console.log(`Deleted: ${deleted}`);
    }
    console.log(`Total deleted: ${deleted}`);
}

deleteImpressions();