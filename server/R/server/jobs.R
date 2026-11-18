# HTTP API（server.R）が呼ぶ処理：A1・C1・Bloomberg。要求は list（JSON を読んだもの）、戻り値は JSON にする list。
# 金融計算は RiemannFinMath、データの取込・整形・結合・集計は Curie から移植した R の関数で行う。
# root は server フォルダー（load_quantlet() が QUANTLET_ROOT に設定する）。

# ---- A1 ------------------------------------------------------------------------------------------------
job_a1 <- function(req) {
  workflow <- match.arg(req$workflow, c("JPY", "ISO"))
  demo <- a1_demo_inputs_QL()
  offer_path <- req$offer_path %||% (if (workflow == "JPY") demo$offer_jpy else demo$offer_iso)
  run_dir <- req$run_dir
  dir.create(run_dir, recursive = TRUE, showWarnings = FALSE)
  out <- file.path(run_dir, sprintf("offer_results_%s_%s.xlsx", workflow, format(demo$valuation_date, "%Y%m%d")))
  run <- run_offer_sheet_QL(workflow, offer_path, out, offer_sheet = req$sheet, work_dir = file.path(run_dir, "work"))
  res <- a1_result_json_QL(run, workflow)
  res$offer_file <- basename(offer_path)
  res$input_note <- if (is.null(req$offer_path)) "デモのオファー（架空）" else "アップロードしたオファー"
  res$market_note <- "市場データ・銘柄属性はデモ（架空、評価日 2026-10-06）。Bloomberg からの取得は未接続"
  res
}

# ---- C1 ------------------------------------------------------------------------------------------------
job_c1 <- function(req) {
  mode <- match.arg(req$reader %||% "saved", c("saved", "claude_code", "api", "demo"))
  demo_dir <- if (mode %in% c("saved", "demo")) req$extraction_dir %||% file.path(Sys.getenv("QUANTLET_ROOT"), "data", "demo", "c1", "extraction_DEMO_TRS") else NULL
  case <- workflows_c1_case(req$source_path, mode, case_id = req$case_id, output_root = req$output_root,
                            claude_demo_dir = demo_dir, instruction_path = file.path(Sys.getenv("QUANTLET_ROOT"), "agent_instructions", "c1_trs_extraction_instructions.md"))
  read_json <- function(p) if (!is.na(p) && file.exists(p)) jsonlite::fromJSON(p, simplifyVector = TRUE) else NULL
  case_dir <- case$case_dir
  pages <- read_json(file.path(case_dir, "source", "reading_pages.json"))
  fpml <- case$fpml
  list(
    case_id = basename(case_dir), state = case$state, reader = mode,
    reader_note = switch(mode, saved = "保存済みの抽出結果を使った（AI は呼んでいない）", demo = "デモの抽出結果（AI は呼んでいない）",
                         claude_code = "Claude Code で読んだ", api = "承認済みの AI API で読んだ"),
    failure = case$results$failure,
    verdicts = case$validation$verdicts,
    final = isTRUE(case$validation$final),
    summary = if (!is.null(case$validation$conditions)) as.list(deal_summary_c1(case$validation$conditions)) else NULL,
    conditions = case$validation$conditions,
    checks = case$validation$checks,
    pages = pages,
    review_items = case$results$conditions_json$review_items,
    document = case$results$manifest$document,
    acquisition = case$results$manifest$acquisition,
    naming = if (is.null(case$validation$conditions)) NULL else c1_common_name(case$validation$conditions, read_aladdin_map_c1()),
    fpml_file = if (is.na(fpml)) NULL else basename(fpml),
    fpml_xml = if (is.na(fpml)) NULL else paste(readLines(fpml, encoding = "UTF-8", warn = FALSE), collapse = "\n"),
    aladdin = if (is.null(case$aladdin)) NULL else list(
      status = "DRAFT / NOT SENT", payload = read_json(case$aladdin$path),
      unresolved = read_json(file.path(case_dir, "result", "aladdin_unresolved.json")))
  )
}

# ---- Bloomberg -------------------------------------------------------------------------------------------
job_bbg_status <- function(req) {
  cfg <- bbg_dl_config_QL()
  list(config = cfg[c("credentials_set", "credentials_file_exists", "catalog", "httr2_installed")],
       live_ready = cfg$credentials_file_exists && cfg$httr2_installed,
       universe = bbg_ois_universe_QL(),
       note = "要求本文・エンドポイント・ティッカーは未確認の設計案（Riemann tools/market/fetch_bbg_dl_ois.R から移植）。live は未実行")
}

job_bbg_ois <- function(req) {
  mode <- match.arg(req$mode %||% "synthetic", c("synthetic", "live"))
  r <- fetch_bbg_ois_QL(req$start_date, req$end_date, mode)
  files <- if (!is.null(req$marketdate)) write_bbg_ois_files_QL(r$rates, req$marketdate, file.path(dirname(r$csv_path), "a1_input")) else character()
  # 値は返さない（件数と保存先だけ）。市場の気配を画面・応答に出さない
  list(mode = r$mode, request_id = r$request_id, csv_file = basename(r$csv_path), summary = r$summary,
       rows = nrow(r$rates), dates = c(format(min(r$rates$date)), format(max(r$rates$date))), a1_input_files = unname(basename(files)))
}

