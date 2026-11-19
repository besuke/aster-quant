# 引き継ぎ書

Infrago Quant（旧 QuantLet）を、別の PC・別の会話（Git のクローン先）で続けるための書類。2026-11-20 時点。アプリの仕様と照合結果は `README.md`、Claude Code 向けの決めごとは `CLAUDE.md`。この書類は「手元で動かして続ける」ことだけを書く。

## いまの状態

- リポジトリ：<https://github.com/besuke/infrago>（旧名 `infrago-quant`）。`origin` は新しい URL に直してある（2026-11-20）。2026-11-18 の確認では**公開（public）**で、CLAUDE.md の「private」と食い違っている。意図した公開かは未確認。
- ブランチ：`main` が最新（`7a9d65c`、2026-11-20 に push 済み）。PR #1 はマージ済み。作業に使ったブランチ（`rename-to-rmql`、`rename-carmine-crimson`、`riemannql-folder` など）は `main` に取り込み済みで、ローカルに残っている（消してよい）。次に変更するときは、CLAUDE.md のとおり、作業ブランチを作ってからコミットする。
- この PC のフォルダーは `C:\AnalyticFin\Projects\Infrago`（旧 `InfragoQuant`）。デスクトップのショートカットと `InfragoClaude.bat` も、新しいパスに直した（2026-11-20）。
- 画面：サイドバーは 3 つのまとまり（`ui/src/nav.ts`。業務支援、投資定量分析、規制リスク関連）。実装済みはクレジットRPT分析、オファーシート作成（関連：アセットスワップ）、デリバティブ取引入力（TRS契約書連携。確認書は、アップロードのほか、https の公開 URL・許可したフォルダーのファイルから読める）、イールドカーブ分析（関連：日米の国債金利・OIS）、債券原始計算、先物CTD、GPS（含むキーレート。TONA OIS・スワップの画面）、クレジットスプレッドCDS、債券早期償還（コール判断の境界、MBS の静的・ダイナミック OAS と Hull-White の金利経路を含む）、IRRBB。**TBD**はレポート格付検証、ショート残検証、FRTB CVAR計算、クレジットVaR。格付け枠管理の画面は、メニューから外した（2026-11-20）。
- 計算は R（`server/`、rmql）、画面は React（`ui/`）。画面は計算しない。上の帯は、左に二段の文字「Infrago Quantlet」「市場分析運用判断支援」、右に接続表示（ロゴのマークは付けない）。
- rmql は旧名 RiemannFinMath（2026-11-19 に改名）。古い記録に `RiemannFinMath` と出てきたら、rmql のこと。

## 新しい PC で動かす

### 必要なもの

| もの | 版 | 備考 |
|---|---|---|
| Git | — | |
| Node.js | 23.6 以上 | 確認は 26.13.0 |
| R | 4.x | **版ごとにパッケージの置き場が違う**（下の「R の版が違うとき」） |
| rmql | **0.4.0 以上** | 確認は **0.4.0**（2026-11-20）。早期償還の債券タブのコール判断の境界が `compute_hull_white_callable_bond_decisions` を使うので、0.4.0 が要る |

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

必須（`server/scripts/check_r.R` が確かめる 15 個）：`httpuv`、`jsonlite`、`dplyr`、`purrr`、`tibble`、`tidyr`、`stringr`、`readr`、`readxl`、`writexl`、`xml2`、`zip`、`rlang`、`collapse`、`rmql`。任意（その機能を使うときだけ。TRS 契約書連携・レポート・Bloomberg 取得）：`pdftools`、`openssl`、`curl`、`processx`、`ps`、`httr2`、`flextable`、`stringi`、`later`、`future`、`furrr`。

```r
install.packages(c("httpuv", "jsonlite", "dplyr", "purrr", "tibble", "tidyr", "stringr", "readr",
                   "readxl", "writexl", "xml2", "zip", "rlang", "collapse"))
# 任意（必要になってから）
install.packages(c("pdftools", "openssl", "curl", "processx", "ps", "httr2", "flextable", "stringi", "later", "future", "furrr"))
```

### rmql を入れる

