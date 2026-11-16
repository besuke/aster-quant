# AsterQuant（旧 QuantLet）

運用分析・業務支援の Web アプリ。Curie（`../Curie`）の後継として、Curie の A1（オファーシート）と C1（TRS 確認書）を移植し、掲示板・金利・IRRBB を足した。ユーザーとのやり取りは日本語、文書は常体で書く。詳しい仕様・照合結果・再現手順は `README.md`。

## 構成と分担

| 場所 | 担当 | やらないこと |
|---|---|---|
| `server/`（R、httpuv） | HTTP API。データの取得・取込・整形・結合・集計・検証は R と tidyverse | 金融計算の実装。足りない計算は RiemannFinMath に足す |
| `../Riemann`（RiemannFinMath） | 金融計算（カーブ、債券、ASW、TRS の両レッグ、IRRBB のショックなど） | — |
| `ui/`（React＋TypeScript） | 入力、API 呼び出し、JSON の表・グラフ表示 | 計算し直さない |

- 画面は左のアイコン付きサイドメニュー（`ui/src/App.tsx` の `PAGES`）：レポート分析掲示板、日米の国債金利・OIS、オファーシート作成、TRS契約書連携、IRRBB金利シナリオ
- デザインは Carmine Studio（`../carmine-studio`）と同じ方針：ボディーは `#F7F7F8`、サイドバーは `#EFEFF1`、グラフと表は白地（`#FFFFFF`）、左サイドバー上部に SVG ロゴと「AsterQuant」（副題：運用分析・業務支援）、右上に `AsterQuant Server` の接続状態表示、横幅を活かした配置
- ポート：画面 8091、R API 8790（Carmine Studio の 8081・8787 と分ける）。起動は `AsterQuant.ps1`（1 でこの PC、2 で社内LAN、4 でサーバーのみ、5 でクライアントのみ。`-Mode dev|lan|server|client|resume` でメニューなし）、個別起動は `Start-Server.ps1`・`Start-Client.ps1`、または `ui/` で `npm run api` と `npm run dev`
- 社内に配る URL は `http://<ホスト>:8091/`。ホストは `deploy.local.env` の `ASTERQUANT_PUBLIC_HOST`（または `QUANTLET_PUBLIC_HOST`、Git に入れない）、空なら LAN の IPv4。`127.0.0.1` は開発と内部通信だけ
- R は PATH にない：`"C:/Program Files/R/R-4.6.0/bin/Rscript.exe"`。`Rscript -e` は引用符で失敗しやすいのでスクリプトファイルにする

## 決めたこと

- **Bloomberg** の取得は将来 INDIGO に移す予定（INDIGO は未作成）。取得はアダプター（`server/R/bloomberg/`）に分け、評価側は正規化した表だけに依存させる。実接続は未実施（認証情報と httr2 がない）
- **市場データの日付**：評価日と同じ市場日のデータだけを使い、別の日付で補わない（Curie と同じ）
- **デモデータはすべて架空**（`server/data/demo/`）。実在の銘柄・価格・契約書・市場データは Git に入れない。`server/data/` は掲示板のサンプル案件 1 件を除いて Git の対象外
- **Aladdin**：送信先の見本は `https://aladdin.example.invalid/`。実際の送信先はローカル設定（`server/tmp/aladdin_endpoint.json` と `server/tmp/.Renviron` の `QUANTLET_ALADDIN_ENDPOINT`）。送信はしない（下書きのみ）
- **IRRBB**：SRP31（2024-07-16 公表、2026-01-01 適用）。円 100/100/100 bp。金利フロアは既定でなし（金融庁の扱いは未確認）。基準 PV は月次点から作り直したカーブで評価し、元の TONA OIS カーブより合計 130 円大きい（計算上の前提として README に記録）
- **Curie は変更しない**（移行中も従来の手順で使えるように）。Riemann に機能を足すときは Riemann の `CLAUDE.md` の手順（照合 → 実装 → テスト → 仕様書 → 全テストと clippy）に従う。Riemann の R パッケージを入れ直すときは、DLL を使っている AsterQuant の R API を先に止める

## 作業のきまり

- コミットと push は頼まれたときだけ。`main` にいるときは作業ブランチを作ってからコミットする。ステージした差分に認証情報・個人のパス（`C:/Users/...`）・社内 URL・実データがないことを確かめる
- 確かめていないことを断定しない。照合結果は実行した日付と数値で書く
- ブラウザーでの確認は、ヘッドレスの Chrome を DevTools Protocol で操作して行ってきた（ブラウザー操作のツールはこの環境で使えなかった）

## 状態（2026-11-16）

- AsterQuant：GitHub `besuke/aster-quant`（**private**）の `main` に push 済み（名称を QuantLet から AsterQuant に変更、ライトテーマ・アイコン付きサイドバー・横幅配置、IRRBB、配備用 URL、AsterQuant Server の接続表示・接続確認ページ、レポートの3画面、`AsterQuant.ps1`・`Start-Server.ps1`・`Start-Client.ps1` まで）
- Riemann：`main` は `22e504e`（TRS）、IRRBB は `irrbb-scenarios`（`4def5bc`）で取り込み待ち。どちらも未 push。AsterQuant の TRS と IRRBB はこの RiemannFinMath の関数を使うので、他の PC で動かすには Riemann 側の公開も要る
- 未了：Bloomberg の実接続、実データ（オファー・市場データ・銘柄属性の Aladdin 取得）、FpML の公式 XSD、承認済み AI API、金融庁の IRRBB フロアの確認、Curie にある Aladdin の実 URL の扱い
