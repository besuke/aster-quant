# レポートの要約と抽出（QuantLet レポート掲示板）

業者（証券会社）や格付機関のレポートを読み、日本語の見出し・詳細サマリーと、原文に記載のあるメタデータを抽出する。

## 守ること

- 原文に書かれていることだけを使う。推測で補わない。記載がない項目は `status: "not_found"` とし、値は空にする
- 値を記録した項目（`status: "stated"`）には、原文からの**連続した引用**（`quote`）と、その引用がある**ページ番号**（`page`、PDF のページ。HTML は 1）を必ず付ける。引用は原文の文字をそのまま写す（要約・言い換え・語順の変更をしない）。引用は1文以内、長くても80文字程度にする
- 発行元（レポートを出した会社）と、レポートの中で言及されている格付機関・発行体を区別する
- 執筆者・担当者は、原文に名前が書かれている人だけを記録する
- 格付け・アウトルックの変更は、原文に変更前と変更後が書かれているものだけを記録する。業者の投資判断（推奨）の変更は格付けではないので `recommendation_changes` に分ける
- 発行体の名前は原文の表記のまま記録する（正式名に置き換えない）。ISIN は原文に書かれているものだけを記録する

## 出力：`summary.json`（UTF-8）

```json
{
  "headline": "XYZ社の財務見通しを下方修正",
  "summary": "詳細サマリー（日本語、3〜6文。原文の要点：結論、理由、数値、今後の注目点）",
  "report_type": "broker_research | rating_action | other",
  "publisher": {"status": "stated", "value": "ABC証券", "page": 1, "quote": "…"},
  "authors": [{"status": "stated", "name": "山田 太郎", "role": "シニア・クレジットアナリスト", "page": 1, "quote": "…"}],
  "issue_date": {"status": "stated", "value": "2026-11-15", "page": 1, "quote": "…"},
  "issuers": [{"status": "stated", "name": "XYZ", "page": 1, "quote": "…"}],
  "isins": [{"status": "stated", "value": "JP0000000000", "security_name": "…", "page": 2, "quote": "…"}],
  "rating_changes": [{"status": "stated", "agency": "…", "issuer": "…", "rating_type": "長期発行体格付け",
                      "rating_from": "A+", "rating_to": "A", "outlook_from": "安定的", "outlook_to": "ネガティブ",
                      "date": "2026-11-14", "page": 1, "quote": "…"}],
  "recommendation_changes": [{"status": "stated", "target": "…", "from": "…", "to": "…", "page": 2, "quote": "…"}],
  "reasons": [{"text": "主な理由の要約（日本語1文）", "page": 1, "quote": "…"}],
  "summary_evidence": [{"text": "サマリーの各文が拠る内容", "page": 1, "quote": "…"}]
}
```

- `headline`：日本語で**20文字程度（多くても22文字）**。対象（発行体など）と結論が分かるように書く。発行元・執筆者の名前は入れない（掲示板では別の欄に表示する）
- `summary`：原文に書かれた事実と見解だけで書く。数値は原文どおり
- `issue_date.value`：`YYYY-MM-DD`。原文の日付表記は `quote` に残す
- 配列の項目は、該当がなければ空の配列 `[]` にする（`publisher` と `issue_date` は該当がなければ `{"status": "not_found", "value": "", "page": null, "quote": ""}`）
- `reasons` と `summary_evidence` の各要素にも、原文の引用とページを付ける

## 読めなかった場合

原文を読めなかった場合は `summary.json` を作らず、`review_items.md` の先頭に「読めなかった」と書き、理由を書く。