rmql（旧 RiemannFinMath）は別のリポジトリ（<https://github.com/besuke/RiemannQL>、この PC では `../RiemannQL`）。入れ方の正本は rmql の `docs/client_guide.md` と `docs/r_package.md`。要点：

```r
install.packages(
  "rmql",
  repos = c("https://besuke.github.io/RiemannQL", "https://cloud.r-project.org")
)
```

- **公開しているバイナリは Windows の R 4.4・4.5・4.6**（GitHub Actions で R の版ごとにビルドし、各 R でスモークテストを通した。2026-11-20 に 0.4.0 を公開）。Rust も Rtools も要らない。この PC（R 4.6.2）では、公開した R リポジトリからの導入を確かめた。**R 4.4 と 4.5 は、CI でビルドと検査をしただけで、この PC では試していない**。
- `remotes::install_github("besuke/RiemannQL")`（`subdir` なし）でも入る（`DESCRIPTION` をリポジトリの直下に置いた）。ただし常にソースからビルドするので、Rust と Rtools が要る。
- 入れ替えるときは、その DLL を使っている R のプロセス（Infrago Quant の R API、RStudio の R セッションなど）を**先に止める**。
- 旧名の `RiemannFinMath` は使わない。この PC の既定のライブラリーからも削除した。

### R の版が違うとき（手元の R と、この PC の R 4.6.0 が違う）

- **使う R は自動で決まる**（`ui/scripts/rscript.mjs`）：環境変数 `RSCRIPT` → `config/settings.local.env` の `RSCRIPT` → PATH → `R_HOME` → インストール済みの最新の R。複数の版が入っていて、最新でない R を使うときだけ指定する（`Copy-Item config/settings.example.env config/settings.local.env` して `RSCRIPT=` に Rscript.exe のパスを書く）。使う R と版は、起動のたびに表示される。
- **パッケージは R の版（4.5、4.6 のような 2 桁目）ごとに別の置き場に入る**。R の版を替えたら、上の `install.packages(...)` をその R でやり直す。
- **R 4.4・4.5・4.6（Windows）は、公開バイナリで入る**。それ以外（R 4.3 以前、Windows 以外）は、次のどれかになる。
  1. R 4.6 を入れる（いちばん簡単。複数の版は共存できる。`RSCRIPT` で選ぶ）。
  2. その版でソースからビルドする（Rust と Rtools が要る。`remotes::install_github("besuke/RiemannQL")`）。R 4.3 以前でのビルドは未確認。
  3. 手元の PC では、まず `-Mode check` で、選ばれた R と不足を確かめる（足りなければ、選ばれた R と不足のパッケージ、この PC にある別の R の一覧が出る）。
- Infrago Quant 側の R のコードは R 4.6.0 で確認した。ほかの版での動作は**確認していない**（`R 4.x` と書いているのは、版を決め打ちしないという意味で、4.x で動くという確認ではない）。

### Git に入れない、この PC だけのファイル

| ファイル | 内容 | 見本 |
|---|---|---|
| `config/settings.local.env` | 使う Rscript のパス（なくてよい） | `config/settings.example.env` |
| `config/deploy.local.env` | 社内に案内するホスト名・IP（社内LAN公開のときだけ） | `config/deploy.example.env` |
| `server/tmp/.Renviron`、`server/tmp/aladdin_endpoint.json` | Bloomberg・Aladdin・User-Agent の設定（実接続は未実施。値は書かない）。TRS 確認書をサーバーのフォルダーから読むときは、`QUANTLET_C1_SOURCE_DIRS=<フォルダー>;<フォルダー>` | なし |
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

