# Infrago Quant（旧 QuantLet）

運用分析・業務支援の Web アプリ。Curie（`../Curie`）の後継として、Curie の A1（オファーシート）と C1（TRS 確認書）を移植し、掲示板・金利・IRRBB を足した。ユーザーとのやり取りは日本語、文書は常体で書く。詳しい仕様・照合結果・再現手順は `README.md`。

## 構成と分担

| 場所 | 担当 | やらないこと |
|---|---|---|
| `server/`（R、httpuv） | HTTP API。データの取得・取込・整形・結合・集計・検証は R と tidyverse | 金融計算の実装。足りない計算は rmql に足す |
| `../RiemannQL`（rmql） | 金融計算（カーブ、債券、ASW、TRS の両レッグ、IRRBB のショックなど） | — |
| `ui/`（React＋TypeScript） | 入力、API 呼び出し、JSON の表・グラフ表示 | 計算し直さない |

- 画面の構成：上の帯と、その下の左サイドバー（構成は `ui/src/nav.ts`）。サイドバーは 3 つのまとまりで、いずれも見出しがあり、名前のクリックで開閉（最初から開き、自動では閉じない）。トップ URL はクレジットRPT分析（レポートサマリーの掲示板）。「業務支援」：クレジットRPT分析、オファーシート作成（関連：アセットスワップ）、レポート格付検証、デリバティブ取引入力（TRS契約書連携）、ショート残検証、為替ヘッジ/カバー発注、みなす基準算定支援。「投資定量分析」：イールドカーブ分析（関連：日米の国債金利・OIS）、債券原始計算、先物CTD、GPS（含むキーレート。TONA OIS・スワップの画面）、クレジットスプレッドCDS、債券早期償還。「規制リスク関連」：FRTB CVAR計算、クレジットVaR、IRRBB。未実装は「TBD」の札を付け、画面は開かない（サイドバーの選択は、赤いハイライトでなく太字だけ）（レポート格付検証、ショート残検証、為替ヘッジ/カバー発注、みなす基準算定支援、FRTB CVAR計算、クレジットVaR。札は「仕様確認」（その項目を開くと、仕様確認の画面））。移した画面は仕様の説明を載せず、入力・結果・グラフ・表だけにする。タブのタイトルは「投資業務支援ポータル/メニュー名」
- デザインは Carmine Studio（`../Carmine`）と同じ方針：ボディーは `#F7F7F8`、サイドバーは `#EFEFF1`、グラフと表は白地（`#FFFFFF`）、上の帯の左に二段の文字（1 段目「Infrago」、2 段目「市場分析運用判断支援」。日本語は一回り小さい。ロゴのマークは付けない）、右に `Infrago Quant Server` の接続状態表示、横幅を活かした配置。色はアクア（`#1a9bbd`。ロゴの文字は色なし）、ボタン・入力欄・選択・スライダーは Carmine と同じ Aqua 風（利用者の好み）
- ポート：画面 8091、R API 8790（Carmine Studio の 8081・8787 と分ける）。起動の入口は `start_infrago.ps1`（1 台で動かす。`-Mode dev|lan|server|client|check|menu|resume`、引数なしは dev）。別々の PC で動かすときは、サーバーの PC で `scripts/start_infrago_server.ps1`（0.0.0.0:8790）、クライアントの PC で `scripts/start_infrago_client.ps1 -ApiUrl http://<サーバーのPC>:8790`（`config/deploy.local.env` の `INFRAGO_QUANT_API_URL` でも可）。処理の本体は `scripts/InfragoQuant.ps1`（メニューの 1 でこの PC、2 で社内LAN、4 でサーバーのみ、5 でクライアントのみ）。個別起動は `ui/` で `npm run api` と `npm run dev`
- 社内に配る URL は `http://<ホスト>:8091/`。ホストは `config/deploy.local.env` の `INFRAGO_QUANT_PUBLIC_HOST`（または `QUANTLET_PUBLIC_HOST`、Git に入れない）、空なら LAN の IPv4。`127.0.0.1` は開発と内部通信だけ
- R のパスも版もコードに決め打ちしない。`ui/scripts/rscript.mjs` が環境変数 `RSCRIPT` → `config/settings.local.env`（Git に入れない）の `RSCRIPT` → PATH → `R_HOME` → インストール済みの最新の R（自動検出）の順に選び、`npm run check:r`（`server/scripts/check_r.R`）で版と必須パッケージを確かめる。この PC は R が PATH になくても自動検出で動くので、`config/settings.local.env` は不要。`Rscript -e` は引用符で失敗しやすいのでスクリプトファイルにする

## 決めたこと

- **Bloomberg** の取得は将来 INDIGO に移す予定（INDIGO は未作成）。取得はアダプター（`server/R/bloomberg/`）に分け、評価側は正規化した表だけに依存させる。実接続は未実施（認証情報と httr2 がない）
- **市場データの日付**：評価日と同じ市場日のデータだけを使い、別の日付で補わない（Curie と同じ）
- **デモデータはすべて架空**（`server/data/demo/`）。実在の銘柄・価格・契約書・市場データは Git に入れない。`server/data/` は掲示板のサンプル案件 1 件を除いて Git の対象外
- **Aladdin**：送信先の見本は `https://aladdin.example.invalid/`。実際の送信先はローカル設定（`server/tmp/aladdin_endpoint.json` と `server/tmp/.Renviron` の `QUANTLET_ALADDIN_ENDPOINT`）。送信はしない（下書きのみ）
- **IRRBB**：SRP31（2024-07-16 公表、2026-01-01 適用）。円 100/100/100 bp。金利フロアは既定でなし（金融庁の扱いは未確認）。基準 PV は月次点から作り直したカーブで評価し、元の TONA OIS カーブより合計 130 円大きい（計算上の前提として README に記録）
- **Curie は変更しない**（移行中も従来の手順で使えるように）。rmql に機能を足すときは rmql の `CLAUDE.md` の手順（照合 → 実装 → テスト → 仕様書 → 全テストと clippy）に従う。rmql の R パッケージを入れ直すときは、DLL を使っている Infrago Quant の R API を先に止める

## 作業のきまり

- コミットと push は頼まれたときだけ。`main` にいるときは作業ブランチを作ってからコミットする。ステージした差分に認証情報・個人のパス（`C:/Users/...`）・社内 URL・実データがないことを確かめる
- 確かめていないことを断定しない。照合結果は実行した日付と数値で書く
- ブラウザーでの確認は、ヘッドレスの Chrome を DevTools Protocol で操作して行ってきた（ブラウザー操作のツールはこの環境で使えなかった）

## 状態

状態・引き継ぎ・未了・新しい PC での準備は、すべて `docs/HANDOVER.md`（正本）。ここには書かない。
