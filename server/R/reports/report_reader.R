# レポート掲示板：レポート1件の読解（AI による見出し・詳細サマリー・メタデータの抽出）と、原文根拠の照合。
#
# 取込と本文の抽出は C1 の関数（acquire_document_c1、document_pages_c1）を、AI の起動は C1 の run_claude_c1 を使う
# （Claude Code を R から processx で起動する。使えるツールは Read と Write だけで、作業フォルダの外は読み書きしない）。
# 指示書は agent_instructions/report_summary_instructions.md。読み方（reader）：
#   claude_code  Claude Code が原資料を読む（開発用。数分かかる）
#   saved        保存済みの抽出結果を使う（AI を呼ばない。サンプルの再現用）
# AI の結果は推測を含みうるので、R が引用（quote）を原資料の本文と照合する。照合は NFKC で全角・半角をそろえ、空白・改行を除いて行う
# （PDF の本文は文の途中で改行されるため）。

.report_outputs_RP <- c("summary.json", "review_items.md")

report_prompt_RP <- function(document) {
  paste(c(
    "# QuantLet レポート掲示板：レポートの要約と抽出",
    "",
    paste0("このフォルダの `", document$local_name, "`（原文）と `instructions.md`（指示書）を読んでください。"),
    "指示書のとおりに `summary.json` を作り、このフォルダに保存すること。推測で補わないこと。",
    paste0("ページ番号は原文のページ（全 ", document$pages, " ページ）。HTML の資料は全体を 1 ページとする。"),
    "記載のある値には、原文からの連続した引用（quote）とページ（page）を必ず付けること。",
    "原文を読めなかった場合は summary.json を作らず、review_items.md の先頭に「読めなかった」と理由を書くこと。",
    "このフォルダ以外のファイルを読み書きしないこと。"
  ), collapse = "\n")
}

report_claude_args_RP <- function(document) {
  c("-p", paste0("Read prompt.md in the current folder and follow it exactly. Read ", document$local_name,
                 " and instructions.md yourself. Write summary.json in this folder (Japanese headline and summary)."),
    "--output-format", "stream-json", "--verbose", "--allowedTools", "Read", "Write", "--permission-mode", "acceptEdits")
}

# 照合用の正規化：NFKC（全角・半角）、引用符・ダッシュをそろえ、空白・改行をすべて除く
normalize_quote_RP <- function(x) {
  x <- stringi::stri_trans_nfkc(dplyr::coalesce(as.character(x), ""))
  x <- .normalize_text_c1(x)
  gsub("[[:space:]　]+", "", x, perl = TRUE)
}

# 抽出結果の中で、原文根拠を持つ項目を1行1件の表にする
report_evidence_rows_RP <- function(s) {
  one <- function(group, label, x, value) {
    if (is.null(x) || !length(x)) return(NULL)
    tibble::tibble(group = group, label = label, status = x$status %||% "stated", value = value,
                   page = suppressWarnings(as.integer(x$page %||% NA)), quote = x$quote %||% "")
  }
  many <- function(group, xs, label_fun, value_fun) {
    purrr::imap(xs %||% list(), \(x, i) one(group, label_fun(x, i), x, value_fun(x))) |> purrr::list_rbind()
  }
  dplyr::bind_rows(
    one("発行元", "発行元", s$publisher, s$publisher$value %||% ""),
    many("執筆者・担当者", s$authors, \(x, i) paste0("執筆者・担当者 ", i), \(x) paste0(x$name %||% "", if (nzchar(x$role %||% "")) paste0("（", x$role, "）") else "")),
    one("発行日", "発行日", s$issue_date, s$issue_date$value %||% ""),
    many("対象発行体", s$issuers, \(x, i) paste0("対象発行体 ", i), \(x) x$name %||% ""),
    many("ISIN", s$isins, \(x, i) paste0("ISIN ", i), \(x) paste0(x$value %||% "", if (nzchar(x$security_name %||% "")) paste0("（", x$security_name, "）") else "")),
    many("格付け・アウトルックの変更", s$rating_changes, \(x, i) paste0("格付け・アウトルック ", i), \(x) paste0(
      x$agency %||% "", "：", x$issuer %||% "", " ", x$rating_type %||% "", " ", x$rating_from %||% "", "→", x$rating_to %||% "",
      if (nzchar(x$outlook_to %||% "")) paste0("、アウトルック ", x$outlook_from %||% "", "→", x$outlook_to) else "",
      if (nzchar(x$date %||% "")) paste0("（", x$date, "）") else "")),
    many("投資判断の変更", s$recommendation_changes, \(x, i) paste0("投資判断 ", i), \(x) paste0(x$target %||% "", "：", x$from %||% "", "→", x$to %||% "")),
    many("主な理由", s$reasons, \(x, i) paste0("理由 ", i), \(x) x$text %||% ""),
    many("サマリーの根拠", s$summary_evidence, \(x, i) paste0("根拠 ", i), \(x) x$text %||% "")
  )
}

