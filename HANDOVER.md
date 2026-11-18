# 引き継ぎ書

Infrago Quant（旧 QuantLet）を、別の PC・別の会話（Git のクローン先）で続けるための書類。2026-11-18 時点。アプリの仕様と照合結果は `README.md`、Claude Code 向けの決めごとは `CLAUDE.md`。この書類は「手元で動かして続ける」ことだけを書く。

## いまの状態

- リポジトリ：<https://github.com/besuke/infrago>（旧名 `infrago-quant`。古い URL は転送される）。2026-11-18 の確認では**公開（public）**で、CLAUDE.md の「private」と食い違っている。意図した公開かは未確認。
- ブランチ：作業は `rename-infrago-quant-and-analytics`（PR #1、`main` 向け、未マージ）。`main` はまだ改名前の `7cb0cc3`。続きは、この PR をマージしたあとの `main` か、このブランチから始める。
- 画面：4グループのサイドバー（`ui/src/nav.ts`）。実装済みはイールドカーブ分析（イールドカーブ・TONA OIS・日米の国債金利）、レポートサマリー、オファーシート（関連：TRS契約書連携）、アセットスワップ（関連：債券キャッシュフロー・国債先物・CTD）、早期償還、IRRBB。**準備中**は発行体格付け推移、クレジットVaR（関連のクレジット・CDS は動く）、格付け枠管理。
- 計算は R（`server/`、RiemannFinMath）、画面は React（`ui/`）。画面は計算しない。

## 新しい PC で動かす

### 必要なもの

| もの | 版 | 備考 |
|---|---|---|
| Git | — | |
| Node.js | 23.6 以上 | 確認は 26.13.0 |
| R | 4.x | **版ごとにパッケージの置き場が違う**（下の「R の版が違うとき」） |
| RiemannFinMath | 0.3.0 以上 | 確認は **0.3.2**。Riemann は 0.3.4 まで進んでいるが、0.3.4 では未確認 |

### 手順

```powershell
git clone https://github.com/besuke/infrago.git
cd infrago
cd ui; npm install; cd ..          # 画面の部品（初回だけ）
# R のパッケージ（下の「R のパッケージを入れる」）を済ませる
.\start_infrago.ps1 -Mode check    # 使う R の版と、必須パッケージを読み込めるかの確認。ここが通れば準備完了
.\start_infrago.ps1                # 起動（R API 8790 と画面 8091）。ブラウザーで http://127.0.0.1:8091/ が開く
```

フォルダー名はどれでもよい（パスはすべてスクリプトの場所からの相対）。

### R のパッケージを入れる

必須（`server/scripts/check_r.R` が確かめる 15 個）：`httpuv`、`jsonlite`、`dplyr`、`purrr`、`tibble`、`tidyr`、`stringr`、`readr`、`readxl`、`writexl`、`xml2`、`zip`、`rlang`、`collapse`、`RiemannFinMath`。任意（その機能を使うときだけ。TRS 契約書連携・レポート・Bloomberg 取得）：`pdftools`、`openssl`、`curl`、`processx`、`ps`、`httr2`、`flextable`、`stringi`、`later`、`future`、`furrr`。

```r
install.packages(c("httpuv", "jsonlite", "dplyr", "purrr", "tibble", "tidyr", "stringr", "readr",
                   "readxl", "writexl", "xml2", "zip", "rlang", "collapse"))
# 任意（必要になってから）
install.packages(c("pdftools", "openssl", "curl", "processx", "ps", "httr2", "flextable", "stringi", "later", "future", "furrr"))
```

### RiemannFinMath を入れる

Riemann は別のリポジトリ（<https://github.com/besuke/Riemann>）。入れ方の正本は Riemann の `docs/client_guide.md`。要点：

```r
install.packages(
  "RiemannFinMath",
  repos = c("https://besuke.github.io/Riemann", "https://cloud.r-project.org")
)
```

- **公開しているバイナリは Windows の R 4.6 用だけ**（Riemann 側の記録）。Rust も Rtools も要らない。
- `remotes::install_github()` は使わない（常にソースからビルドするので Rust が要る）。
- 入れ替えるときは、その DLL を使っている R のプロセス（Infrago Quant の R API、RStudio の R セッションなど）を**先に止める**。

### R の版が違うとき（手元の R と、この PC の R 4.6.0 が違う）

