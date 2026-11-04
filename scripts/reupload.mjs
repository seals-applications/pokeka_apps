// 画像を ASCII キーで Supabase Storage に再アップロードし、cards.image_url を更新する
// 使い方: $env:SUPABASE_SERVICE_KEY="..." ; node scripts/reupload.mjs [--dry]
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL_ = 'https://klkycfdlrboacolcalti.supabase.co';
const BUCKET = 'card-images';
const IMG_DIR = process.env.IMG_DIR || 'C:\\pokekaApp\\image';
const KEY = process.env.SUPABASE_SERVICE_KEY;
const DRY = process.argv.includes('--dry');
if (!KEY) { console.error('SUPABASE_SERVICE_KEY が未設定です'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const asciiKey = (f) => { const m = f.match(/(\d{5,6}_[A-Za-z0-9_\-]+\.jpe?g)$/i); return m ? m[1] : null; };
const idOf = (s) => (s.match(/(\d{5,6})_/) || [])[1];

// 1. ローカル画像を公式IDで索引
const files = (await readdir(IMG_DIR)).filter((f) => /\.jpe?g$/i.test(f));
const local = {};
for (const f of files) { const id = idOf(f); if (id) local[id] = f; }
console.log(`ローカル画像: ${files.length} 件`);

// 2. DB の全行取得
const rows = await (await fetch(`${URL_}/rest/v1/cards?select=id,name,image_url&limit=2000`, { headers: H })).json();
if (!Array.isArray(rows)) { console.error('DB取得失敗', rows); process.exit(1); }
console.log(`DB行: ${rows.length} 件`);

let ok = 0, ng = 0, miss = 0;
for (const row of rows) {
  const id = idOf(decodeURIComponent(row.image_url || ''));
  const file = id && local[id];
  if (!file) { miss++; console.warn('ローカル画像なし', row.id, row.name, row.image_url); continue; }
  const key = asciiKey(file);
  if (!key) { ng++; console.warn('ASCIIキー生成不可', file); continue; }
  const publicUrl = `${URL_}/storage/v1/object/public/${BUCKET}/${key}`;
  if (DRY) { ok++; if (ok <= 5) console.log(`[dry] ${file} -> ${key}`); continue; }

  const up = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${key}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' },
    body: await readFile(join(IMG_DIR, file)),
  });
  if (!up.ok) { ng++; console.error('upload失敗', key, up.status, await up.text()); continue; }

  const pr = await fetch(`${URL_}/rest/v1/cards?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ image_url: publicUrl }),
  });
  if (!pr.ok) { ng++; console.error('DB更新失敗', row.id, pr.status, await pr.text()); continue; }
  ok++;
  if (ok % 50 === 0) console.log(`${ok} 件完了`);
}
console.log(`完了: 成功 ${ok} / 失敗 ${ng} / 画像なし ${miss}`);
