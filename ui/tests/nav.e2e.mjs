// サイドメニュー（3つのまとまり）の確認：トップ URL・個別ページの URL・まとまりの開閉・選択表示（太字）・既存画面への遷移・アイコン・未実装（TBD）の項目・ブラウザーのタブの名前を、実際のブラウザ（ヘッドレス Chrome、DevTools Protocol）で確かめる。
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
const GROUPS = ["operations", "investment-analysis", "regulatory-risk"];
const expanded = (g) => ev(`${q(`[data-testid="group-toggle-${g}"]`)}.getAttribute("aria-expanded")`);
const visibleItems = (g) => ev(`!document.getElementById("group-items-${g}").hidden`);
const allOpen = async () => (await Promise.all(GROUPS.map(expanded))).every((v) => v === "true");
const openExcept = async (g) => (await Promise.all(GROUPS.map(expanded))).every((v, i) => (v === "true") === (GROUPS[i] !== g));
const activeItems = () => ev(`[...document.querySelectorAll('[data-testid^="nav-"][aria-current="page"]')].map(a => a.dataset.testid)`);
const h1 = () => ev(`(document.querySelector(".content h1")||{}).textContent`);
const click = (sel) => ev(`${q(sel)}.click()`);
const goto = async (hash) => { await send("Page.navigate", { url: `${BASE}${hash}` }); await sleep(400); };
const loaded = () => waitFor(q('[data-testid="group-toggle-operations"]'));

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });

// ---------- 1. トップ URL（ハッシュなし）
await goto(""); await sleep(800);
await loaded();
await waitFor(`!!${q('[data-testid="tab-board"]')}`);
check("トップ URL でレポートサマリーの掲示板が表示される", (await ev(`${q('[data-testid="tab-board"]')}.getAttribute("aria-selected")`)) === "true", `ハッシュ「${await ev("location.hash")}」`);
check("3つのまとまりが並ぶ", (await ev(`[...document.querySelectorAll('[data-testid^="group-toggle-"]')].map(b=>b.textContent.trim()).join("|")`)) === "業務支援|投資定量分析|規制リスク関連");
check("3つのまとまりとも最初から開いていて、項目が見える", (await allOpen()) && (await Promise.all(GROUPS.map(visibleItems))).every(Boolean));
check("「業務支援」の項目は 7つ（表示順どおり）", (await ev(`[...document.querySelectorAll('#group-items-operations .sidebar-label:not(.sidebar-soon)')].map(a=>a.textContent).join("|")`)) === "クレジットRPT分析|オファーシート作成|レポート格付検証|デリバティブ取引入力|ショート残検証|為替ヘッジ/カバー発注|みなす基準算定支援");
check("「クレジットRPT分析」が選択状態（ほかは選択なし）", JSON.stringify(await activeItems()) === '["nav-credit-report"]', JSON.stringify(await activeItems()));
check("サイドバーにサーバー接続の項目はない", !(await ev(`!!document.querySelector('.sidebar a[href="#server"]')`)));
check("右上の接続ステータス（Infrago Quant Server）がある", await ev(`!!document.querySelector('.site-header a[href="#server"]')`));
const nIcons = await ev(`document.querySelectorAll('.sidebar ul li svg.icon').length`), nItems = await ev(`document.querySelectorAll('.sidebar ul li').length`);
check("サイドバーの16項目すべてにアイコンがある", nItems === 16 && nIcons === 16, `${nIcons} / ${nItems}`);
check("選択中の項目は太字で、赤い背景は付かない", await ev(`(() => { const a = document.querySelector('.sidebar a.active'); const c = getComputedStyle(a); return Number(c.fontWeight) >= 700 && (c.backgroundColor === "rgba(0, 0, 0, 0)" || c.backgroundColor === "transparent"); })()`));
check("まとまりの見出しは 15px の太字", await ev(`(() => { const c = getComputedStyle(document.querySelector('[data-testid="group-toggle-operations"]')); return c.fontSize === "15px" && Number(c.fontWeight) >= 700; })()`));
await shot("nav0_top.png");

