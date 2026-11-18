// サイドメニュー（4グループ）の確認：トップ URL・個別ページの URL・グループの開閉・選択表示・既存画面への遷移・アイコンを、実際のブラウザ（ヘッドレス Chrome、DevTools Protocol）で確かめる
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SHOT = process.argv[2];
// 使い方：サーバーと画面（npm run api、npm run dev）を起動してから `npm run test:nav [スクリーンショットの保存先]`
// 環境変数 CHROME で Chrome の場所、BASE_URL で画面のアドレスを変えられる
const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8091/";
const profile = mkdtempSync(join(tmpdir(), "iq-nav-"));
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, "--remote-debugging-port=9333", "--window-size=1500,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch("http://127.0.0.1:9333/json/list")).json(); if (targets.some((t) => t.type === "page")) break; } catch { /* 起動待ち */ }
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; const t = setTimeout(() => { pending.delete(i); rej(new Error(`CDP timeout: ${method} ${JSON.stringify(params).slice(0, 120)}`)); }, 20000); pending.set(i, (d) => { clearTimeout(t); res(d); }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
const shot = async (name) => { if (!SHOT) return; const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(SHOT, name), Buffer.from(r.result.data, "base64")); };
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch { /* 描画待ち */ } await sleep(150); } return false; };

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const GROUPS = ["market", "offer", "product", "risk"];
const expanded = (g) => ev(`${q(`[data-testid="group-toggle-${g}"]`)}.getAttribute("aria-expanded")`);
const visibleItems = (g) => ev(`!document.getElementById("group-items-${g}").hidden`);
const allOpen = async () => (await Promise.all(GROUPS.map(expanded))).every((v) => v === "true");
const openExcept = async (g) => (await Promise.all(GROUPS.map(expanded))).every((v, i) => (v === "true") === (GROUPS[i] !== g));
const activeItems = () => ev(`[...document.querySelectorAll('[data-testid^="nav-"][aria-current="page"]')].map(a => a.dataset.testid)`);
const h1 = () => ev(`(document.querySelector(".content h1")||{}).textContent`);
const click = (sel) => ev(`${q(sel)}.click()`);
const goto = async (hash) => { await send("Page.navigate", { url: `${BASE}${hash}` }); await sleep(400); };
const loaded = () => waitFor(q('[data-testid="group-toggle-market"]'));

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });

// ---------- 1. トップ URL（ハッシュなし）
await goto(""); await sleep(800);
await loaded();
await waitFor(`!!${q('[data-testid="tab-board"]')}`);
check("トップ URL でレポートサマリーの掲示板が表示される", (await ev(`${q('[data-testid="tab-board"]')}.getAttribute("aria-selected")`)) === "true", `ハッシュ「${await ev("location.hash")}」`);
check("4グループが並ぶ", (await ev(`[...document.querySelectorAll('[data-testid^="group-toggle-"]')].map(b=>b.textContent.trim()).join("|")`)) === "レポートと市場分析|オファーレベル|商品評価|リスク計算");
check("4グループとも最初から開いていて、項目が見える", (await allOpen()) && (await Promise.all(GROUPS.map(visibleItems))).every(Boolean));
check("「レポートと市場分析」の項目は 3つ（表示順どおり）", (await ev(`[...document.querySelectorAll('#group-items-market a')].map(a=>a.querySelector('.sidebar-label').textContent).join("|")`)) === "イールドカーブ分析|レポートサマリー|発行体格付け推移");
check("「レポートサマリー」が選択状態（ほかは選択なし）", JSON.stringify(await activeItems()) === '["nav-report-summary"]', JSON.stringify(await activeItems()));
check("サイドバーにサーバー接続の項目はない", !(await ev(`!!document.querySelector('.sidebar a[href="#server"]')`)));
check("右上の接続ステータス（Infrago Quant Server）がある", await ev(`!!document.querySelector('.site-header a[href="#server"]')`));
const nIcons = await ev(`document.querySelectorAll('.sidebar ul a svg.icon').length`), nItems = await ev(`document.querySelectorAll('.sidebar ul a').length`);
check("サイドバーの9項目すべてにアイコンがある", nItems === 9 && nIcons === 9, `${nIcons} / ${nItems}`);
await shot("nav0_top.png");

