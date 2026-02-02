// scripts/gen_cards_sql.mjs
import fs from "fs";
import path from "path";

const dir = path.join(process.cwd(), "public/cards");
const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));

// card_id は card_100 から採番（好きに変えてOK）
let n = 100;

function toTags(filename) {
    const base = filename.replace(/\.[^.]+$/, "");
    const parts = base.split(/[_\-\s]+/).filter(Boolean);
    return parts.slice(0, 12); // 多すぎ防止
}

for (const f of files) {
    const cardId = `card_${String(n++).padStart(3, "0")}`;
    const imageUrl = `/cards/${f}`;
    const title = f.replace(/\.[^.]+$/, "");
    const tags = toTags(f).map(t => `'${t.replace(/'/g, "''")}'`).join(",");

    console.log(
        `insert into curated_cards (card_id, image_url, title, tags, source, is_active)
values ('${cardId}', '${imageUrl}', '${title.replace(/'/g, "''")}', array[${tags}], 'owned', true)
on conflict (card_id) do nothing;`
    );
}
