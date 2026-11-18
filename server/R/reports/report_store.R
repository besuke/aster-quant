# レポート掲示板：案件フォルダーへの記録、一覧、オファーとの紐づけ。
#
# 保存は C1 と同じ案件単位のフォルダー（server/data/cases/reports/<reportId>/）：
#   source/original.<拡張子>、source/acquisition.json、source/reading_pages.json   原資料・取得記録・ページごとの本文
#   agents/claude/                                                             AI への依頼文・指示書・原資料の写し・結果・標準出力
#   result/summary.json        AI の見出し・詳細サマリー・メタデータ（AI の出力そのまま）
#   result/verification.json   R の照合：原文根拠ごとの結果、見出しの長さ、状態
#   result/links.json          オファーとの紐づけ：銘柄単位（ISIN）と発行体単位。利用者の確定・却下もここに記録する
#   manifest.json、logs/run_log.jsonl
# 紐づけの相手は、発行体マスタ（data/demo/reference/。架空）と、A1 の最新の実行結果（data/runs/a1/*/result.json）。

reports_dir_RP <- function() file.path(Sys.getenv("QUANTLET_ROOT"), "data", "cases", "reports")
.now_RP <- function() format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")

# ---- 発行体マスタ・銘柄マスタ ---------------------------------------------------------------------------------
issuer_master_RP <- function(dir = file.path(Sys.getenv("QUANTLET_ROOT"), "data", "demo", "reference")) {
  readr::read_csv(file.path(dir, "issuer_master.csv"), col_types = readr::cols(.default = "c"), progress = FALSE)
}
security_master_RP <- function(dir = file.path(Sys.getenv("QUANTLET_ROOT"), "data", "demo", "reference")) {
  map <- readr::read_csv(file.path(dir, "isin_issuer.csv"), col_types = readr::cols(.default = "c"), progress = FALSE)
  attrs <- readRDS(a1_demo_inputs_QL()$attributes) |> dplyr::select("ISIN", "security_name", "currency")
  map |> dplyr::left_join(attrs, by = "ISIN") |> dplyr::left_join(issuer_master_RP(dir) |> dplyr::select("issuer_id", "issuer_name"), by = "issuer_id")
}

# 名前の照合用：NFKC、小文字、空白・中黒・会社の種類（株式会社・(株)・Corp. など）を除く
normalize_issuer_RP <- function(x) {
  x <- tolower(stringi::stri_trans_nfkc(x))
  x <- gsub("株式会社|\\(株\\)|有限会社", "", x)
  x <- gsub("\\b(inc|corp|co|ltd|plc|ag|sa|nv)\\b\\.?", "", x, perl = TRUE)
  gsub("[[:space:][:punct:]・　]+", "", x, perl = TRUE)
}

# 1つの言及（原文の発行体名）→ マスタの候補。exact：正式名か別名と一致、partial：一方が他方を含む（2文字以上）
issuer_candidates_RP <- function(mention, master = issuer_master_RP()) {
  m <- normalize_issuer_RP(mention)
  if (!nzchar(m)) return(tibble::tibble(issuer_id = character(), issuer_name = character(), match = character()))
  rows <- purrr::pmap(master, function(issuer_id, issuer_name, aliases, note) {
    names <- unique(normalize_issuer_RP(c(issuer_name, strsplit(dplyr::coalesce(aliases, ""), ";")[[1]])))
    names <- names[nzchar(names)]
    match <- if (m %in% names) "exact" else if (nchar(m) >= 2 && any(stringi::stri_detect_fixed(names, m) | stringi::stri_detect_fixed(m, names))) "partial" else NA
    if (is.na(match)) NULL else tibble::tibble(issuer_id = issuer_id, issuer_name = issuer_name, match = match)
  })
  dplyr::bind_rows(rows)
}