// ---------- 2. 個別ページの URL を直接開く
const DIRECT = [
  ["#curves", "market", "yield-analysis", "イールドカーブ"], ["#ois", "market", "yield-analysis", "TONA OIS カーブとスワップ"], ["#rates", "market", "yield-analysis", "日米の国債金利・OIS"],
  ["#reports/list", "market", "report-summary", null], ["#issuer-ratings", "market", "issuer-ratings", "発行体格付け推移"],
  ["#offers", "offer", "offer-sheet", "オファーシート作成"], ["#trs", "offer", "offer-sheet", null],
  ["#asw", "product", "asset-swap", "アセットスワップ"], ["#bond", "product", "asset-swap", "債券キャッシュフロー"], ["#futures", "product", "asset-swap", "国債先物・CTD"], ["#callable", "product", "early-redemption", "早期償還（コール債・MBS）"],
  ["#irrbb", "risk", "irrbb", "IRRBB金利シナリオ"], ["#credit-var", "risk", "credit-var", "クレジットVaR"], ["#cds", "risk", "credit-var", "クレジット・CDS"], ["#rating-limits", "risk", "rating-limits", "格付け枠管理"],
];
for (const [hash, group, item, want] of DIRECT) {
  await goto(hash); await loaded(); await sleep(500);
  const t = await h1();
  check(`直接 ${hash}：その画面を表示し、全グループ開いたまま、${item} を選択`, (await allOpen()) && JSON.stringify(await activeItems()) === JSON.stringify([`nav-${item}`]) && (want === null || t === want), `見出し「${t}」`);
}
// タブのタイトル（Chrome のフレーム）：Infrago Quantlet/メニュー名
for (const [hash, title] of [["", "Infrago Quantlet/レポートサマリー"], ["#curves", "Infrago Quantlet/イールドカーブ分析"], ["#bond", "Infrago Quantlet/アセットスワップ"], ["#callable", "Infrago Quantlet/早期償還"], ["#irrbb", "Infrago Quantlet/IRRBB"], ["#credit-var", "Infrago Quantlet/クレジットVaR"], ["#server", "Infrago Quantlet/サーバー接続"]]) {
  await goto(hash); await loaded(); await sleep(300);
  check(`タブのタイトル ${hash || "（トップ）"}：${title}`, (await ev("document.title")) === title, await ev("document.title"));
}
await goto("#curves"); await loaded(); await sleep(300); await shot("nav1_curves.png");

// ---------- 3. 開閉：全部開いたまま。自動では閉じず、名前のクリックで、そのグループだけ手動で開閉
await goto("#irrbb"); await loaded();
check("開いた状態で始まる", await allOpen());
await click('[data-testid="group-toggle-offer"]');
check("グループ名をクリックすると、そのグループ（オファーレベル）だけ閉じる", (await openExcept("offer")) && !(await visibleItems("offer")) && (await visibleItems("risk")));
await click('[data-testid="group-toggle-product"]');
check("別のグループ（商品評価）を閉じても、ほかは閉じない・開かない", (await Promise.all(GROUPS.map(expanded))).join() === "true,false,false,true");
await click('[data-testid="group-toggle-offer"]'); await click('[data-testid="group-toggle-product"]');
check("もう一度クリックすると開く（全グループ開いた状態に戻る）", await allOpen());
await click('[data-testid="group-toggle-market"]');
check("手動で閉じても、いまの画面の項目（IRRBB）は選択されたまま", JSON.stringify(await activeItems()) === '["nav-irrbb"]' && (await expanded("market")) === "false");
await click('[data-testid="nav-report-summary"]').catch(() => {}); await sleep(500);
check("閉じたグループの画面へ移ると、そのグループだけ開く（ほかは触らない）", (await ev("location.hash")) === "#reports" && (await allOpen()));
await shot("nav2_toggle.png");