// ---------- 2. 個別ページの URL を直接開く
const DIRECT = [
  ["#reports/list", "operations", "credit-report", null], ["#offers", "operations", "offer-sheet", "オファーシート作成"], ["#asw", "operations", "offer-sheet", "アセットスワップ"], ["#trs", "operations", "derivative-entry", null],
  ["#curves", "investment-analysis", "yield-analysis", "イールドカーブ"], ["#rates", "investment-analysis", "yield-analysis", "日米の国債金利・OIS"], ["#bond", "investment-analysis", "bond-calc", "債券キャッシュフロー"],
  ["#futures", "investment-analysis", "futures-ctd", "国債先物・CTD"], ["#ois", "investment-analysis", "gps", "TONA OIS カーブとスワップ"], ["#cds", "investment-analysis", "credit-spread-cds", "クレジット・CDS"],
  ["#callable", "investment-analysis", "early-redemption", "早期償還（コール債・MBS）"], ["#irrbb", "regulatory-risk", "irrbb", "IRRBB金利シナリオ"],
];
for (const [hash, group, item, want] of DIRECT) {
  await goto(hash); await loaded(); await sleep(500);
  const t = await h1();
  check(`直接 ${hash}：その画面を表示し、全グループ開いたまま、${item} を選択`, (await allOpen()) && JSON.stringify(await activeItems()) === JSON.stringify([`nav-${item}`]) && (want === null || t === want), `見出し「${t}」`);
}
// ブラウザーのタブの名前：投資業務支援ポータル/メニュー名（サイドメニューの項目名）
for (const [hash, title] of [["", "投資業務支援ポータル/クレジットRPT分析"], ["#curves", "投資業務支援ポータル/イールドカーブ分析"], ["#bond", "投資業務支援ポータル/債券原始計算"], ["#callable", "投資業務支援ポータル/債券早期償還"], ["#ois", "投資業務支援ポータル/GPS（含むキーレート）"], ["#trs", "投資業務支援ポータル/デリバティブ取引入力"], ["#irrbb", "投資業務支援ポータル/IRRBB"]]) {
  await goto(hash); await loaded(); await sleep(300);
  check(`タブのタイトル ${hash || "（トップ）"}：${title}`, (await ev("document.title")) === title, await ev("document.title"));
}
await goto("#curves"); await loaded(); await sleep(300); await shot("nav1_curves.png");

// ---------- 3. 開閉：全部開いたまま。自動では閉じず、名前のクリックで、そのまとまりだけ手動で開閉
await goto("#irrbb"); await loaded();
check("開いた状態で始まる", await allOpen());
await click('[data-testid="group-toggle-investment-analysis"]');
check("見出しをクリックすると、そのまとまり（投資定量分析）だけ閉じる", (await openExcept("investment-analysis")) && !(await visibleItems("investment-analysis")) && (await visibleItems("regulatory-risk")));
await click('[data-testid="group-toggle-regulatory-risk"]');
check("別のまとまり（規制リスク関連）を閉じても、ほかは閉じない・開かない", (await Promise.all(GROUPS.map(expanded))).join() === "true,false,false");
await click('[data-testid="group-toggle-investment-analysis"]'); await click('[data-testid="group-toggle-regulatory-risk"]');
check("もう一度クリックすると開く（全部開いた状態に戻る）", await allOpen());
await click('[data-testid="group-toggle-operations"]');
check("手動で閉じても、いまの画面の項目（IRRBB）は選択されたまま", JSON.stringify(await activeItems()) === '["nav-irrbb"]' && (await expanded("operations")) === "false");
await click('[data-testid="nav-credit-report"]').catch(() => {}); await sleep(500);
check("閉じたまとまりの画面へ移ると、そのまとまりだけ開く（ほかは触らない）", (await ev("location.hash")) === "#reports" && (await allOpen()));
await shot("nav2_toggle.png");