- 起動の処理の本体は `scripts/InfragoQuant.ps1`（`start_infrago.ps1` から呼ばれる）。
- **サーバーとクライアントを別の PC で動かす**：サーバーの PC（R・rmql が要る）で `.\scripts\start_infrago_server.ps1`。R API を 0.0.0.0:8790 で起動し、クライアントに渡すアドレス（`http://<この PC>:8790`）を表示する。クライアントの PC（Node.js と `ui/` だけでよい。R は要らない）で `.\scripts\start_infrago_client.ps1 -ApiUrl http://<サーバーのPC>:8790`。画面（127.0.0.1:8091）は、`/api` をそのアドレスへ転送する。`-ApiUrl` の代わりに `config/deploy.local.env` の `INFRAGO_QUANT_API_URL` でもよい。サーバーの PC では Windows ファイアウォールで 8790 の受信を許可する。
  - 確認済み（2026-11-18）：1 台の PC の中で、LAN の IP アドレス経由でサーバーとクライアントをつなぎ、画面から `/api/health` が通ることを確かめた。**別の PC どうしでの接続（ファイアウォール越し）は未確認**
  - アドレスは **LAN の IP アドレス**（`http://192.168.x.x:8790`）を正とする。`127.0.0.1`・`localhost` は別の PC では使えず、クライアントのスクリプトも拒否する
  - コンピューター名・DNS 名（`-ApiUrl http://<名前>:8790`）は、2026-11-19 にサーバーの PC 自身から試したところ応答しなかった。名前が先に IPv6 に解決され、R API は IPv4（0.0.0.0）でしか待ち受けないため。名前を使うなら、DNS に IPv4 の A レコードを登録して IPv4 に解決させるか、IPv6 での待ち受けを調べる（未調査）
- 止めるときは、開いた「Infrago Quant Server (8790)」「Infrago Quant Client (8091)」のウィンドウを閉じる。
- ポートが使われていると、別のポートには移らずに止まり、使っているプロセスを示す。
- `ui/` で個別に起動するとき：`npm run api`（R API）、`npm run dev`（画面）、`npm run lan`（画面と API を 8091 で公開）。
- R の作業は RStudio（Positron）で `InfragoQuant.Rproj` を開く。開くと、使い方が表示される。`iq_check()` で、いま使っている R の確認ができる。

### 社内LANで公開する（配備）

`127.0.0.1` はこの PC の中だけで届くアドレスで、開発と内部の通信（起動の確認、画面から API への転送）にだけ使う。利用者に案内する URL・起動バッチが開く URL・接続確認ページに出す URL には、**配備先のホスト名（DNS で解決できる名前）またはこの PC の LAN の IP アドレス**を使う。

1. `config/deploy.example.env` を `config/deploy.local.env`（Git に入れない）に写し、`INFRAGO_QUANT_PUBLIC_HOST`（または `QUANTLET_PUBLIC_HOST`）にホスト名か IP アドレスを書く。空なら、この PC の LAN の IPv4 を自動で使う
2. `.\start_infrago.ps1 -Mode lan` で起動する。画面をビルドし、画面と API を 8091 でまとめて公開し、`http://<ホスト>:8091/` の応答を確かめてからブラウザーで開き、利用者に案内するアドレスを表示する
3. 他の端末から開けないときは、Windows ファイアウォールで 8091 の受信を許可する（この PC の設定。Infrago Quant からは変えない）

Infrago Quant Server（R）は環境変数 `QUANTLET_PUBLIC_HOST`（バッチが渡す）を読み、接続確認ページ（`#server`、`GET /api/server`）に利用者向けの URL を出す。開発用の起動（`.\start_infrago.ps1`、`npm run api`・`npm run dev`）は今までどおり `127.0.0.1` で、この PC の中だけで開ける。

ホスト名にアンダースコア（例 `MY_PC`）を含む Windows のコンピューター名は、DNS の名前として正しくなく、ブラウザーによっては開けない。その場合は IP アドレスか、社内 DNS に登録した名前を使う。

## 確認のコマンド（`ui/` で実行）

| コマンド | 確認すること | 前提 |
|---|---|---|
| `npm run typecheck` | 画面の型 | なし |
| `npm run check:r` | 使う R の版、必須パッケージ | R |
| `npm run test:nav` | ブラウザーで、トップ URL・個別ページの URL・グループの開閉・選択表示・関連画面・TBD・タブのタイトル（ヘッドレス Chrome） | `npm run api` と `npm run dev` を起動済み、Chrome（`CHROME`・`BASE_URL` で変えられる） |
| `npm run test:irrbb` | IRRBB の検算 11 項目 | R |
| `npm run test:early-redemption` | 早期償還（MBS の静的・ダイナミック OAS と経路）の検算 12 項目 | R |
| `npm run test:c1-source` | TRS 確認書の取得元（URL・許可したフォルダー）の検査の検算 33 項目（ネットワークなし） | R |
| `npm run reconcile:a1` / `reconcile:c1` | Curie との照合（A1・C1） | R |
| `npm run demo:offer` | 円債オファー 1 件のデモ Excel を作り直す | R |