# 紐づけの初期状態を作る（AI の抽出と R の ISIN 検索から）。発行体は、正式名・別名に一致するものが1つだけなら自動で結び、
# 複数あるか部分一致だけなら、候補を示して利用者の確定を待つ（推測で選ばない）
build_report_links_RP <- function(summary, found_isins, sec = security_master_RP(), master = issuer_master_RP()) {
  ai_isins <- purrr::map(summary$isins %||% list(), \(x) tibble::tibble(isin = toupper(x$value %||% ""), page = suppressWarnings(as.integer(x$page %||% NA)), source = "AI の抽出"))
  isins <- dplyr::bind_rows(ai_isins, found_isins |> dplyr::filter(.data$valid_check_digit) |> dplyr::transmute(.data$isin, .data$page, source = "R の本文検索")) |>
    dplyr::filter(nzchar(.data$isin)) |>
    dplyr::summarise(page = suppressWarnings(min(.data$page, na.rm = TRUE)), source = paste(unique(.data$source), collapse = "・"), .by = "isin")
  isin_links <- isins |>
    dplyr::inner_join(sec, by = c(isin = "ISIN")) |>
    dplyr::transmute(level = "銘柄", isin = .data$isin, security_name = .data$security_name, issuer_id = .data$issuer_id, issuer_name = .data$issuer_name,
                     page = .data$page, basis = paste0("原文に ISIN の記載（", .data$source, "）"), status = "auto")
  unknown_isins <- setdiff(isins$isin, sec$ISIN)
  mentions <- purrr::map(summary$issuers %||% list(), \(x) {
    if (!identical(x$status %||% "stated", "stated")) return(NULL)
    cand <- issuer_candidates_RP(x$name %||% "", master)
    # 本文の ISIN の発行体は、候補の手がかりとして示す（確定はしない）
    hint_ids <- unique(isin_links$issuer_id)
    cand <- cand |> dplyr::mutate(hint = dplyr::if_else(.data$issuer_id %in% hint_ids, "原文の ISIN の発行体", ""))
    exact <- cand[cand$match == "exact", ]
    status <- if (nrow(exact) == 1L) "auto" else if (nrow(cand)) "pending" else "no_match"
    list(mention = x$name, page = suppressWarnings(as.integer(x$page %||% NA)), status = status,
         issuer_id = if (status == "auto") exact$issuer_id else NULL, issuer_name = if (status == "auto") exact$issuer_name else NULL,
         basis = switch(status, auto = "正式名・別名と一致（候補は1つ）",
                        pending = if (nrow(exact) > 1L) "正式名・別名と一致する発行体が複数ある" else "名前の一部だけが一致（確定が必要）",
                        no_match = "発行体マスタにない"),
         candidates = cand, decided_by = if (status == "auto") "自動" else NULL, decided_at = if (status == "auto") .now_RP() else NULL)
  }) |> purrr::compact()
  list(generated_at = .now_RP(), isin_links = isin_links, unknown_isins = unknown_isins, issuer_mentions = mentions,
       master_note = "発行体マスタはデモ（架空、data/demo/reference/）。本番の発行体ID体系は未定")
}

read_links_RP <- function(case_dir) jsonlite::fromJSON(file.path(case_dir, "result", "links.json"), simplifyVector = FALSE)
write_links_RP <- function(links, case_dir) {
  jsonlite::write_json(links, file.path(case_dir, "result", "links.json"), auto_unbox = TRUE, pretty = TRUE, null = "null", na = "null", dataframe = "rows")
}

# 利用者の確定（issuer_id）または却下（issuer_id = NULL）。確定できるのは候補の中の発行体だけ
decide_issuer_link_RP <- function(case_dir, mention_index, issuer_id = NULL) {
  links <- read_links_RP(case_dir)
  i <- as.integer(mention_index)
  if (is.na(i) || i < 1L || i > length(links$issuer_mentions)) stop("mention_index が範囲外である", call. = FALSE)
  m <- links$issuer_mentions[[i]]
  if (is.null(issuer_id)) {
    m$status <- "rejected"; m$issuer_id <- NULL; m$issuer_name <- NULL; m$basis <- "利用者が「該当なし」とした"
  } else {
    hit <- purrr::detect(m$candidates %||% list(), \(c) identical(c$issuer_id, issuer_id))
    if (is.null(hit)) stop("候補にない発行体である: ", issuer_id, call. = FALSE)
    m$status <- "confirmed"; m$issuer_id <- hit$issuer_id; m$issuer_name <- hit$issuer_name; m$basis <- "利用者が候補から確定した"
  }
  m$decided_by <- "利用者（画面）"; m$decided_at <- .now_RP()
  links$issuer_mentions[[i]] <- m
  links$updated_at <- .now_RP()
  write_links_RP(links, case_dir)
  cat(jsonlite::toJSON(list(time = .now_RP(), stage = "link_decision", mention = m$mention, status = m$status, issuer_id = m$issuer_id), auto_unbox = TRUE, null = "null"),
      "\n", file = file.path(case_dir, "logs", "run_log.jsonl"), append = TRUE, sep = "")
  links
}