- **使う R は自動で決まる**（`ui/scripts/rscript.mjs`）：環境変数 `RSCRIPT` → `settings.local.env` の `RSCRIPT` → PATH → `R_HOME` → インストール済みの最新の R。複数の版が入っていて、最新でない R を使うときだけ指定する（`Copy-Item settings.example.env settings.local.env` して `RSCRIPT=` に Rscript.exe のパスを書く）。使う R と版は、起動のたびに表示される。
- **パッケージは R の版（4.5、4.6 のような 2 桁目）ごとに別の置き場に入る**。R の版を替えたら、上の `install.packages(...)` をその R でやり直す。
- **R 4.6 以外では、RiemannFinMath は公開バイナリがない**。次のどれかになる。
  1. R 4.6 を入れる（いちばん簡単。複数の版は共存できる。`RSCRIPT` で選ぶ）。
  2. その版でソースからビルドする（Rust と Rtools が要る）。Riemann の `docs/client_guide.md` は「確認していない」としている。
  3. 手元の PC では、まず `-Mode check` で、選ばれた R と不足を確かめる（足りなければ、選ばれた R と不足のパッケージ、この PC にある別の R の一覧が出る）。
- Infrago Quant 側の R のコードは R 4.6.0 で確認した。ほかの版での動作は**確認していない**（`R 4.x` と書いているのは、版を決め打ちしないという意味で、4.x で動くという確認ではない）。

### Git に入れない、この PC だけのファイル

| ファイル | 内容 | 見本 |
|---|---|---|
| `settings.local.env` | 使う Rscript のパス（なくてよい） | `settings.example.env` |
| `deploy.local.env` | 社内に案内するホスト名・IP（社内LAN公開のときだけ） | `deploy.example.env` |
| `server/tmp/.Renviron`、`server/tmp/aladdin_endpoint.json` | Bloomberg・Aladdin・User-Agent の設定（実接続は未実施。値は書かない） | なし |
| `server/data/`（`demo/` と掲示板のサンプル案件 1 件を除く） | アップロード、実行結果、案件、取得した市場データ | — |
| `ui/node_modules/`、`ui/dist/` | 画面の部品、ビルド結果 | `npm install`、`npm run build` |

デモデータは**すべて架空**。実在の銘柄・価格・契約書・市場データは Git に入れない。

## 起動のコマンド（入口は `start_infrago.ps1` だけ）

| コマンド | することは |
|---|---|
| `.\start_infrago.ps1` | この PC で起動（開発用）。R API 8790 と画面 8091 を別のウィンドウで起動し、ブラウザーで開く |
| `.\start_infrago.ps1 -Mode lan` | 社内LANで公開（画面をビルドして、画面と API を 8091 でまとめて公開） |
| `.\start_infrago.ps1 -Mode server` | R API だけ |
| `.\start_infrago.ps1 -Mode client` | 画面だけ（ブラウザーで開く） |
| `.\start_infrago.ps1 -Mode check` | R の確認だけ（版・必須パッケージ） |
| `.\start_infrago.ps1 -Mode menu` | 番号で選ぶメニュー |
| `.\start_infrago.ps1 -Mode resume` | Claude Code をこのフォルダーで開く |

- 起動の処理の本体は `InfragoQuant.ps1`（`start_infrago.ps1` から呼ばれる）。
- **サーバーとクライアントを別の PC で動かす**：サーバーの PC（R・RiemannFinMath が要る）で `.\start_infrago_server.ps1`。R API を 0.0.0.0:8790 で起動し、クライアントに渡すアドレス（`http://<この PC>:8790`）を表示する。クライアントの PC（Node.js と `ui/` だけでよい。R は要らない）で `.\start_infrago_client.ps1 -ApiUrl http://<サーバーのPC>:8790`。画面（127.0.0.1:8091）は、`/api` をそのアドレスへ転送する。`-ApiUrl` の代わりに `deploy.local.env` の `INFRAGO_QUANT_API_URL` でもよい。サーバーの PC では Windows ファイアウォールで 8790 の受信を許可する。
  - 確認済み（2026-11-18）：1 台の PC の中で、LAN の IP アドレス経由でサーバーとクライアントをつなぎ、画面から `/api/health` が通ることを確かめた。**別の PC どうしでの接続（ファイアウォール越し）は未確認**
  - アドレスは **LAN の IP アドレス**（`http://192.168.x.x:8790`）を正とする。`127.0.0.1`・`localhost` は別の PC では使えず、クライアントのスクリプトも拒否する
  - コンピューター名・DNS 名（`-ApiUrl http://<名前>:8790`）は、2026-11-19 にサーバーの PC 自身から試したところ応答しなかった。名前が先に IPv6 に解決され、R API は IPv4（0.0.0.0）でしか待ち受けないため。名前を使うなら、DNS に IPv4 の A レコードを登録して IPv4 に解決させるか、IPv6 での待ち受けを調べる（未調査）
- 止めるときは、開いた「Infrago Quant Server (8790)」「Infrago Quant Client (8091)」のウィンドウを閉じる。
- ポートが使われていると、別のポートには移らずに止まり、使っているプロセスを示す。
- `ui/` で個別に起動するとき：`npm run api`（R API）、`npm run dev`（画面）、`npm run lan`（画面と API を 8091 で公開）。
- R の作業は RStudio（Positron）で `InfragoQuant.Rproj` を開く。開くと、使い方が表示される。`iq_check()` で、いま使っている R の確認ができる。