2026-11-20、rmql 0.4.0 で、`check:r`（必須パッケージ 15 個）、`test:irrbb`（11/11）、`test:early-redemption`（12/12）、`npm run typecheck` を確認した。

`test:nav` の最後に最後まで通した実行は、59 件 PASS・7 件 FAIL（タブのタイトルだけ。原因は修正済み）。**修正後に最後まで通した実行はまだない**。

## どこに何があるか

| 場所 | 内容 |
|---|---|
| `ui/src/nav.ts` | サイドバーのまとまり・項目・関連画面・TBD・以前のアドレスの対応（画面を足すときはここ） |
| `ui/src/App.tsx` | 上の帯、サイドバー、画面の切り替え、タブのタイトル |
| `ui/src/analytics/` | イールドカーブ・TONA OIS・債券キャッシュフロー・早期償還・国債先物・クレジット CDS の画面。呼び出しは `ui/src/analyticsApi.ts` |
| `ui/src/charts/` | グラフ（Carmine Studio から写した `LineChart`・`FlowChart`） |
| `ui/src/styles.css` | 配色（カーマイン）、Aqua 風の部品、サイドバー、グラフ |
| `server/server.R` | HTTP API の経路 |
| `server/R/analytics/` | 上の6画面の計算（rmql を呼ぶ）。読み込みは `server/R/load_quantlet.R` の `.quantlet_modules` |
| `server/data/demo/` | 架空のデモデータ（先物の入力は `demo/futures/inputs.json`） |
| `ui/scripts/rscript.mjs`、`run-r.mjs` | 使う R の決め方と、起動前の確認 |

画面を足す手順：R の計算を `server/R/analytics/` に書く（金融計算は rmql。足りなければ rmql に足す）→ `load_quantlet.R` の `analytics` に足す → `server.R` に経路を足す → `ui/src/analyticsApi.ts` に型と呼び出し → `ui/src/analytics/` に画面 → `ui/src/nav.ts` に項目。

## 決めたこと（要点。全文は `CLAUDE.md`）

- 計算は rmql、R の API は取り込み・整形・集計・検証、画面は表示だけ（計算し直さない）。
- 市場データは、評価日と同じ市場日のものだけを使い、別の日付で補わない。
- Aladdin への送信はしない（下書きのみ）。Bloomberg の実接続は未実施（将来 INDIGO に移す）。
- 画面は Carmine Studio（`../Carmine`）と同じ構成・同じ Aqua 風の部品で、色はカーマイン。移した画面は仕様の説明を載せず、入力・結果・グラフ・表だけにする。
- Curie（`../Curie`）は変更しない。
- コミットと push は頼まれたときだけ。ステージした差分に、認証情報・個人のパス・社内 URL・実データがないことを確かめる。

## 未了・次にやること

済み（2026-11-20）：フォルダー名を `Infrago` に変え、デスクトップのショートカットと `InfragoClaude.bat` を直した。`origin` を新しい URL に直した。PR #1 をマージし、`main` を push した。