# ---- 1件の登録（取込 → 本文 → AI → 保存 → 照合 → 紐づけ）---------------------------------------------------------
register_report_RP <- function(source_path, original_name, reader = c("claude_code", "saved"), saved_dir = NULL, report_id = NULL,
                               root_dir = reports_dir_RP(), instruction_path = file.path(Sys.getenv("QUANTLET_ROOT"), "agent_instructions", "report_summary_instructions.md")) {
  reader <- match.arg(reader)
  report_id <- report_id %||% paste0("RPT_", format(Sys.time(), "%Y%m%d_%H%M%S"), "_", paste(sample(c(0:9, letters[1:6]), 4, TRUE), collapse = ""))
  case_dir <- file.path(root_dir, report_id)
  purrr::walk(c("source", "agents", "result", "logs"), \(d) dir.create(file.path(case_dir, d), recursive = TRUE, showWarnings = FALSE))
  log_path <- file.path(case_dir, "logs", "run_log.jsonl")
  step <- function(stage, msg = "") {
    message(format(Sys.time(), "%H:%M:%S"), " [report] ", stage, if (nzchar(msg)) paste0(": ", msg))
    cat(jsonlite::toJSON(list(time = .now_RP(), stage = stage, message = msg), auto_unbox = TRUE), "\n", file = log_path, append = TRUE, sep = "")
  }
  manifest <- list(report_id = report_id, registered_at = .now_RP(), original_file_name = original_name, reader = reader,
                   app_version = curie_version_info_Curie(), stages = list(document = "未実行", reader = "未実行", verification = "未実行"))
  failure <- tryCatch({
    step("Fetching document", original_name)
    acq <- acquire_document_c1(source_path, file.path(case_dir, "source"))
    jsonlite::write_json(acq[setdiff(names(acq), "path")], file.path(case_dir, "source", "acquisition.json"), auto_unbox = TRUE, pretty = TRUE, null = "null")
    pages <- document_pages_c1(acq$path, acq$format$kind)
    jsonlite::write_json(pages, file.path(case_dir, "source", "reading_pages.json"), pretty = TRUE)
    document <- list(document_id = report_id, file_name = original_name, pages = nrow(pages), sha256 = acq$sha256, kind = acq$format$kind,
                     local_name = paste0("document.", tools::file_ext(acq$path)))
    manifest$document <- document
    manifest$stages$document <- "取得済み"
    agent_dir <- file.path(case_dir, "agents", "claude")
    dir.create(agent_dir, recursive = TRUE, showWarnings = FALSE)
    file.copy(acq$path, file.path(agent_dir, document$local_name), overwrite = TRUE)
    file.copy(instruction_path, file.path(agent_dir, "instructions.md"), overwrite = TRUE)
    writeLines(report_prompt_RP(document), file.path(agent_dir, "prompt.md"), useBytes = TRUE)
    unlink(file.path(agent_dir, .report_outputs_RP))
    run <- if (reader == "claude_code") {
      step("Running Claude Code", "reading the report and writing summary.json (this takes a few minutes)")
      run_claude_c1(agent_dir, document, args = report_claude_args_RP(document))
    } else {
      step("Using saved extraction", "AI is not called")
      if (is.null(saved_dir) || !file.exists(file.path(saved_dir, "summary.json"))) list(state = "failed", log = list(error = "保存済みの抽出結果がない"))
      else { file.copy(file.path(saved_dir, "summary.json"), file.path(agent_dir, "summary.json"), overwrite = TRUE); list(state = "ok", log = list(mode = "saved", saved_dir = saved_dir)) }
    }
    manifest$reader_log <- run$log
    if (run$state != "ok") stop(structure(class = c("rp_error", "error", "condition"), list(message = run$log$error %||% "AI の読解に失敗", kind = "読解失敗", call = NULL)))
    out <- check_report_summary_RP(agent_dir)
    if (out$state != "ok") stop(structure(class = c("rp_error", "error", "condition"), list(message = paste(out$issues, collapse = "; "), kind = if (out$state == "unreadable") "読解失敗" else "回答形式不正", call = NULL)))
    manifest$stages$reader <- if (reader == "saved") "取得済み（保存済みの抽出結果：AI は呼んでいない）" else "取得済み（Claude Code）"
    file.copy(file.path(agent_dir, "summary.json"), file.path(case_dir, "result", "summary.json"), overwrite = TRUE)
    s <- out$summary
    step("Verifying quotes")
    ev <- verify_report_quotes_RP(report_evidence_rows_RP(s), pages)
    headline_chars <- nchar(s$headline)
    stated <- ev[ev$status == "stated", ]
    state <- if (nrow(stated) && all(stated$check == "一致") && headline_chars <= 22) "確認済み" else "要確認"
    reasons <- c(if (any(stated$check != "一致")) paste0("原文根拠が一致しない項目が ", sum(stated$check != "一致"), " 件"),
                 if (headline_chars > 22) paste0("見出しが長い（", headline_chars, " 文字）"))
    jsonlite::write_json(list(state = state, reasons = reasons, headline_chars = headline_chars, evidence = ev, verified_at = .now_RP()),
                         file.path(case_dir, "result", "verification.json"), auto_unbox = TRUE, pretty = TRUE, null = "null", na = "null", dataframe = "rows")
    manifest$stages$verification <- state
    step("Linking to offers")
    write_links_RP(build_report_links_RP(s, find_isins_in_pages_RP(pages)), case_dir)
    NULL
  }, rp_error = function(e) list(kind = e$kind, message = conditionMessage(e)),
     c1_acquire_error = function(e) list(kind = "取得失敗", message = conditionMessage(e)),
     error = function(e) list(kind = "失敗", message = conditionMessage(e)))
  manifest$failure <- failure
  manifest$finished_at <- .now_RP()
  jsonlite::write_json(manifest, file.path(case_dir, "manifest.json"), auto_unbox = TRUE, pretty = TRUE, null = "null")
  step("Finished", if (is.null(failure)) "saved" else paste(failure$kind, failure$message))
  report_detail_RP(report_id, root_dir)
}