// ---------- 4. 項目の選択表示と既存画面への遷移（サイドバーから）
const visit = async (itemId, expectHash, expectH1, group) => {
  await click(`[data-testid="nav-${itemId}"]`); await sleep(500);
  if (expectH1) await waitFor(`(document.querySelector(".content h1")||{}).textContent === ${JSON.stringify(expectH1)}`, 15000);
  const act = JSON.stringify(await activeItems()), t = await h1();
  check(`${itemId}：${expectHash} を開き、選択表示、全グループ開いたまま`, (await ev("location.hash")) === expectHash && act === JSON.stringify([`nav-${itemId}`]) && (await allOpen()) && (!expectH1 || t === expectH1), `見出し「${t}」`);
};
await goto("#irrbb"); await loaded();
await visit("yield-analysis", "#curves", "イールドカーブ", "investment-analysis");
await visit("credit-report", "#reports", null, "operations");
check("クレジットRPT分析から 掲示板・レポート登録・レポート一覧 のタブが開ける", (await ev(`document.querySelectorAll('[data-testid^="tab-"]').length`)) === 3);
await click('[data-testid="tab-register"]'); await sleep(300);
check("レポート登録のタブに切り替わる（クレジットRPT分析は選択のまま）", (await ev("location.hash")) === "#reports/register" && JSON.stringify(await activeItems()) === '["nav-credit-report"]');
await click('[data-testid="tab-list"]'); await sleep(300);
check("レポート一覧のタブに切り替わる", (await ev("location.hash")) === "#reports/list");
await visit("offer-sheet", "#offers", "オファーシート作成", "operations");
await visit("derivative-entry", "#trs", null, "operations");
await visit("bond-calc", "#bond", "債券キャッシュフロー", "investment-analysis");
await visit("futures-ctd", "#futures", "国債先物・CTD", "investment-analysis");
await visit("gps", "#ois", "TONA OIS カーブとスワップ", "investment-analysis");
await visit("credit-spread-cds", "#cds", "クレジット・CDS", "investment-analysis");
await visit("early-redemption", "#callable", "早期償還（コール債・MBS）", "investment-analysis");
await visit("irrbb", "#irrbb", "IRRBB金利シナリオ", "regulatory-risk");
await shot("nav3_irrbb.png");

// ---------- 5. 画面の切り替え（タブ）と関連画面
await goto("#curves"); await loaded(); await waitFor(q('[data-testid="view-rates"]'));
check("切り替えタブ（2つ）にもアイコンがある", (await ev(`document.querySelectorAll('[data-testid="view-tabs"] a svg.icon').length`)) === 2);
await click('[data-testid="view-rates"]'); await sleep(500);
check("イールドカーブ分析 → 日米の国債金利・OIS に切り替わる", (await ev("location.hash")) === "#rates" && (await h1()) === "日米の国債金利・OIS" && JSON.stringify(await activeItems()) === '["nav-yield-analysis"]');
await shot("nav4_rates.png");

await goto("#offers"); await loaded(); await waitFor(q('[data-testid="view-asw"]'));
check("オファーシート作成に「関連画面」としてアセットスワップ", (await ev(`document.querySelector('[data-testid="view-tabs"]').getAttribute("aria-label")`)) === "関連画面");
await click('[data-testid="view-asw"]'); await sleep(600);
check("アセットスワップが開き、オファーシート作成の項目が選択されたまま", (await ev("location.hash")) === "#asw" && (await h1()) === "アセットスワップ" && JSON.stringify(await activeItems()) === '["nav-offer-sheet"]' && (await allOpen()), await h1());

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

// ---------- 7. 未実装（TBD）：札は出すが、画面は開かない
for (const [item, title] of [["rating-check", "レポート格付検証"], ["short-balance", "ショート残検証"], ["fx-hedge", "為替ヘッジ/カバー発注"], ["deemed-standard", "みなす基準算定支援"], ["frtb-cva", "FRTB CVAR計算"], ["credit-var", "クレジットVaR"]]) {
  await goto("#curves"); await loaded();
  const info = await ev(`(() => { const e = ${q(`[data-testid="nav-${item}"]`)}; return { tag: e.tagName, tbd: !!e.querySelector(".sidebar-soon") && e.querySelector(".sidebar-soon").textContent === "TBD", href: e.getAttribute("href") }; })()`);
  await click(`[data-testid="nav-${item}"]`); await sleep(400);
  check(`${title}：「TBD」の札があり、クリックしても画面は変わらない`, info.tag === "SPAN" && info.tbd && info.href === null && (await ev("location.hash")) === "#curves" && JSON.stringify(await activeItems()) === '["nav-yield-analysis"]');
}
await goto("#credit-var"); await loaded(); await sleep(400);
check("TBD の画面の URL（#credit-var）を直接開くと、トップの画面になる", JSON.stringify(await activeItems()) === '["nav-credit-report"]', JSON.stringify(await activeItems()));
await shot("nav6_tbd.png");

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
check("折りたたむとアイコンだけで全項目（16項目）が並ぶ", (await ev(`document.querySelectorAll('.sidebar.collapsed ul li svg.icon').length`)) === 16 && iconOnly === 10 && (await ev(`[...document.querySelectorAll('.sidebar.collapsed ul')].every(u => getComputedStyle(u).display !== "none")`)), String(iconOnly));
await shot("nav8_collapsed.png");
await click('[data-testid="sidebar-toggle"]');

console.log(`\n${pass} PASS / ${fail} FAIL`);
ws.close(); proc.kill();
process.exit(fail ? 1 : 0);