### 社内LANで公開する（配備）

`127.0.0.1` はこの PC の中だけで届くアドレスで、開発と内部の通信（起動の確認、画面から API への転送）にだけ使う。利用者に案内する URL・起動バッチが開く URL・接続確認ページに出す URL には、**配備先のホスト名（DNS で解決できる名前）またはこの PC の LAN の IP アドレス**を使う。

1. `deploy.example.env` を `deploy.local.env`（Git に入れない）に写し、`INFRAGO_QUANT_PUBLIC_HOST`（または `QUANTLET_PUBLIC_HOST`）にホスト名か IP アドレスを書く。空なら、この PC の LAN の IPv4 を自動で使う
2. `.\start_infrago.ps1 -Mode lan` で起動する。画面をビルドし、画面と API を 8091 でまとめて公開し、`http://<ホスト>:8091/` の応答を確かめてからブラウザーで開き、利用者に案内するアドレスを表示する
3. 他の端末から開けないときは、Windows ファイアウォールで 8091 の受信を許可する（この PC の設定。Infrago Quant からは変えない）

Infrago Quant Server（R）は環境変数 `QUANTLET_PUBLIC_HOST`（バッチが渡す）を読み、接続確認ページ（`#server`、`GET /api/server`）に利用者向けの URL を出す。開発用の起動（`.\start_infrago.ps1`、`npm run api`・`npm run dev`）は今までどおり `127.0.0.1` で、この PC の中だけで開ける。

ホスト名にアンダースコア（例 `MY_PC`）を含む Windows のコンピューター名は、DNS の名前として正しくなく、ブラウザーによっては開けない。その場合は IP アドレスか、社内 DNS に登録した名前を使う。

## 確認のコマンド（`ui/` で実行）

| コマンド | 確認すること | 前提 |
|---|---|---|
| `npm run typecheck` | 画面の型 | なし |
| `npm run check:r` | 使う R の版、必須パッケージ | R |
| `npm run test:nav` | ブラウザーで、トップ URL・個別ページの URL・グループの開閉・選択表示・関連画面・準備中・タブのタイトル（ヘッドレス Chrome） | `npm run api` と `npm run dev` を起動済み、Chrome（`CHROME`・`BASE_URL` で変えられる） |
| `npm run test:irrbb` | IRRBB の検算 11 項目 | R |
| `npm run reconcile:a1` / `reconcile:c1` | Curie との照合（A1・C1） | R |
| `npm run demo:offer` | 円債オファー 1 件のデモ Excel を作り直す | R |

`test:nav` の最後に最後まで通した実行は、59 件 PASS・7 件 FAIL（タブのタイトルだけ。原因は修正済み）。**修正後に最後まで通した実行はまだない**。

## どこに何があるか

| 場所 | 内容 |
|---|---|
| `ui/src/nav.ts` | サイドバーの4グループ・項目・関連画面・準備中・以前のアドレスの対応（画面を足すときはここ） |
| `ui/src/App.tsx` | 上の帯、サイドバー、画面の切り替え、タブのタイトル |
| `ui/src/analytics/` | イールドカーブ・TONA OIS・債券キャッシュフロー・早期償還・国債先物・クレジット CDS の画面。呼び出しは `ui/src/analyticsApi.ts` |
| `ui/src/charts/` | グラフ（Carmine Studio から写した `LineChart`・`FlowChart`） |
| `ui/src/styles.css` | 配色（深い緑）、Aqua 風の部品、サイドバー、グラフ |
| `server/server.R` | HTTP API の経路 |
| `server/R/analytics/` | 上の6画面の計算（RiemannFinMath を呼ぶ）。読み込みは `server/R/load_quantlet.R` の `.quantlet_modules` |
| `server/data/demo/` | 架空のデモデータ（先物の入力は `demo/futures/inputs.json`） |
| `ui/scripts/rscript.mjs`、`run-r.mjs` | 使う R の決め方と、起動前の確認 |

画面を足す手順：R の計算を `server/R/analytics/` に書く（金融計算は RiemannFinMath。足りなければ Riemann に足す）→ `load_quantlet.R` の `analytics` に足す → `server.R` に経路を足す → `ui/src/analyticsApi.ts` に型と呼び出し → `ui/src/analytics/` に画面 → `ui/src/nav.ts` に項目。

## 決めたこと（要点。全文は `CLAUDE.md`）