// ---------- 4. 項目の選択表示と既存画面への遷移（サイドバーから）
const visit = async (itemId, expectHash, expectH1, group) => {
  await click(`[data-testid="nav-${itemId}"]`); await sleep(500);
  if (expectH1) await waitFor(`(document.querySelector(".content h1")||{}).textContent === ${JSON.stringify(expectH1)}`, 15000);
  const act = JSON.stringify(await activeItems()), t = await h1();
  check(`${itemId}：${expectHash} を開き、選択表示、全グループ開いたまま`, (await ev("location.hash")) === expectHash && act === JSON.stringify([`nav-${itemId}`]) && (await allOpen()) && (!expectH1 || t === expectH1), `見出し「${t}」`);
};
await goto("#irrbb"); await loaded();
await visit("yield-analysis", "#curves", "イールドカーブ", "market");
await visit("report-summary", "#reports", null, "market");
check("レポートサマリーから 掲示板・レポート登録・レポート一覧 のタブが開ける", (await ev(`document.querySelectorAll('[data-testid^="tab-"]').length`)) === 3);
await click('[data-testid="tab-register"]'); await sleep(300);
check("レポート登録のタブに切り替わる（レポートサマリーは選択のまま）", (await ev("location.hash")) === "#reports/register" && JSON.stringify(await activeItems()) === '["nav-report-summary"]');
await click('[data-testid="tab-list"]'); await sleep(300);
check("レポート一覧のタブに切り替わる", (await ev("location.hash")) === "#reports/list");
await visit("offer-sheet", "#offers", "オファーシート作成", "offer");
await visit("asset-swap", "#asw", "アセットスワップ", "product");
await visit("early-redemption", "#callable", "早期償還（コール債・MBS）", "product");
await visit("irrbb", "#irrbb", "IRRBB金利シナリオ", "risk");
await shot("nav3_irrbb.png");

// ---------- 5. 画面の切り替え（タブ）と関連画面
await goto("#curves"); await loaded(); await waitFor(q('[data-testid="view-ois"]'));
check("切り替えタブ（3つ）にもアイコンがある", (await ev(`document.querySelectorAll('[data-testid="view-tabs"] a svg.icon').length`)) === 3);
await click('[data-testid="view-ois"]'); await sleep(500);
check("イールドカーブ分析 → TONA OIS に切り替わる", (await ev("location.hash")) === "#ois" && (await h1()) === "TONA OIS カーブとスワップ" && JSON.stringify(await activeItems()) === '["nav-yield-analysis"]');
await click('[data-testid="view-rates"]'); await sleep(500);
check("イールドカーブ分析 → 日米の国債金利・OIS に切り替わる", (await ev("location.hash")) === "#rates" && (await h1()) === "日米の国債金利・OIS");
await shot("nav4_rates.png");

await goto("#offers"); await loaded(); await waitFor(q('[data-testid="view-trs"]'));
check("オファーシートに「関連画面」として TRS契約書連携", (await ev(`document.querySelector('[data-testid="view-tabs"]').getAttribute("aria-label")`)) === "関連画面");
await click('[data-testid="view-trs"]'); await sleep(600);
check("TRS契約書連携が開き、オファーシートの項目が選択されたまま", (await ev("location.hash")) === "#trs" && JSON.stringify(await activeItems()) === '["nav-offer-sheet"]' && (await allOpen()), await h1());

await goto("#asw"); await loaded(); await waitFor(q('[data-testid="view-bond"]'));
await click('[data-testid="view-bond"]'); await sleep(600);
check("アセットスワップ → 債券キャッシュフロー（関連画面）", (await ev("location.hash")) === "#bond" && (await h1()) === "債券キャッシュフロー" && JSON.stringify(await activeItems()) === '["nav-asset-swap"]');
await click('[data-testid="view-futures"]'); await sleep(600);
check("アセットスワップ → 国債先物・CTD（関連画面）", (await ev("location.hash")) === "#futures" && (await h1()) === "国債先物・CTD" && JSON.stringify(await activeItems()) === '["nav-asset-swap"]');