# ---- 読み出し ------------------------------------------------------------------------------------------------
.read_case_json_RP <- function(case_dir, ...) {
  p <- file.path(case_dir, ...)
  if (file.exists(p)) jsonlite::fromJSON(p, simplifyVector = TRUE) else NULL
}

# 掲示板の一覧（新着順＝登録の新しい順）。発行元・執筆者は見出しとは別の欄
list_reports_RP <- function(root_dir = reports_dir_RP()) {
  ids <- list.files(root_dir)
  rows <- purrr::map(ids, function(id) {
    d <- file.path(root_dir, id)
    man <- .read_case_json_RP(d, "manifest.json"); if (is.null(man)) return(NULL)
    s <- .read_case_json_RP(d, "result", "summary.json")
    v <- .read_case_json_RP(d, "result", "verification.json")
    links <- if (file.exists(file.path(d, "result", "links.json"))) read_links_RP(d) else NULL
    mentions <- links$issuer_mentions %||% list()
    list(report_id = id, registered_at = man$registered_at, file_name = man$original_file_name,
         failure = man$failure, state = v$state %||% (if (!is.null(man$failure)) man$failure$kind else "未完了"),
         issue_date = if (identical(s$issue_date$status, "stated")) s$issue_date$value else NA_character_,
         publisher = if (identical(s$publisher$status, "stated")) s$publisher$value else NA_character_,
         authors = if (length(s$authors)) paste(s$authors$name[s$authors$status == "stated"], collapse = "・") else NA_character_,
         headline = s$headline %||% NA_character_,
         isin_links = length(links$isin_links %||% list()),
         issuer_links = sum(purrr::map_chr(mentions, "status") %in% c("auto", "confirmed")),
         pending_links = sum(purrr::map_chr(mentions, "status") == "pending"),
         feedback = feedback_view_RP(id, root_dir = root_dir)[c("likes", "dislikes", "comment_count")])
  }) |> purrr::compact()
  rows[order(purrr::map_chr(rows, "registered_at"), decreasing = TRUE)]
}