- 計算は RiemannFinMath、R の API は取り込み・整形・集計・検証、画面は表示だけ（計算し直さない）。
- 市場データは、評価日と同じ市場日のものだけを使い、別の日付で補わない。
- Aladdin への送信はしない（下書きのみ）。Bloomberg の実接続は未実施（将来 INDIGO に移す）。
- 画面は Carmine Studio（`../carmine-studio`）と同じ構成・同じ Aqua 風の部品で、色は深い緑。移した画面は仕様の説明を載せず、入力・結果・グラフ・表だけにする。
- Curie（`../Curie`）は変更しない。
- コミットと push は頼まれたときだけ。ステージした差分に、認証情報・個人のパス・社内 URL・実データがないことを確かめる。

## 未了・次にやること

1. **フォルダー名を `Infrago` に変える**（この PC。Claude Code がそのフォルダーを開いていると変えられない）。Claude Code を終了して、フォルダー名を変え、デスクトップのショートカットと `InfragoClaude.bat` のパスを直す。
2. **公開の範囲を決める**：GitHub のリポジトリは 2026-11-18 の確認で public。意図したものでなければ非公開に戻す（Settings → Danger Zone → Change visibility）。決めたら CLAUDE.md の記述を直す。
3. `origin` を新しい名前に直す：`git remote set-url origin https://github.com/besuke/infrago.git`（古い名前でも転送で動く）。
4. PR #1 をマージする。
5. **Carmine Studio のフォワードの直し**（未着手）：Carmine の yield-curves は原稿の2つの補間（ゼロ金利の線形補間、割引係数の対数線形補間）を再現する作りで、フォワードが折れ線・階段状になる。単調な対数3次補間のカーブを3つ目として足し、メインのグラフはそちらにする。原稿の2つは照合のために残す（照合の差 0 のテストを壊さない）。
6. Carmine Studio の残りの画面（ブラック・モデル、金利モデル、キャリブレーション、PRDC など）を移すか決める。移すのは実務で使うものだけ。
7. 準備中の3項目（発行体格付け推移、クレジットVaR、格付け枠管理）。RiemannFinMath にはクレジットリスクの関数（`compute_credit_risk`、`compute_portfolio_risk` など）がある。
8. 数値の確認が残っているもの：TONA OIS は Infrago のデモ気配（Carmine は別の気配）なので、Carmine との数値照合をしていない。早期償還の、コール判断の境界・乱数経路・静的 OAS は移していない（原稿の独自の R 関数に依るため）。CDS の Hazard Rate は、Carmine と同じ `uniroot` で求めている（RiemannFinMath の `bootstrap_hazard_curve` は契約の既定が違うので使っていない）。
9. Riemann の新しい版（0.3.4。OIS スワップの日付を期間から作る関数など）への更新。TONA OIS の `tona_swap_dates_QL` を置き換えられる可能性がある。更新後は、`npm run test:irrbb` と、各画面の既定値の照合をやり直す。
10. 機能ごとの未了（実データ、Bloomberg の実接続、FpML の公式 XSD、承認済み AI API など）は、下の「機能ごとの未了」。そこにないもの：金融庁の IRRBB フロアの扱いの確認（既定はフロアなし）、Curie にある Aladdin の実 URL の扱い。

### 機能ごとの未了

- 実データの入力：Aladdin API による銘柄属性の取得、実際のオファー Excel・市場データへの対応（Curie と同じ未了事項）、A1 の市場データを画面から選ぶ・アップロードする機能
- Bloomberg の live 取得と、取得した OIS 気配を A1 の入力に選ぶ経路
- C1：FpML の公式 XSD、承認済みの AI API の接続先、Aladdin への送信
- テストの自動化（API の回帰テスト）。照合スクリプトとブラウザーの確認（`npm run test:nav`）は手で実行する
- レポート掲示板：本番の発行体ID体系、承認済みの AI API（配布用。C1 と同じく未設定）、レポートの削除・再読解、オファーシートの Excel 出力からのレポートへのリンク（Curie の A3 の構想）
- 日米国債金利：取得の定期実行（今は画面のボタンで取得する）
- サーバーの TypeScript 化は保留（2026-11-15 の指示）。する場合も、RiemannFinMath に Node 版がないうちは、計算は R に残す

## 気をつけること

- **R の API（8790）が RiemannFinMath の DLL を使っている**間は、RiemannFinMath を入れ替えられない。先に R API を止める。
- 起動したウィンドウは、Claude Code のツールから起動すると、呼び出しが終わったときに閉じられることがある。確認のために立ち上げたサーバーは、確認が終わったら止める（8790・8091 が空いていることを確かめる）。
- `npm run test:nav` は、サーバーを前もって起動しておく。オファーの計算結果がないと、アセットスワップの銘柄の一覧は空になる（`POST /api/a1/run` で円債のデモを計算できる）。
- ブラウザー操作のツールは使えなかったので、画面の確認は、ヘッドレス Chrome を DevTools Protocol で操作して行っている（`ui/tests/nav.e2e.mjs`）。