# 引用の照合：指定ページにある／別のページにある／原文にない／記載なし（引用不要）
verify_report_quotes_RP <- function(evidence, pages) {
  if (!nrow(evidence)) return(dplyr::mutate(evidence, check = character(), found_page = integer()))
  norm_pages <- normalize_quote_RP(pages$text)
  purrr::pmap(evidence, function(group, label, status, value, page, quote) {
    if (!identical(status, "stated")) return(list(check = "記載なし（引用不要）", found_page = NA_integer_))
    q <- normalize_quote_RP(quote)
    if (!nzchar(q)) return(list(check = "引用なし（要確認）", found_page = NA_integer_))
    hit <- which(stringi::stri_detect_fixed(norm_pages, q))
    if (!is.na(page) && page %in% pages$page[hit]) return(list(check = "一致", found_page = page))
    if (length(hit)) return(list(check = paste0("ページ違い（", paste(pages$page[hit], collapse = "・"), " ページにある）"), found_page = pages$page[hit][1]))
    if (pages$method[match(page, pages$page)] %in% "no_text") return(list(check = "照合できない（本文のないページ）", found_page = NA_integer_))
    list(check = "原文にない", found_page = NA_integer_)
  }) |>
    purrr::list_transpose() |>
    tibble::as_tibble() |>
    (\(x) dplyr::bind_cols(evidence, x))()
}

# summary.json の形式チェック
check_report_summary_RP <- function(agent_dir) {
  p <- file.path(agent_dir, "summary.json")
  if (!file.exists(p)) {
    head <- if (file.exists(file.path(agent_dir, "review_items.md"))) paste(utils::head(readLines(file.path(agent_dir, "review_items.md"), encoding = "UTF-8", warn = FALSE), 5), collapse = " ") else ""
    return(list(state = if (grepl("読めなかった", head)) "unreadable" else "missing", issues = if (nzchar(head)) head else "summary.json がない"))
  }
  s <- tryCatch(jsonlite::fromJSON(p, simplifyVector = FALSE), error = function(e) NULL)
  if (is.null(s)) return(list(state = "invalid", issues = "summary.json が JSON として読めない"))
  issues <- c(if (!nzchar(s$headline %||% "")) "headline がない", if (!nzchar(s$summary %||% "")) "summary がない")
  if (length(issues)) list(state = "invalid", issues = issues) else list(state = "ok", summary = s, issues = character())
}

# 原資料から R が直接見つけた ISIN（AI が見落としても紐づけに使う）。チェックディジットも確かめる
find_isins_in_pages_RP <- function(pages) {
  purrr::map(seq_len(nrow(pages)), \(i) {
    hits <- unique(stringr::str_extract_all(stringi::stri_trans_nfkc(pages$text[i]), "\\b[A-Z]{2}[A-Z0-9]{9}[0-9]\\b")[[1]])
    if (!length(hits)) return(NULL)
    tibble::tibble(isin = hits, page = pages$page[i], valid_check_digit = is_valid_isin_Curie(hits))
  }) |> purrr::list_rbind() |> (\(x) if (is.null(x)) tibble::tibble(isin = character(), page = integer(), valid_check_digit = logical()) else x)()
}