# A1 の最新の実行結果（ワークフローごとに最新の1つ）
latest_a1_runs_RP <- function(runs_dir = file.path(Sys.getenv("QUANTLET_ROOT"), "data", "runs", "a1")) {
  files <- list.files(runs_dir, pattern = "^result\\.json$", recursive = TRUE, full.names = TRUE)
  if (!length(files)) return(list())
  info <- tibble::tibble(file = files, run_id = basename(dirname(files)), mtime = file.info(files)$mtime) |>
    dplyr::mutate(workflow = sub("^a1(JPY|ISO)_.*$", "\\1", .data$run_id)) |>
    dplyr::slice_max(.data$mtime, n = 1, by = "workflow", with_ties = FALSE)
  rlang::set_names(purrr::map(info$file, \(f) jsonlite::fromJSON(f, simplifyVector = TRUE)), info$workflow)
}

# レポートに対応するオファー（A1 の最新の実行結果から）：銘柄単位（ISIN）と発行体単位（確定・自動の発行体の銘柄）
offers_for_report_RP <- function(links, sec = security_master_RP(), runs = latest_a1_runs_RP()) {
  isins <- purrr::map_chr(links$isin_links %||% list(), "isin")
  issuer_ids <- purrr::map(links$issuer_mentions %||% list(), \(m) if (m$status %in% c("auto", "confirmed")) m$issuer_id) |> unlist() |> unique()
  purrr::imap(runs, function(run, wf) {
    o <- tibble::as_tibble(run$offers)
    if (!nrow(o)) return(NULL)
    # A1 の結果に発行体の列があっても、マスタの値で付け直す（列名の重複を避ける）
    o <- o |> dplyr::select(-dplyr::any_of(c("issuer_id", "issuer_name"))) |>
      dplyr::left_join(sec |> dplyr::select("ISIN", "issuer_id", "issuer_name"), by = "ISIN")
    o |>
      dplyr::filter(.data$ISIN %in% isins | .data$issuer_id %in% issuer_ids) |>
      dplyr::transmute(workflow = wf, run_id = run$run_id, ISIN = .data$ISIN, security_name = .data$security_name, issuer_name = .data$issuer_name,
                       level = dplyr::if_else(.data$ISIN %in% isins, "銘柄", "発行体"), offer_price = .data$offer_price,
                       pricing_status = .data$pricing_status, native_asw_bp = .data$native_asw_bp)
  }) |> purrr::list_rbind()
}

report_detail_RP <- function(report_id, root_dir = reports_dir_RP()) {
  d <- file.path(root_dir, report_id)
  if (!dir.exists(d)) return(NULL)
  links <- if (file.exists(file.path(d, "result", "links.json"))) read_links_RP(d) else NULL
  list(report_id = report_id, manifest = .read_case_json_RP(d, "manifest.json"), summary = .read_case_json_RP(d, "result", "summary.json"),
       verification = .read_case_json_RP(d, "result", "verification.json"), links = links,
       offers = if (is.null(links)) NULL else offers_for_report_RP(links),
       pages = .read_case_json_RP(d, "source", "reading_pages.json"))
}

# オファーの銘柄から関連レポートを探す：銘柄単位（ISIN）、発行体単位（自動・確定）、候補のまま（未確定）
reports_for_offer_RP <- function(isin, root_dir = reports_dir_RP(), sec = security_master_RP()) {
  issuer_id <- sec$issuer_id[match(isin, sec$ISIN)]
  board <- list_reports_RP(root_dir)
  purrr::map(board, function(r) {
    d <- file.path(root_dir, r$report_id)
    if (!file.exists(file.path(d, "result", "links.json"))) return(NULL)
    links <- read_links_RP(d)
    by_isin <- isin %in% purrr::map_chr(links$isin_links %||% list(), "isin")
    ms <- links$issuer_mentions %||% list()
    by_issuer <- !is.na(issuer_id) && any(purrr::map_lgl(ms, \(m) m$status %in% c("auto", "confirmed") && identical(m$issuer_id, issuer_id)))
    pending <- !is.na(issuer_id) && any(purrr::map_lgl(ms, \(m) identical(m$status, "pending") && issuer_id %in% purrr::map_chr(m$candidates %||% list(), "issuer_id")))
    level <- if (by_isin) "銘柄" else if (by_issuer) "発行体" else if (pending) "候補（未確定）" else NA
    if (is.na(level)) NULL else c(r[c("report_id", "issue_date", "publisher", "authors", "headline", "state")], list(level = level))
  }) |> purrr::compact()
}