1. **公開の範囲を決める**：GitHub のリポジトリは 2026-11-18 の確認で public。意図したものでなければ非公開に戻す（Settings → Danger Zone → Change visibility）。決めたら CLAUDE.md の記述を直す。
2. **Carmine Studio のフォワードの直し**（未着手）：Carmine の yield-curves は原稿の2つの補間（ゼロ金利の線形補間、割引係数の対数線形補間）を再現する作りで、フォワードが折れ線・階段状になる。単調な対数3次補間のカーブを3つ目として足し、メインのグラフはそちらにする。原稿の2つは照合のために残す（照合の差 0 のテストを壊さない）。なお Carmine には、Infrago から移した「ノードのシミュレーション」と債券の日付入力がある（2026-11-19）。
3. Carmine Studio の残りの画面（ブラック・モデル、金利モデル、キャリブレーション、PRDC など）を移すか決める。移すのは実務で使うものだけ。
4. TBD の項目（レポート格付検証、ショート残検証、FRTB CVAR計算、クレジットVaR）。メニューの構成は 2026-11-20 に、利用者の指示で決めた（「GPS（含むキーレート）」は、TONA OIS・スワップの画面を当てた。違う意図なら nav.ts の 1 行で変える）。rmql にはクレジットリスクの関数（`compute_credit_risk`、`compute_portfolio_risk` など）がある。
5. 数値の確認が残っているもの：TONA OIS は Infrago のデモ気配（Carmine は別の気配）なので、Carmine との数値照合をしていない。早期償還は、静的 OAS・ダイナミック OAS・Hull-White の経路・コール判断の境界を移した（2026-11-19〜20）。静的 OAS は Carmine の照合済みの値と最大 0.26 bp 差で、原因は原稿の `uniroot` の精度。経路は rmql の乱数（seed 48）なので、原稿の経路とは数値が違う。コール判断の境界は、rmql の `compute_hull_white_callable_bond_decisions` を Coral Book II-8.4.2 と照合済み（rmql 側の記録）。CDS の Hazard Rate は、Carmine と同じ `uniroot` で求めている（rmql の `bootstrap_hazard_curve` は契約の既定が違うので使っていない）。
6. rmql 0.4.0 は導入済み。使える新しい関数（OIS スワップの日付を期間から作る `compute_ois_swap_dates` など）で、TONA OIS の `tona_swap_dates_QL` を置き換えられる可能性がある（未着手）。置き換えたら、`npm run test:irrbb` と、各画面の既定値の照合をやり直す。
7. 機能ごとの未了（実データ、Bloomberg の実接続、FpML の公式 XSD、承認済み AI API など）は、下の「機能ごとの未了」。そこにないもの：金融庁の IRRBB フロアの扱いの確認（既定はフロアなし）、Curie にある Aladdin の実 URL の扱い。

### 機能ごとの未了

- 実データの入力：Aladdin API による銘柄属性の取得、実際のオファー Excel・市場データへの対応（Curie と同じ未了事項）、A1 の市場データを画面から選ぶ・アップロードする機能
- Bloomberg の live 取得と、取得した OIS 気配を A1 の入力に選ぶ経路
- C1：FpML の公式 XSD、承認済みの AI API の接続先、Aladdin への送信
- テストの自動化（API の回帰テスト）。照合スクリプトとブラウザーの確認（`npm run test:nav`）は手で実行する
- レポート掲示板：本番の発行体ID体系、承認済みの AI API（配布用。C1 と同じく未設定）、レポートの削除・再読解、オファーシートの Excel 出力からのレポートへのリンク（Curie の A3 の構想）
- 日米国債金利：取得の定期実行（今は画面のボタンで取得する）
- サーバーの TypeScript 化は保留（2026-11-15 の指示）。する場合も、rmql に Node 版がないうちは、計算は R に残す

## 気をつけること

- **R の API（8790）が rmql の DLL を使っている**間は、rmql を入れ替えられない。先に R API を止める。
- `rmql` 0.4.0 より古い版が入っている PC では、早期償還の債券タブ（コール判断の境界）が失敗する。`-Mode check` で版を確かめる。
- 起動したウィンドウは、Claude Code のツールから起動すると、呼び出しが終わったときに閉じられることがある。確認のために立ち上げたサーバーは、確認が終わったら止める（8790・8091 が空いていることを確かめる）。
- `npm run test:nav` は、サーバーを前もって起動しておく。オファーの計算結果がないと、アセットスワップの銘柄の一覧は空になる（`POST /api/a1/run` で円債のデモを計算できる）。
- ブラウザー操作のツールは使えなかったので、画面の確認は、ヘッドレス Chrome を DevTools Protocol で操作して行っている（`ui/tests/nav.e2e.mjs`）。
