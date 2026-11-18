# Infrago Quant

運用の分析・業務支援を行う Web アプリ（旧称 QuantLet）。債券・金利・クレジット・リスク（IRRBB）の計算画面と、オファーシート・TRS 契約書・レポート掲示板の業務画面を持つ。計算は R の HTTP API（`server/`）が RiemannFinMath を呼んで行い、画面（`ui/`、React＋TypeScript）は入力と表示だけをする。

- 始めるには：[`HANDOVER.md`](HANDOVER.md)（引き継ぎの正本：新しい PC・R の版が違う PC の準備、コマンド、社内LANでの公開、未了）。起動は [起動](#起動)
- 画面の構成と、できること：[画面](#画面)。API：下の「API」の節
- Claude Code 向けの決めごと：[`CLAUDE.md`](CLAUDE.md)

Curie（`../Curie`、R Project）の後継で、Curie の次の2つを移植し、画面を足してきた（Curie は変更していない。移行中も従来の手順 `source("scripts/run_demo_JPY.R")` などで使える）。

- **A1 オファーシート**：円債・外債のオファー Excel の取込、銘柄属性と市場データの結合、ASW の計算、Excel 出力
- **C1 TRS 確認書の連携**：確認書の取込、契約条件の抽出、原文との照合、条件 JSON・FpML の作成、未確定の項目と Aladdin 向けの下書き

| ディレクトリ | 担当 |
|---|---|
| `server/` | R の HTTP API（httpuv）。金融計算は `RiemannFinMath` を呼ぶ。取込・整形・結合・集計・検証は R と tidyverse で行う（Curie から移植）。新しい計算画面の計算は `server/R/analytics/` |
| `ui/` | React＋TypeScript の Web 画面。ファイルのアップロード、入力、API の呼び出し、JSON で返る結果の表示を担当する。計算はしない |

データはすべて架空のデモデータである（Curie のデモと同じもの）。実在の銘柄・市場価格ではない。

## 起動

準備（npm install、R のパッケージ、RiemannFinMath）、R の選び方、全コマンド、社内LANでの公開、確認の手順は、**`HANDOVER.md`** にまとめてある（引き継ぎの正本）。準備ができていれば、起動はこの1行。

```powershell
.\start_infrago.ps1    # R API（127.0.0.1:8790）と画面（http://127.0.0.1:8091/）を起動し、ブラウザーで開く
```

## 画面

画面の構成は Carmine Studio と同じ：上の帯（左にロゴと「Infrago Quantlet」、右に Infrago Quant Server の接続表示）と、その下の左サイドバー。サイドバーは4つのグループで、最初から全部開いている（自動では閉じない）。名前をクリックすると、そのグループだけ手動で開閉できる。構成は `ui/src/nav.ts`（項目を足すときはここ）。

| グループ | 項目（表示順） | 実装状況 |
|---|---|---|
| レポートと市場分析 | イールドカーブ分析（イールドカーブ・TONA OIS・スワップ・日米の国債金利・OIS を切り替え）／レポートサマリー（掲示板・レポート登録・レポート一覧）／発行体格付け推移 | 発行体格付け推移は準備中 |
| オファーレベル | オファーシート（取り込み・一覧。関連画面：TRS契約書連携） | 実装済み（比較の専用画面はない） |
| 商品評価 | アセットスワップ（銘柄の入口。関連画面：債券キャッシュフロー・国債先物・CTD）／早期償還（コール債・MBS） | 実装済み |
| リスク計算 | IRRBB／クレジットVaR（関連画面：クレジット・CDS）／格付け枠管理 | クレジットVaR・格付け枠管理は準備中（クレジット・CDS は動く） |

トップ URL では「レポートサマリー」の掲示板を表示する。個別ページの URL（`#curves` など）を直接開くと、そのページを表示し、そのグループの項目を選択状態にする。ブラウザのタブのタイトルは「Infrago Quantlet/（開いているメニュー名）」。アセットスワップはオファーシートの最新の計算結果から銘柄を探し、詳細は `#offers/<ISIN>` で開く（計算は A1 と同じ処理を再利用）。サーバー接続（`#server`）は右上の接続ステータスから開く。ブラウザでの確認は `npm run test:nav`（`ui/tests/nav.e2e.mjs`、サーバーと画面を起動しておく）。

色は深い緑（`--accent: #166534`）、ボタン・入力欄・選択・スライダーは Carmine Studio と同じ Aqua 風（光沢・角丸・影）、グラフと表は白地。右上の「Infrago Quant Server：接続中／未接続」は 15 秒ごとに `/api/health` の実際の応答で決める。

| メニュー | できること |
|---|---|
| イールドカーブ | ゼロ金利のノード（年限・日付・金利を編集、足す・削除）から、割引係数の対数を単調3次補間したカーブと、平行移動したカーブ（bp、スライダー）を作り、ゼロ金利・割引係数・フォワードの3グラフと年限ごとの表を出す。Carmine Studio の yield-curves から移した |
| TONA OIS・スワップ | 保存済みの円 OIS 気配（今はデモの架空データ）から TONA カーブを作り、選んだ年限の気配を ±bp 動かしたときの割引係数・ゼロ金利・1暦日フォワードとその差、基準カーブのパーレートで固定した OIS（固定払い・TONA 受け、年限と想定元本を選ぶ）の PV の変化、キャッシュフローを出す。Carmine Studio の yield-curve-ois から移した（Carmine の気配は GaussQuant のサンプルなので使わない） |
| 債券キャッシュフロー | 固定利付債（半年払い、30/360）の取引日・発行日・償還日・クーポン・単利利回り・Zスプレッドから、単価・複利利回り・経過利子・BPV・修正デュレーション・コンベクシティ・Zスプレッドの価格、キャッシュフローの棒グラフと表、価格と利回りの曲線（一次・二次の近似つき）を出す。Carmine Studio の deterministic-cashflow から、説明用の部分（解析式との比較、求根法の比較、模式図）を除いて移した |
| 早期償還（コール債・MBS） | コール条項つき債券（5年、半年クーポン、Hull-White 1因子。金利・a・σ・クーポン・最初のコール・コール価格を選ぶ）のコール付き価格・ブレット価格・発行体のコール・オプションの価値と、σ を動かしたときの変化。MBS（パススルー、PSA・借換えの感応度・借換え費用）の借換え金利シナリオ別の価格・加重平均life・CPR・キャッシュフロー。Carmine Studio の early-redemption から、RiemannFinMath で計算できる部分だけを移した（コール判断の境界・20本の経路・静的 OAS は原稿の独自の R 関数や乱数に依るので移していない） |
| 国債先物・CTD | 受渡適格銘柄（教材の例、価格は架空）のベーシス・インプライド・レポ・CTD・先物BPV・Carry の内訳。「現在の市場」と「全銘柄を同じ利回りで評価」（ストレス）を切り替え、利回りの水準ごとの CTD の入れ替わりを示す。Carmine Studio の jgb-futures から移した（入力は `server/data/demo/futures/inputs.json`） |
| クレジット・CDS | 標準 CDS（CDS2015、取引日・年限・市場スプレッド・契約クーポン・回収率・割引率・想定元本、ISDA／MidPoint）の NPV・Fair Upfront・Hazard Rate・生存確率・両レッグ、累積デフォルト確率と「市場スプレッドと Fair Upfront」のグラフ、キャッシュフロー表。Carmine Studio の credit-cds の標準5年物を、取引日と年限を選べる形にして移した |
| レポート分析掲示板 | 画面上部のタブで3画面を切り替える。**掲示板**（`#reports`）：新着順に発行元・執筆者、短い見出し、反応数。詳細から「いいね」「ダメ」、コメント、返信。**レポート登録**（`#reports/register`）：PDF・HTML の選択と登録、処理状況（保存・AI の読解・原文根拠の照合・紐づけ）。**レポート一覧**（`#reports/list`）：登録済みのレポートの表と、要約・原文根拠・オファーとの紐づけ（`#reports/list/<id>`。以前の `#reports/<id>` もここを開く） |
| 日米の国債金利・OIS | 「国債の公表利回り」（選んだ月の日米イールドカーブ、`YYYYMM` スライダー、再生・一時停止、観測日と欠損の表）と「評価用 OIS」（保存済みの OIS 気配から RiemannFinMath で作ったゼロ金利カーブと気配の表）を切り替える。それぞれ出典と基準日を示す |
| オファーシート作成 | 円建て・外貨建てのオファーシートを別々にアップロードして計算する（OIS ASW、JGB スプレッド・円換算 ASW、状態と理由、詳細、関連レポート、Excel）。ASW が使う OIS の基準日と、Bloomberg からの更新（失敗したときは理由と、今使えるデータの基準日） |
| TRS契約書連携 | TRS の個別契約書の取込・抽出・照合（原文根拠、FpML、Aladdin 向け JSON の**下書き・未送信**）と、キャッシュフロー・スケジュール（FundingLeg・ReturnLeg を「レッグ」列で区別した一つの表。Excel は2シート） |
| IRRBB金利シナリオ | 円建て固定利付債のサンプル・ポートフォリオを、国内基準行の3シナリオ／国際統一基準行の6シナリオで再評価する。基準カーブとショック後カーブ、年限ごとのショック幅（bp）を横並びにし、その下に銘柄別とポートフォリオ合計の基準PV・ショック後PV・PV変化の表を幅いっぱいで表示する |

**掲示板の反応とコメント**：反応（いいね／ダメ。ブラウザーごとに1つ、押し直すと取り消し）とコメント・返信は、レポートの案件フォルダーの `feedback.json`（`server/data/cases/reports/<reportId>/`）に保存し、再読み込み後も表示する。ログインはないので、表示名は画面で入れたもの（ブラウザーに覚える）。API は `GET /api/reports/<id>/feedback`、`POST /api/reports/<id>/reactions`、`POST /api/reports/<id>/comments`。

**評価用 OIS の一覧**：`GET /api/ois/datasets`・`GET /api/ois/curves?dataset=<id>`。デモ（架空）と、Bloomberg から取得して変換したもの（`server/data/market/bbg_dl/a1_input/`）を並べる。dry run の架空の値（SYNTHETIC）は出さない。Bloomberg の更新は `POST /api/market/ois/refresh`（状態は `GET /api/market/ois/status`）。

アップロードしたファイルは、サーバーのローカルフォルダーに保存し、処理はそこから読む。

| 保存先（`server/data/`、Git に入れない） | 内容 |
|---|---|
| `uploads/a1/<uploadId>__<元の名前>.xlsx` | オファーシート |
| `uploads/c1/<uploadId>__<元の名前>.pdf` | TRS 確認書 |
| `runs/a1/<runId>/` | A1 の出力 Excel（`offer_results_{JPY,ISO}_<評価日>.xlsx`）と作業ファイル |
| `cases/c1/<caseId>/` | C1 の案件フォルダー。構成は Curie と同じ（`source/`、`agents/claude/`、`result/conditions.json`、`result/fpml_DRAFT.xml`、`result/aladdin_request_DRAFT.json`、`result/aladdin_unresolved.json`、`r_validation.json`、`manifest.json`） |
| `market/bbg_dl/` | Bloomberg の要求本文・取得結果・A1 用に変換した OIS 気配 |

## API（`server/server.R`）

| 経路 | 内容 |
|---|---|
| `GET /api/health` | 版 |
| `POST /api/uploads/{a1,c1}?name=<ファイル名>` | 本文がファイル。拡張子（a1：.xlsx・.xls、c1：.pdf・.htm・.html）と大きさ（20 MB・50 MB）を確かめて保存し、`uploadId` を返す |
| `GET /api/uploads/{a1,c1}` | アップロード済みの一覧 |
| `POST /api/a1/run` | `{"workflow":"JPY"\|"ISO","uploadId":…}` → オファーごとの結果、カーブ、市場データの記録、`run_id` |
| `GET /api/a1/runs/<runId>/excel` | 出力 Excel |
| `POST /api/c1/run` | `{"uploadId":…,"reader":"saved"\|"claude_code"}` → 状態、判定、条件、ページ本文、FpML、Aladdin の下書き |
| `GET /api/c1/cases/<caseId>/{document,fpml,aladdin}` | 原資料、FpML、Aladdin の下書き |
| `GET /api/bloomberg/status`、`POST /api/bloomberg/ois` | 接続設定の有無、取得（既定は dry run） |
| `POST /api/analytics/zero-curves` | `{"evaluationDate","nodes":[{"tenor","date","ratePct"}],"shiftBp"}` → ゼロ金利・割引・平行移動のカーブ（`server/R/analytics/zero_curves.R`） |
| `POST /api/analytics/tona-ois` | `{"datasetId","bumpTenor","bumpBp","swapTenor","notional"}` → 気配・カーブ・OIS の基準とシナリオ（`tona_ois_scenario.R`） |
| `POST /api/analytics/bond` | `{"tradeDate","issueDate","maturityDate","couponPct","simpleYieldPct","zSpreadBp"}` → 価格・利回り・リスク・キャッシュフロー（`bond_cashflow.R`） |
| `POST /api/analytics/cds` | `{"tradeDate","tenor","spreadBp","couponBp","recoveryPct","ratePct","notional","engine"}` → 標準 CDS の評価（`credit_cds.R`） |
| `POST /api/analytics/futures` | `{"mode":"current"\|"flat","yieldPct","fundingPct"}` → 国債先物・CTD・先物BPV（`jgb_futures.R`） |
| `POST /api/analytics/early-redemption` | `{"bond":{…},"mbs":{…}}` → コール条項つき債券（Hull-White）と MBS（`early_redemption.R`） |

不正な入力は 400 と日本語のメッセージを返す。httpuv は一つの R プロセスで要求を順に処理するので、C1 を Claude Code で読む間（数分）は他の要求が待つ。

## C1：TRS のキャッシュフロー・スケジュール

C1 の案件詳細の「キャッシュフローを作る」（`POST /api/c1/cases/<caseId>/cashflows`）で、両レッグの日程と金額を作り、Excel に保存する。

- **分担**：日程の生成と金額の計算は RiemannFinMath（`create_trs_funding_leg`・`compute_trs_funding_cashflows`・`create_trs_return_leg`・`compute_trs_return_cashflows`。Riemann `docs/spec_trs.md`）。Infrago Quant（`server/R/c1/trs_cashflows.R`）は、C1 が原文で確認した契約条件だけを読み、RiemannFinMath の引数に変換し、不足と前提を記録し、Excel に整形する
- **列**：FundingLeg は計算期間（調整前・調整後）、リセット日、金利決定日、観測期間の開始・終了（ルックバック）、支払日、日数・年数・営業日数、複利金利、金額。ReturnLeg は計算期間、期初の評価日、評価日、規則による評価日、支払日、期初・期末の水準、騰落率、金額。頻度・カレンダー・営業日調整・支払ラグはレッグごとに当てる
- **状態**：各行に「金額の状態」（確定＝公表値だけ／試算＝市場データやシナリオを使う／算出不可＝空欄）と「金額の根拠」、「日程の状態」（前提の有無）、「不足項目」を書く。前提が不足する金額は空欄にする
- **市場データ**：A1 と同じく評価日と同じ市場日のデータだけを使う。FundingLeg の試算はデモの JPY OIS カーブ（2026-10-06、架空）から翌日物の先渡金利を作る。TONA の公表値は `server/data/market/fixings/tonar.csv`（`date`・`rate`）があれば使う（今はない）。ReturnLeg は指数値がないので算出不可で、画面でシナリオ（指数の年率）を入れたときだけ試算する
- **ファイル名**：C1 の共通名（`TRS_取引日_取引最終日_相手先の先頭5文字`、`c1_common_name()`）に `.xlsx`。シートは `FundingLeg` と `ReturnLeg` の2つ。契約書の PDF も同じベース名で保存できる（`GET /api/c1/cases/<caseId>/document?download=1`）。自社の名前（`QUANTLET_OUR_PARTY_NAMES`）を設定していないと、相手先が決まらず `UNKNOWN` になる（C1 の従来の規則）

**デモ TRS での照合（2026-11-15、ブラウザーで実行）**：契約条件との照合 27 項目のうち 26 項目が一致した（最初・最後の期間、期間の数、各期間の支払日＝終了日の 2 営業日後、リセット日＝期間の初日、金利決定日＝リセット日の 2 営業日前、観測開始＝5 営業日前、ReturnLeg の評価日＝基準日の 2 営業日前、最終評価日 2027-10-06）。残る1項目は参考の照合で、評価日の基準「Payment Date」を FundingLeg の支払日と読むと最終評価日が 2027-10-08 になり、確認書の 2027-10-06 と一致しない。このため ReturnLeg は「各期間の終了日の 2 営業日前」と読み（確認書の最終評価日と一致）、日程の状態を「前提あり（要確認）」とした。ReturnLeg の支払日は確認書に定義がない（Payment Date の支払ラグ・営業日調整は FundingLeg にしかない）ので空欄で、不足項目に示す。

| | 支払日 | 金額の状態（シナリオなし） |
|---|---|---|
| FundingLeg | 2027-01-13（1月11日が成人の日）、2027-04-12、2027-07-12、2027-10-13（10月11日がスポーツの日） | 期間1は算出不可（観測日 2026-10-01・02・05 の TONA 公表値がない）、期間2〜4は試算 |
| ReturnLeg | 空欄（不足） | すべて算出不可（指数値がない）。年率 2% のシナリオでは試算 |

## IRRBB金利シナリオ

結果名は「IRRBBシナリオによる債券ポートフォリオのPV変化」。評価対象はサンプルの固定利付債に限り、IRRBB の ΔEVE（銀行勘定全体）ではない。

- **ポートフォリオ**：`server/data/demo/irrbb/portfolio_jpy_fixed.csv`（架空）。残存約 2・5・10・20・30 年の円建て固定利付債 5 銘柄、額面 1 億円ずつ、年 2 回利払、Actual/365 Fixed、発行日 2026-09-20
- **基準カーブ**：オファーシートと同じデモの円 OIS（TONA、基準日 2026-10-06、架空）を RiemannFinMath でブートストラップしたもの。評価日も 2026-10-06
- **分担**：年限別のショック、ショック後カーブ、債券のキャッシュフローと再評価は RiemannFinMath（`get_irrbb_shock_sizes`・`compute_irrbb_shocks`・`compute_irrbb_curve_points`・`create_irrbb_shocked_curve`・`create_fixed_rate_bond`・`compute_bond_value_on_curve`。Riemann `docs/spec_irrbb.md`）。Infrago Quant の R（`server/R/irrbb/irrbb_scenarios.R`）は入力を整え、6 シナリオを一度に計算して JSON で返す（`GET /api/irrbb?floor=none|zero`）。画面はシナリオの切り替えと表・グラフだけ
- **シナリオ**：国内基準行は上方パラレル・下方パラレル・スティープ化の 3 つ、国際統一基準行はさらにフラット化・短期金利上昇・短期金利低下を加えた 6 つ
- **参照文書**：BCBS「Basel Framework SRP31」（2024-07-16 公表、2026-01-01 適用。SRP31.90〜31.93）。金融庁・日本銀行の 2024-10-15 の資料（国内基準行の 3 シナリオ）。金融庁の 2025-03-31 公表の告示改正（金利ショックの水準の修正。本邦の適用日は本実装では確認していない）。画面にも表で示す
- **前提**：円のショック幅はパラレル・短期・長期とも 100 bp（SRP31.90 Table 2）、形状は SRP31.91（x = 4）。ショックは基準カーブのゼロ金利（連続複利、Actual/365 Fixed）に加え、評価日から最後の期日まで月ごとの点を線形補間したカーブで評価する（基準 PV も同じ作り方。PV 変化がショックだけから生じるように）。**金利フロアは既定でなし**（SRP31.93 は各国当局が 0 以下のフロアを設けることを認める。金融庁の扱いは確認していない）。画面で 0% のフロア（参考）を選べる
- **基準カーブの作り直しによる差（計算上の前提）**：月次の点から作り直した基準カーブで評価した基準 PV の合計（507,976,841 円）は、元の TONA OIS カーブ（MonotonicLogCubic）で直接評価した場合より 130 円大きい（5 銘柄の合計、額面 5 億円に対して約 2.6e-7）。補間の違いによる差で、ショックの効果ではない。画面の「前提と参照文書」にも、計算した差を表示する
- **検算**（`server/tests/irrbb_checks.R`、11 項目すべて合格）：円のパラレルが全年限で ±100 bp、スティープ化が 3.5 年で 25.386 bp（約 +25.4 bp）、上方パラレルで 5 銘柄すべての PV が下がる、6 シナリオとも銘柄別 PV 変化の合計がポートフォリオの PV 変化と一致（差 4.5e-8 円以下）、国内基準行 3・国際統一基準行 6 シナリオ

## 日米の国債金利とイールドカーブ

- **出典**：米国は FRED の `DGS1`・`DGS5`・`DGS10`・`DGS20`・`DGS30`（`fredgraph.csv`、API キー不要）、日本は財務省「国債金利情報」の `jgbcm_all.csv`（1974年9月〜前月）と `jgbcm.csv`（当月）。1・5・10・20・30年の公表利回り（%）をそのまま使い、補間・計算はしない
- **整形（R、`server/R/yields/jgb_ust_yields.R`）**：観測日・国・年限・利回り・系列・出典の長い形にそろえる。財務省の基準日は和暦（S・H・R）を西暦にし、`-` は欠損にする。当月ファイルと全期間ファイルで同じ日があれば当月ファイルを使う
- **保存**：`server/data/market/yields/`（Git に入れない）に、取得したファイルそのまま（`raw/`）、`yields_daily.csv`、`provenance.json`（URL・取得日時・SHA-256・期間）。画面の「出典から取得・更新」（`POST /api/yields/refresh`）で取り直す。表示（`GET /api/yields/monthly`）は保存済みのデータだけを読み、通信しない
- **月次**：各国・各年限の月内最終観測値（その月で値のある最後の日の値）。観測日は年限ごとに表で示す。月内に値がない年限は「欠損」と示し、前後の月や他の年限から補わない（例：米国20年は1987〜1993年、米国30年は2002〜2006年に公表がない。日本の10・20・30年は開始前の月が欠損）。当月は「月の途中」と示す
- **画面**：横軸を年限とし、米国（青・丸）と日本（橙・四角）を重ねる。欠損は軸の下に白抜きの印で示し、線は欠損をまたいで結ばない。期間（全期間・2000年以降・直近10年）を選ぶと、その期間の全月の範囲で縦軸を固定し、再生中も変えない。月別のデータは最初に一度だけ取得し、スライダーと再生はその中で切り替える。年限の上にマウスを置くと両国の値と観測日を出す
- **OIS カーブとの区別**：画面の冒頭に「公表された国債利回りの比較で、A1 の評価に使う OIS カーブ（RiemannFinMath）とは別。この画面の値は計算に使わない」と示す
- FRED は独自の User-Agentでは応答しなかった（2026-11-15 確認）。取得には R の curl の既定の User-Agent を使う（個人の情報は送らない）

## レポート掲示板

**登録の流れ**（`server/R/reports/`）：アップロード（`data/uploads/reports/`）→ 案件フォルダーを作り原資料と本文を保存 → AI（Claude Code、C1 と同じ起動方法。使えるツールは Read と Write だけ）が指示書 `server/agent_instructions/report_summary_instructions.md` に従って `summary.json` を作る → R が原文根拠を照合 → オファーとの紐づけ → 掲示板に表示。

- **AI が作るもの**：日本語の見出し（20文字程度、多くても22文字。発行元・執筆者は入れない）、詳細サマリー、発行元、執筆者・担当者、発行日、対象発行体、ISIN、格付け・アウトルックの変更、投資判断の変更、主な理由、サマリーの根拠。原文に記載のある範囲だけで、記載がなければ「記載なし」。値ごとに原文のページと引用を付ける
- **R の照合**：引用が指定ページの本文にあるかを確かめる（NFKC で全角・半角をそろえ、空白・改行を除く。PDF の本文は文の途中で改行されるため）。結果は「一致」「ページ違い」「原文にない」など。すべて一致し見出しが22文字以内なら「確認済み」、それ以外は「要確認」
- **保存（案件単位、C1 と同じ方式）**：`server/data/cases/reports/<reportId>/` に `source/`（原資料・取得記録・ページ本文）、`agents/claude/`（依頼文・指示書・AI の結果・標準出力）、`result/summary.json`（AI の出力）、`result/verification.json`（照合）、`result/links.json`（紐づけ。利用者の確定もここに記録）、`manifest.json`、`logs/run_log.jsonl`
- **掲示板**：新着順（登録の新しい順）。発行日・発行元と執筆者（姓）・見出しを別の欄に表示する（例：`11/15 ｜ ABC証券・山田 ｜ XYZの財務見通し下方修正、格付けもA+→A`）。見出しは約20文字で、長いものは省略記号で切る。行を選ぶと、全文サマリー、格付けの変更、抽出した項目と原文根拠（ページ本文の中の引用を強調）、原資料、紐づけを開く
- **読み方**：「Claude Code で読む」（AI）と「保存済みの抽出結果」（サンプルのみ。`server/data/demo/reports/extraction_sample/`、AI を呼ばない）

**オファーとの紐づけ**

- **銘柄単位**：原文に ISIN があれば（AI の抽出と、R の本文検索の両方。チェックディジットも確かめる）、その銘柄と結びつける
- **発行体単位**：原文の発行体名を、発行体マスタの正式名・別名と照合する。一致する発行体が1つだけなら自動で結び、複数あるか名前の一部だけが一致するなら、候補を表示して利用者が確定する（または「該当なし」）。本文の ISIN の発行体は、候補の手がかりとして示すが自動では確定しない
- **発行体マスタ**：デモの銘柄属性は発行体名がすべて同じ（「架空発行体（テスト用）」）なので、架空の発行体マスタを `server/data/demo/reference/`（`issuer_master.csv`・`isin_issuer.csv`）に用意した。A1 の計算の入力は変えていない。本番の発行体ID体系は未定（Curie の A3 と同じ）
- **画面の行き来**：A1 のオファーの詳細に「関連レポート」（銘柄・発行体・候補（未確定）の区別つき）を表示し、選ぶと掲示板のそのレポートを開く。掲示板のレポートには「対応するオファー」（A1 の最新の実行結果。`data/runs/a1/<runId>/result.json`）を表示し、「オファーを開く」でその銘柄の詳細へ戻る（URL は `#a1/<ISIN>`、`#reports/<reportId>`）

**サンプル**：`server/data/demo/reports/sample_report_ABC_XYZ.pdf`（架空。ABC証券・山田 太郎、2026-11-15、XYZ の財務見通しの下方修正と架空格付機関の格下げ、テスト円債B（JPTEST000022）に言及）。HTML（同じフォルダー）を Chrome の印刷で PDF にしたもの。本文は発行体を「XYZ」とだけ書くので、XYZホールディングスと XYZ銀行の2つが候補になる。

## 移植の内容

### A1 オファーシート

データ処理は Curie のファイルを写し、計算の層だけを RiemannFinMath に置き換えた。関数名と出力の列は Curie と同じにしたので、Excel の列構成も同じである。

| Curie | Infrago Quant | 変更 |
|---|---|---|
| `R/z0_utility/`（取込設定・取込・ISIN・補間・属性・Excel 書式・表示・版）、`lagrange/import_data.R`、`lagrange/workflows_validate_worksheet.R` | `server/R/common/` | なし（環境変数名を `QUANTLET_*` に変更） |
| `R/a1_offer_sheet/convert_offer_sheet.R`、`spread_inputs.R`、`validate_offer_worksheet.R`、`write_offer_results_excel.R`、`workflows_offer_sheet.R` | `server/R/a1/` | 日数計算の対応確認と、実行環境・説明の文言だけ RiemannFinMath に変更 |
| `bond_build.R`、`curve_build.R`、`bond_yield_YEN.R`、`compute_offer_pricing.R`、`lagrange/instance_swap_curve.R`、`compute_asset_swap_ISO.R`、`compute_asset_swap_basis_JPY.R`（GaussQuant・QuantLib） | `server/R/a1/pricing_riemann.R` | RiemannFinMath の `bootstrap_ois_curve`、`create_fixed_rate_bond`、`compute_settlement_date`、`compute_ois_asset_swap`、`compute_yen_asset_swap`、`compute_remaining_years`、`compute_compound_yield_from_price` を呼ぶ |
| `environment_info.R`（GaussQuant の照合） | `server/R/common/environment_info.R` | Excel の「GaussQuant照合」シートは「計算エンジン」（RiemannFinMath の版と、呼ぶ関数の一覧）に替えた |
| 属性取得関数（デモ） | `server/R/a1/demo_attributes.R` | 同じ（Aladdin API からの取得は Curie と同じく未実装） |

計算規約は Curie と同じである：OIS カーブは spot OIS 気配、受渡2営業日、年1回払い、支払ラグ0、MonotonicLogCubic、外挿なし。ASW は受渡日に開始し、翌日物レッグは半年払い・支払ラグ0（Curie と同じくデモの仮定）。円債の複利利回りは残存年数を満年数＋端数 ACT/365 とし、小数第7位で切り捨てる。JGB とベーシスの補間（同じ償還日の平均と自然3次スプライン、外挿なし）は R の処理で、Curie の関数をそのまま使う。

**RiemannFinMath で対応していない部分**

| 部分 | Infrago Quant での扱い |
|---|---|
| 円換算 ASW の CCS 校正の残差（Curie の `ccs_repricing_npv_jpy`） | `compute_yen_asset_swap` が返さないので NA にした。`fair_spread_npv_jpy` は返り値（spread 0 の NPV ＋ フェアスプレッド × アニュイティ）から作る |
| OIS 指標 AONIA（AUD） | RiemannFinMath の OIS カーブは TONAR・SOFR・€STR・SONIA に限る（Riemann の決定事項）。AUD のオファーは「OIS カーブを構築できない」と理由を付けて計算しない。Curie は QuantLib で AUD も作れた。デモに AUD はない |
| 翌日物の預金（`instrument_type = deposit`）の気配 | RiemannFinMath のカーブは spot OIS の気配だけを使う。deposit を含む通貨は理由を付けて計算しない。デモにはない |
| カーブの外挿 | Curie は QuantLib の外挿禁止のエラーで止まっていた。Infrago Quant は計算終期が最後のピラーより後なら、理由を付けて計算しない（同じく外挿しない）。デモにはない |
| 変動利付債・期限前償還条項付き債 | Curie と同じく対象外（`unsupported`。固定利付債として代用しない） |

### C1 TRS 確認書

Curie の `R/c1_trs_terms/` の13ファイルを `server/R/c1/` にそのまま写した。変えたのは環境変数名（`Curie_*` → `QUANTLET_*`）と、表示・記録の名前（User-Agent、FpML のコメント、manifest の版の項目名）だけである。抽出指示書は `server/agent_instructions/c1_trs_extraction_instructions.md`。

- **読み方**：画面からは `saved`（保存済みの抽出結果。AI を呼ばない）と `claude_code`（Claude Code。開発用）を選べる。`saved` の抽出結果はデモの確認書のもの（`server/data/demo/c1/extraction_DEMO_TRS/`）で、別の契約書に使うと原文との照合で不一致になる。`api`（承認済みの AI API）は Curie と同じく接続先が未実装で、画面からは選べない
- **未確定の項目と Aladdin 向けの下書き**：Curie と同じ。送信はしない（送信先がテスト環境か本番環境か未確認、認証情報は未提供）。自社の名前（`QUANTLET_OUR_PARTY_NAMES`）と Aladdin の対応表（`QUANTLET_ALADDIN_MAP`）は `server/tmp/.Renviron` に書く。設定がなければ CP・Pay leg・Receive leg は Unknown、payLeg／recLeg は未確定になる
- **Aladdin の送信先**：Git に入っている `server/config/aladdin_endpoint_example.json` の URL はサンプル用（`https://aladdin.example.invalid/`）。実際の送信先は同じ形の JSON をローカル（例 `server/tmp/aladdin_endpoint.json`）に置き、`server/tmp/.Renviron` に `QUANTLET_ALADDIN_ENDPOINT=tmp/aladdin_endpoint.json` と書く（相対パスは `server` フォルダーから）。照合の基準として写した Curie の `curie_reference/c1/aladdin_unresolved.json` も、送信先の URL だけサンプル用に置き換えた（照合では比べない項目）
- **FpML の公式 XSD**：Curie と同じく未設定（`QUANTLET_FPML_XSD`）。そのため状態は「要確認」で、FpML は `fpml_DRAFT.xml` になる
- **フォルダー投入型**（`inbox_c1.R`）は写したが、HTTP API からは使っていない（画面のアップロードが代わる）

### Bloomberg 連携

**確認した範囲**：Riemann の Bloomberg 関連は `tools/market/fetch_bbg_dl_ois.R`（Data License の REST で TONAR・SOFR・€STR の OIS 気配 1Y・2Y・5Y・10Y を取る見本）だけだった。このスクリプトは単独で動き、RiemannFinMath のパッケージ本体からも Coral Book・Carmine Studio・Curie からも呼ばれていない。状態は Riemann 自身の記録どおり【設計案】である。要求本文・エンドポイント・トークンの流れは実際のアカウントで確かめておらず、ティッカーは候補である。live の取得は一度も実行されていない（`market_data/bbg_dl/` にあるのは dry run の架空の値だけ）。

`tools/market/fetch_jbts_bb_close.R` と `check_bb_price_from_simple.R` の「BB」は日本相互証券（Japan Bond Trading）の BB 引値（ウェブページの公表値）で、Bloomberg ではない。移植の対象外とした。

INDIGO は現時点で存在しない（ソースに参照もない）。Bloomberg のデータの取得は将来 INDIGO に移す予定なので、Infrago Quant では次のように分けた。

| 段階 | ファイル | INDIGO に移すとき |
|---|---|---|
| 取得（live：Data License、synthetic：通信しない） | `server/R/bloomberg/bbg_data_license.R` の `fetch_bbg_ois_QL()` | INDIGO の呼び出しに替える |
| 正規化：`date, currency, index, tenor, ticker, field, value, source` の長い形の表 | 同 `normalize_bbg_history_QL()` | この列を保つ |
| A1 の OIS 気配ファイルの形へ変換 | `server/R/bloomberg/bbg_to_market_data.R` | 変えなくてよい |
| 評価 | A1 の取込 → `pricing_riemann.R` → RiemannFinMath | 変えなくてよい |

接続設定・認証情報・取得したデータはローカルだけに置く：認証情報 JSON のパスは `QUANTLET_BBG_DL_CREDENTIALS`、カタログ ID は `QUANTLET_BBG_DL_CATALOG`（`server/tmp/.Renviron`）、データは `server/data/market/bbg_dl/`（どちらも Git に入れない）。API と画面は、設定があるかどうかと件数だけを返し、値は出さない。

**未了**：live の取得（httr2 が未導入、認証情報なし）、Data License の出力形式と PX_LAST の単位の確認、ティッカーの確認。A1 は今はデモの市場データだけを使い、Bloomberg から変換した OIS 気配ファイルを入力に選ぶ経路はまだない（変換したファイルは A1 の取込が読める形で書く）。

## Curie との照合

**A1**（2026-11-15 14:39 実行、`server/tests/reconciliation/a1/results/`）。基準は Curie の旧デモ結果 `output/offer_results_{JPY,ISO}_demo_20261006.xlsx`（2026-10-27 作成、GaussQuant 2026.9.12.1・QuantLib 1.42）の「オファー結果」シート。入力は同じデモデータ。

| 項目 | 件数 | 最大の差 | 許容誤差 |
|---|---|---|---|
| JPY OIS ASW | 5 | 5.3e-15 bp | 1e-6 bp |
| JGB スプレッド | 5 | 7.1e-15 bp | 1e-6 bp |
| 対象債の複利利回り | 5 | 0 | 1e-10 % |
| 補間 JGB 利回り | 5 | 4.4e-16 % | 1e-10 % |
| 経過利子・ダーティ価格（JPY） | 5・5 | 5.6e-17・4.3e-14 | 1e-10 |
| 外債の自国通貨 OIS ASW（USD・EUR） | 5 | 2.8e-14 bp | 1e-6 bp |
| 円換算 ASW | 5 | 1.1e-9 bp | 1e-6 bp |
| 校正した割引スプレッド z | 5 | 1.1e-9 bp | 1e-6 bp |
| 補間ベーシス・単純和・FX スポット | 5 ずつ | 3.6e-15 bp・2.8e-14 bp・0 | 1e-6 bp・1e-6 bp・0 |
| 経過利子・ダーティ価格（外債） | 5・5 | 4.4e-16・4.3e-14 | 1e-10 |
| 入力検証・計算状態・メッセージ | 12 | 全件一致（変動利付債とコール条項付き債は両方とも `unsupported`、理由の文言も同じ） | 完全一致 |

数値 84 項目がすべて許容誤差内、状態の不一致は 0。円換算 ASW と z の 1e-9 bp 程度の差は、z を求める解法の停止条件の違い（Curie は `uniroot` の許容誤差 1e-12、RiemannFinMath は自前の解法）による。Carmine Studio の照合記録（`../carmine-studio/reconciliation/asw/RECONCILIATION_ASW.md`）と同じ大きさである。

画面からの1件：円債オファー1件（テスト円債B 0.90% 2031/3、JPTEST000022、単価 98.15。`server/data/demo/a1/offers/demo_offer_JPY_single_JPTEST000022.xlsx`）をアップロードして計算すると、ASW 10.4841258717 bp、JGB スプレッド 11.5189351854 bp、ダーティ価格 98.2067123288 になり、上の照合の値と同じだった。

**C1**（2026-11-15 14:42 実行、`server/tests/reconciliation/c1/results/`）。基準は Curie の案件 `output/c1_trs/cases/DEMO_TRS_confirmation_20261027_081517`（2026-10-27）。同じ原資料（SHA-256 が一致するもの）と、その案件に残る Claude の抽出結果を `saved` で読ませた。

| 項目 | 結果 |
|---|---|
| 状態、4つの判定（XML構文・公式XSD・原文根拠・条件JSONとの整合） | 一致（要確認。公式XSD は未設定で未実施、他の3つは合格） |
| 条件 47 件（項目・レッグ・番号・値・単位・記載状況・ページ・位置・引用・確認状態・備考） | 全行一致 |
| 検証の詳細（39 件）、FpML の内容と出力名（`fpml_DRAFT.xml`）、原資料の SHA-256 | 一致 |
| Aladdin の下書き本文（`{}`）と状態（未確定 1 項目） | 一致 |
| 未確定の項目の理由の文言 | 差あり（下記） |

理由の文言の差は設定の違いによるもので、コードの差ではない。Curie の案件は自社の名前（`our_party_names`）が設定され、受取者・支払者のどちらとも一致しない状態で作られた（値は記録されていない）。Infrago Quant の照合は名前が未設定なので「名前が対応表にない」という別の文言になる。一致しない仮の名前を設定すると、文言も Curie と一致した（照合スクリプトの14項目め）。

なお、Curie の `data/demo_c1_trs/pdf/DEMO_TRS_confirmation.pdf` は案件の作成後（2026-10-27 23:54）に作り直されていて、案件の原資料と SHA-256 が違う（大きさは同じ）。Infrago Quant のデモには案件の原資料（`source/original.pdf`）を写した。

## Carmine Studio から移した6画面の照合（2026-11-18）

計算は RiemannFinMath 0.3.2（R 4.6.0）。同じ入力で Carmine Studio の R 関数と比べた。

- クレジット・CDS：既定の標準5年物（取引日 2022-08-19、スプレッド 30.426bp、クーポン 100bp、回収率 40%、割引率 0.25%）で、Hazard Rate 0.005139809・NPV −334,962.6 円・Fair Upfront −334,974 円。Carmine の `cds_isda()` との差は Hazard Rate・NPV とも 0
- イールドカーブ：既定のノード（Carmine と同じ日付）で、年限ごとの割引係数の差は 0（Carmine の `curve_compute()`）
- 債券キャッシュフロー：既定（40年債、クーポン 7.5%、単利 6.515%）で単価 110.926、複利利回り 6.710%、修正デュレーション 13.650、コンベクシティ 321.173。Carmine と同じ RiemannFinMath の関数・引数。価格と利回りの曲線は Carmine の解析式ではなく RiemannFinMath の `compute_price_from_compound_yield` で描く
- TONA OIS：気配が Carmine（GaussQuant のサンプル）と違うので数値の照合はしていない。デモ（2026-10-06）で 7Y 気配 +1bp のとき、7Y OIS（100億円）の PV の変化は計算できることを確かめた
- 国債先物・CTD：既定（現在の市場）で CTD は 373回債、先物BPV 0.08793833。ストレス（8%・9%）で CTD 383回債、先物BPV 0.06749607。Carmine の `fut_compute()` との差は先物BPV・Net Basis・CTD とも 0
- 早期償還：既定でコール付き価格 100.4516、ブレット 104.6871、コール・オプション 4.2355。MBS の3シナリオの価格と加重平均 life も Carmine の `cb_bond()`・`cb_mbs()` との差が 0
- Hazard Rate は Carmine と同じく `uniroot`（RiemannFinMath の CDS 評価値の NPV がゼロになる点）で求める。RiemannFinMath の `bootstrap_hazard_curve` は契約の既定が違うので使っていない

## 再現手順

```powershell
cd C:/AnalyticFin/Projects/InfragoQuant/ui
npm run reconcile:a1    # A1 の照合
npm run reconcile:c1    # C1 の照合
npm run demo:offer      # 円債オファー1件のデモ Excel を作り直す
```

R は「どの R を使うか」と同じ決め方で選ばれる。R のスクリプトは自分の場所から `server/`（`VERSION` のあるフォルダー）を探して作業ディレクトリにするので、`Rscript server/tests/reconciliation/a1/reconcile_a1.R` のように直接起動してもよい。照合の基準ファイルは `server/tests/reconciliation/curie_reference/` に写したもので、Curie のファイルは読まない。

画面での確認：`npm run api` と `npm run dev` を起動し、A1 タブで `demo_offer_JPY_single_JPTEST000022.xlsx` を「円債オファーシート」にアップロードして計算する。C1 タブで `server/data/demo/c1/DEMO_TRS_confirmation.pdf` をアップロードし、読み方「保存済みの抽出結果」で実行する。

## ブラウザーでの確認（2026-11-15）

Chrome（ヘッドレス）を DevTools Protocol で操作し、http://127.0.0.1:8091/ で実際にファイル選択・クリック・キー操作を行った（ブラウザーのコンソールエラーはなし）。

**日米国債金利**：最新の月（2026年11月、月の途中、観測日 2026-11-12）から、キー操作（Home・→）で 2000年1月 → 2000年3月に切り替わった。再生すると1か月ずつ進み、一時停止で止まった。再生中も縦軸の目盛りは変わらなかった。全期間にして 1974年9月・1990年1月・2008年3月を選ぶと、両国の値と観測日が表とグラフで切り替わった。欠損も表示された（1974年9月は日本の10・20・30年と米国の30年、1990年1月は米国の20年と日本の30年）。年限10年の上にマウスを置くと、両国の値と観測日が出た。

確認の途中で、再生が約1秒後に最新の月へ戻って止まる不具合を見つけて直した。開発時（React の StrictMode）は月次データの取得が2回走り、遅れて届いた応答で状態が初期化されていた。今は最後の取得の応答だけを使う。

**レポート掲示板**：A1 で円債オファーを計算したあと、サンプル（`ABC証券_XYZクレジットアップデート_20261115.pdf` という名前の写し）をアップロードし、Claude Code で登録した（44秒、Claude Code の費用の目安 0.27 USD）。結果は次のとおり。

1. 案件フォルダー `data/cases/reports/RPT_20261115_153947_c76c/` に、サマリー・照合・紐づけが保存された
2. 掲示板に `11/15 ｜ ABC証券・山田 ｜ XYZの財務見通し下方修正、格付けもA+→A`（見出し22文字）、状態「確認済み」で表示された
3. 原文根拠16件がすべて「一致」した。格付け・理由・ISIN の行を開くと、ページ本文の中で引用が強調された
4. 紐づけは、銘柄単位で JPTEST000022 が自動、発行体「XYZ」は候補2つ（XYZホールディングス・XYZ銀行）で確定待ちになった。XYZホールディングスに確定すると、対応するオファーに JPTEST000014（発行体）と JPTEST000022（銘柄）が出た
5. 「オファーを開く」で JPTEST000022 の詳細が開き、関連レポート（銘柄）が表示された。JPTEST000014 には関連レポート（発行体）、XYZ銀行の JPTEST000030 には何も出なかった。関連レポートを選ぶと、掲示板のそのレポートに戻った

AI の出力は実行ごとに少し変わる（見出しは1回目が20文字、2回目が22文字）。

## 未了

未了・次にやること・機能ごとの未了は、`HANDOVER.md` の「未了・次にやること」にまとめてある。