// ---------- 6. アセットスワップの入口（オファーシートの結果から銘柄を開く）
await goto("#asw"); await loaded(); await waitFor(`document.querySelectorAll(".content table.data tbody tr").length > 0`, 20000);
const rowsN = await ev(`document.querySelectorAll(".content table.data tbody tr").length`);
check("アセットスワップに計算済みの銘柄が並ぶ", rowsN > 0, `${rowsN} 行`);
await shot("nav5_asw.png");
if (rowsN > 0) {
  const isin = await ev(`document.querySelector(".content table.data tbody tr td.mono").textContent`);
  await ev(`(() => { const i = document.querySelector('[data-testid="asw-search"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ${JSON.stringify(isin)}); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await waitFor(q('[data-testid="asw-open"]'), 3000);
  await click('[data-testid="asw-open"]'); await sleep(800);
  check("銘柄の詳細がオファーシートで開く", (await ev("location.hash")) === `#offers/${isin}` && (await h1()) === "オファーシート作成", await ev("location.hash"));
}

// ---------- 7. 準備中
for (const [item, hash, title, grp] of [["issuer-ratings", "#issuer-ratings", "発行体格付け推移", "market"], ["credit-var", "#credit-var", "クレジットVaR", "risk"], ["rating-limits", "#rating-limits", "格付け枠管理", "risk"]]) {
  await goto("#curves"); await loaded();
  const badge = await ev(`!!${q(`[data-testid="nav-${item}"] .sidebar-soon`)}`);
  await click(`[data-testid="nav-${item}"]`); await sleep(500);
  check(`${title}：メニューに「準備中」、画面にも「準備中」`, badge && (await ev("location.hash")) === hash && (await ev(`!!document.querySelector('[data-testid="placeholder"]')`)) && JSON.stringify(await activeItems()) === JSON.stringify([`nav-${item}`]));
}
await goto("#credit-var"); await loaded(); await waitFor(q('[data-testid="view-cds"]'));
await shot("nav6_creditvar.png");
await click('[data-testid="view-cds"]'); await sleep(700);
check("クレジットVaR（準備中）の関連画面から クレジット・CDS が開く", (await ev("location.hash")) === "#cds" && (await h1()) === "クレジット・CDS" && JSON.stringify(await activeItems()) === '["nav-credit-var"]');

// ---------- 8. サーバー接続は右上の接続ステータスから
await click('.site-header a[href="#server"]'); await sleep(600);
check("右上の接続ステータスからサーバー接続ページが開く（項目の選択なし）", (await ev("location.hash")) === "#server" && JSON.stringify(await activeItems()) === "[]", await h1());
await shot("nav7_server.png");

// ---------- 9. 以前のアドレス
for (const old of ["#a1", "#yields", "#yield-curves", "#credit-cds", "#early-redemption", "#xyz"]) {
  await goto(old); await loaded(); await sleep(400);
  const act = await activeItems();
  check(`以前のアドレス ${old} が開く`, act.length === 1, JSON.stringify(act));
}

// ---------- 10. 折りたたんだサイドバー（アイコンだけで全項目が並ぶ）
await goto("#curves"); await loaded();
await click('[data-testid="sidebar-toggle"]'); await sleep(300);
const iconOnly = await ev(`document.querySelectorAll('.sidebar.collapsed ul a').length`);
check("折りたたむとアイコンだけで全項目（9項目）が並ぶ", iconOnly === 9 && (await ev(`[...document.querySelectorAll('.sidebar.collapsed ul')].every(u => getComputedStyle(u).display !== "none")`)), String(iconOnly));
await shot("nav8_collapsed.png");
await click('[data-testid="sidebar-toggle"]');

console.log(`\n${pass} PASS / ${fail} FAIL`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
