# QuantLet の HTTP API（R、httpuv）。既定では 127.0.0.1 だけで待ち受ける。
#
#   Rscript server/server.R [--port 8790] [--host 127.0.0.1] [--static ../ui/dist]
#
#   GET  /api/health                         -> 版と読込状態
#   GET  /api/uploads/a1 | /api/uploads/c1   -> アップロード済みファイルの一覧
#   POST /api/uploads/a1?name=<ファイル名>    本文はファイルそのもの（.xlsx）-> {uploadId}。保存先 data/uploads/a1/
#   POST /api/uploads/c1?name=<ファイル名>    本文はファイルそのもの（.pdf/.htm/.html）-> {uploadId}。保存先 data/uploads/c1/
#   POST /api/a1/run       {"workflow":"JPY"|"ISO","uploadId":"..."(省略でデモ),"sheet":null} -> オファーごとの結果、カーブ、市場データ
#   GET  /api/a1/runs/<runId>/excel          -> 出力 Excel
#   POST /api/c1/run       {"uploadId":"..."(省略でデモ),"reader":"saved"|"claude_code"} -> 条件・原文根拠・検証・FpML・Aladdin 下書き
#   GET  /api/c1/cases/<caseId>/document     -> 原資料（PDF・HTML）
#   GET  /api/c1/cases/<caseId>/fpml         -> FpML（fpml_DRAFT.xml または fpml_final.xml）
#   GET  /api/c1/cases/<caseId>/aladdin      -> Aladdin 向け JSON の下書き（未送信）
#   GET  /api/bloomberg/status               -> 接続設定の有無（値は返さない）
#   POST /api/bloomberg/ois {"start_date":"2026-09-01","end_date":"2026-10-06","marketdate":"2026-10-06","mode":"synthetic"} -> 件数と保存先
#   GET  /api/a1/latest                      -> A1 の最新の実行結果（ワークフローごと。レポートからオファーへ戻るときに使う）
#   GET  /api/yields/monthly                 -> 日米の国債の公表利回り（1・5・10・20・30年）の月次（月内最終観測値と観測日）
#   POST /api/yields/refresh                 -> FRED と財務省から取得して data/market/yields/ に保存
#   POST /api/uploads/reports?name=<ファイル名> 本文がファイル（.pdf/.htm/.html）。保存先 data/uploads/reports/
#   POST /api/reports/register {"uploadId":"...","reader":"claude_code"} | {"sample":true,"reader":"saved"} -> 登録したレポート
#   GET  /api/reports                        -> 掲示板（新着順）
#   GET  /api/reports/<id>                   -> サマリー・原文根拠・ページ本文・紐づけ・対応するオファー
#   POST /api/reports/<id>/links {"mention_index":1,"issuer_id":"ISS_..."|null} -> 発行体の候補の確定・却下
#   GET  /api/reports/<id>/document          -> 原資料
#   GET  /api/reports/related?isin=<ISIN>    -> オファーの銘柄に関連するレポート（銘柄・発行体・候補）
#
# httpuv は1つの R プロセスで要求を順に処理する。C1 を Claude Code で読む間（数分）は、他の要求は待つ。

suppressPackageStartupMessages({
  library(httpuv)
  library(jsonlite)
})

server_dir <- local({
  arg <- grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE)
  if (length(arg)) dirname(normalizePath(sub("^--file=", "", arg[1L]), winslash = "/")) else normalizePath(getwd(), winslash = "/")
})
source(file.path(server_dir, "R", "load_quantlet.R"), encoding = "UTF-8")
load_quantlet(server_dir)
source(file.path(server_dir, "R", "server", "jobs.R"), encoding = "UTF-8")

args <- commandArgs(trailingOnly = TRUE)
arg_value <- function(name, default) {
  i <- which(args == name)
  if (length(i) && length(args) > i) args[i + 1L] else default
}
port <- as.integer(arg_value("--port", "8790"))
host <- arg_value("--host", "127.0.0.1")
static_dir <- arg_value("--static", NA_character_)
if (!is.na(static_dir)) {
  static_dir <- normalizePath(file.path(server_dir, static_dir), winslash = "/", mustWork = FALSE)
  if (!file.exists(file.path(static_dir, "index.html"))) stop("No index.html in ", static_dir, ". Run npm run build in ui/ first.")
}

# ---- 保存先（すべて server/data/ の下。Git に入れない）--------------------------------------------------------------
data_dir <- file.path(server_dir, "data")
dirs <- list(uploads_a1 = file.path(data_dir, "uploads", "a1"), uploads_c1 = file.path(data_dir, "uploads", "c1"),
             runs_a1 = file.path(data_dir, "runs", "a1"), cases_c1 = file.path(data_dir, "cases", "c1"))
invisible(lapply(dirs, dir.create, recursive = TRUE, showWarnings = FALSE))
dirs$uploads_reports <- file.path(data_dir, "uploads", "reports")
dir.create(dirs$uploads_reports, recursive = TRUE, showWarnings = FALSE)
upload_kinds <- list(a1 = list(dir = dirs$uploads_a1, ext = c("xlsx", "xls"), max = 20 * 1024^2),
                     c1 = list(dir = dirs$uploads_c1, ext = c("pdf", "htm", "html"), max = 50 * 1024^2),
                     reports = list(dir = dirs$uploads_reports, ext = c("pdf", "htm", "html"), max = 50 * 1024^2))
id_ok <- function(x) is.character(x) && length(x) == 1L && grepl("^[A-Za-z0-9_-]{1,120}$", x)
new_id <- function(prefix) paste0(prefix, "_", format(Sys.time(), "%Y%m%d_%H%M%S"), "_", paste(sample(c(0:9, letters[1:6]), 6, TRUE), collapse = ""))
safe_name <- function(x) {
  x <- enc2utf8(basename(x))
  x <- gsub('[<>:"/\\\\|?*[:cntrl:]]', "_", x)
  x <- trimws(x)
  if (!nzchar(x)) "file" else substr(x, max(1L, nchar(x) - 149L), nchar(x))
}

http_error <- function(status, message) stop(structure(class = c("http_error", "error", "condition"),
                                                      list(message = message, status = status, call = NULL)))

find_upload <- function(kind, upload_id) {
  if (!id_ok(upload_id)) http_error(400, "uploadId が不正である")
  hit <- list.files(upload_kinds[[kind]]$dir, pattern = paste0("^", upload_id, "__"), full.names = TRUE)
  if (length(hit) != 1L) http_error(404, paste0("アップロードが見つからない: ", upload_id))
  list(path = normalizePath(hit, winslash = "/"), file_name = sub(paste0("^", upload_id, "__"), "", basename(hit)))
}

list_uploads <- function(kind) {
  f <- list.files(upload_kinds[[kind]]$dir, pattern = "__", full.names = TRUE)
  if (!length(f)) return(list())
  info <- file.info(f)
  o <- order(info$mtime, decreasing = TRUE)
  lapply(o, function(i) {
    b <- basename(f[i])
    list(uploadId = sub("__.*$", "", b), fileName = sub("^.*?__", "", b, perl = TRUE),
         bytes = info$size[i], uploadedAt = format(info$mtime[i], "%Y-%m-%dT%H:%M:%S%z"))
  })
}

save_upload <- function(kind, name, body) {
  spec <- upload_kinds[[kind]]
  name <- safe_name(name)
  ext <- tolower(tools::file_ext(name))
  if (!ext %in% spec$ext) http_error(400, paste0("拡張子 .", ext, " は受け付けない（", paste0(".", spec$ext, collapse = "・"), "）"))
  if (!length(body)) http_error(400, "ファイルが空である")
  if (length(body) > spec$max) http_error(413, paste0("ファイルが大きすぎる（上限 ", spec$max / 1024^2, " MB）"))
  id <- new_id(kind)
  path <- file.path(spec$dir, paste0(id, "__", name))
  writeBin(body, path)
  list(uploadId = id, fileName = name, bytes = length(body), savedTo = paste0("data/uploads/", kind, "/", basename(path)))
}

# ---- 応答 --------------------------------------------------------------------------------------------------------
to_json <- function(x) as.character(toJSON(x, auto_unbox = TRUE, null = "null", na = "null", digits = NA, dataframe = "rows", POSIXt = "ISO8601"))
json_response <- function(status, body) {
  list(status = as.integer(status), headers = list("Content-Type" = "application/json; charset=utf-8", "Cache-Control" = "no-store"),
       body = to_json(body))
}
file_response <- function(path, type, download_name = NULL) {
  headers <- list("Content-Type" = type, "Cache-Control" = "no-store")
  if (!is.null(download_name)) headers[["Content-Disposition"]] <- paste0("attachment; filename*=UTF-8''", utils::URLencode(download_name, reserved = TRUE))
  list(status = 200L, headers = headers, body = readBin(path, "raw", file.info(path)$size))
}
content_types <- c(pdf = "application/pdf", htm = "text/html; charset=utf-8", html = "text/html; charset=utf-8",
                   xml = "application/xml; charset=utf-8", json = "application/json; charset=utf-8",
                   xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                   js = "text/javascript; charset=utf-8", css = "text/css; charset=utf-8", svg = "image/svg+xml", png = "image/png",
                   ico = "image/x-icon", woff2 = "font/woff2")

read_body <- function(req) {
  input <- req$rook.input
  if (is.null(input)) return(raw())
  input$rewind()
  input$read()
}
read_json_body <- function(req) {
  b <- read_body(req)
  if (!length(b)) return(list())
  tryCatch(fromJSON(rawToChar(b), simplifyVector = FALSE), error = function(e) http_error(400, "JSON を読めない"))
}
query_param <- function(req, name) {
  q <- req$QUERY_STRING
  if (is.null(q) || !nzchar(q)) return(NULL)
  kv <- strsplit(strsplit(sub("^\\?", "", q), "&", fixed = TRUE)[[1]], "=", fixed = TRUE)
  for (p in kv) if (length(p) == 2L && p[1] == name) return(utils::URLdecode(gsub("+", " ", p[2], fixed = TRUE)))
  NULL
}

case_dir_of <- function(case_id) {
  if (!id_ok(case_id)) http_error(400, "caseId が不正である")
  d <- file.path(dirs$cases_c1, case_id)
  if (!dir.exists(d)) http_error(404, paste0("案件が見つからない: ", case_id))
  d
}

# ---- 経路 --------------------------------------------------------------------------------------------------------
started_at <- Sys.time()
# 入力（サンプル・ポートフォリオとデモの基準カーブ）はサーバーの実行中に変わらないので、IRRBB の結果は一度だけ計算する
irrbb_cache <- new.env()
handle_api <- function(req, method, path) {
  if (method == "GET" && path == "/api/health") {
    return(json_response(200, list(status = "ok", quantlet = curie_version_line_Curie(), engine = paste("RiemannFinMath", packageVersion("RiemannFinMath")),
                                   started_at = format(started_at, "%Y-%m-%dT%H:%M:%S%z"), data_dir = "server/data")))
  }
  m <- regmatches(path, regexec("^/api/uploads/(a1|c1|reports)$", path))[[1]]
  if (length(m)) {
    if (method == "GET") return(json_response(200, list(uploads = list_uploads(m[2]))))
    if (method == "POST") {
      name <- query_param(req, "name") %||% http_error(400, "name（ファイル名）を指定する")
      return(json_response(200, save_upload(m[2], name, read_body(req))))
    }
  }
  if (method == "POST" && path == "/api/a1/run") {
    b <- read_json_body(req)
    workflow <- b$workflow %||% "JPY"
    if (!workflow %in% c("JPY", "ISO")) http_error(400, "workflow は JPY または ISO")
    up <- if (is.null(b$uploadId)) NULL else find_upload("a1", b$uploadId)
    run_id <- new_id(paste0("a1", workflow))
    t0 <- Sys.time()
    res <- job_a1(list(workflow = workflow, offer_path = up$path, sheet = b$sheet, run_dir = file.path(dirs$runs_a1, run_id)))
    if (!is.null(up)) res$offer_file <- up$file_name
    res$run_id <- run_id
    res$seconds <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
    # 発行体（デモの発行体マスタ）を付ける。レポートとの紐づけと、オファーの詳細の関連レポートに使う
    sec <- security_master_RP()
    res$offers$issuer_id <- sec$issuer_id[match(res$offers$ISIN, sec$ISIN)]
    res$offers$issuer_name <- sec$issuer_name[match(res$offers$ISIN, sec$ISIN)]
    # 画面を開き直しても最新の結果を表示できるよう、実行フォルダーに JSON を残す（レポートからオファーへ戻る経路にも使う）
    writeLines(to_json(res), file.path(dirs$runs_a1, run_id, "result.json"), useBytes = TRUE)
    return(json_response(200, res))
  }
  if (method == "GET" && path == "/api/a1/latest") return(json_response(200, list(runs = latest_a1_runs_RP())))
  # ---- 日米の国債金利 ----
  if (method == "GET" && path == "/api/yields/monthly") {
    p <- yields_payload_QL()
    if (is.null(p)) http_error(404, "金利データをまだ取得していない。画面の「出典から取得・更新」で取得する")
    return(json_response(200, p))
  }
  if (method == "POST" && path == "/api/yields/refresh") {
    prov <- refresh_yields_QL()
    return(json_response(200, list(refreshed_at = prov$refreshed_at, summary = prov$summary, files = prov$files)))
  }
  # ---- レポート掲示板 ----
  if (method == "GET" && path == "/api/reports") return(json_response(200, list(reports = list_reports_RP())))
  if (method == "POST" && path == "/api/reports/register") {
    b <- read_json_body(req)
    reader <- b$reader %||% "claude_code"
    if (!reader %in% c("claude_code", "saved")) http_error(400, "reader は claude_code または saved")
    sample_dir <- file.path(server_dir, "data", "demo", "reports")
    up <- if (isTRUE(b$sample)) list(path = file.path(sample_dir, "sample_report_ABC_XYZ.pdf"), file_name = "sample_report_ABC_XYZ.pdf（サンプル）") else
      if (!is.null(b$uploadId)) find_upload("reports", b$uploadId) else http_error(400, "uploadId を指定する（またはサンプル）")
    if (reader == "saved" && !isTRUE(b$sample)) http_error(400, "保存済みの抽出結果はサンプルのレポートにだけ使える。アップロードしたレポートは Claude Code で読む")
    t0 <- Sys.time()
    res <- register_report_RP(up$path, up$file_name, reader, saved_dir = file.path(sample_dir, "extraction_sample"))
    res$seconds <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
    return(json_response(200, res))
  }
  if (method == "GET" && path == "/api/reports/related") {
    isin <- query_param(req, "isin") %||% http_error(400, "isin を指定する")
    return(json_response(200, list(isin = isin, reports = reports_for_offer_RP(isin))))
  }
  # ---- 掲示板の反応・コメント（レポートの案件フォルダーの feedback.json） ----
  m <- regmatches(path, regexec("^/api/reports/([A-Za-z0-9_-]+)/(feedback|reactions|comments)$", path))[[1]]
  if (length(m)) {
    if (!id_ok(m[2]) || !dir.exists(file.path(data_dir, "cases", "reports", m[2]))) http_error(404, paste0("レポートが見つからない: ", m[2]))
    client <- query_param(req, "client") %||% ""
    run <- function(expr) tryCatch(expr, error = function(e) http_error(400, conditionMessage(e)))
    if (method == "GET" && m[3] == "feedback") return(json_response(200, feedback_view_RP(m[2], client)))
    if (method == "POST" && m[3] == "reactions") {
      b <- read_json_body(req)
      return(json_response(200, run(set_reaction_RP(m[2], b$client_id, b$reaction))))
    }
    if (method == "POST" && m[3] == "comments") {
      b <- read_json_body(req)
      return(json_response(200, run(add_comment_RP(m[2], b$text, b$author, b$parent_id, b$client_id %||% ""))))
    }
  }
  # ---- 保存済みの OIS（評価用）と Bloomberg からの更新 ----
  if (method == "GET" && path == "/api/ois/datasets") return(json_response(200, list(datasets = ois_datasets_QL(), asw = asw_ois_dataset_QL())))
  if (method == "GET" && path == "/api/ois/curves") {
    id <- query_param(req, "dataset") %||% http_error(400, "dataset を指定する")
    return(json_response(200, tryCatch(ois_curves_QL(id), error = function(e) http_error(404, conditionMessage(e)))))
  }
  if (method == "GET" && path == "/api/market/ois/status") {
    cfg <- bbg_dl_config_QL()
    return(json_response(200, list(asw = asw_ois_dataset_QL(), available = ois_datasets_QL(),
                                   bloomberg = cfg[c("credentials_set", "credentials_file_exists", "catalog", "httr2_installed")],
                                   live_ready = cfg$credentials_file_exists && cfg$httr2_installed)))
  }
  if (method == "POST" && path == "/api/market/ois/refresh") return(json_response(200, refresh_ois_from_bloomberg_QL()))
  # ---- IRRBB 金利シナリオ（全 6 シナリオを一度に計算して返す。画面はその中で切り替える） ----
  if (method == "GET" && path == "/api/irrbb") {
    f <- query_param(req, "floor") %||% "none"
    if (!f %in% c("none", "zero")) http_error(400, "floor は none または zero")
    key <- paste0("irrbb_", f)
    if (is.null(irrbb_cache[[key]])) irrbb_cache[[key]] <- compute_irrbb_portfolio_QL(if (f == "zero") 0 else NULL)
    return(json_response(200, irrbb_cache[[key]]))
  }
  m <- regmatches(path, regexec("^/api/reports/([A-Za-z0-9_-]+)(/links|/document)?$", path))[[1]]
  if (length(m)) {
    if (!id_ok(m[2]) || !dir.exists(file.path(data_dir, "cases", "reports", m[2]))) http_error(404, paste0("レポートが見つからない: ", m[2]))
    d <- file.path(data_dir, "cases", "reports", m[2])
    if (method == "GET" && m[3] == "") return(json_response(200, report_detail_RP(m[2])))
    if (method == "GET" && m[3] == "/document") {
      f <- list.files(file.path(d, "source"), pattern = "^original\\.", full.names = TRUE)
      if (length(f) != 1L) http_error(404, "原資料がない")
      return(file_response(f, content_types[[tolower(tools::file_ext(f))]] %||% "application/octet-stream"))
    }
    if (method == "POST" && m[3] == "/links") {
      b <- read_json_body(req)
      tryCatch(decide_issuer_link_RP(d, b$mention_index, b$issuer_id), error = function(e) http_error(400, conditionMessage(e)))
      return(json_response(200, report_detail_RP(m[2])))
    }
  }
  m <- regmatches(path, regexec("^/api/a1/runs/([A-Za-z0-9_-]+)/excel$", path))[[1]]
  if (method == "GET" && length(m)) {
    if (!id_ok(m[2])) http_error(400, "runId が不正である")
    f <- list.files(file.path(dirs$runs_a1, m[2]), pattern = "^offer_results_.*\\.xlsx$", full.names = TRUE)
    if (length(f) != 1L) http_error(404, "出力 Excel がない")
    return(file_response(f, content_types[["xlsx"]], basename(f)))
  }
  if (method == "POST" && path == "/api/c1/run") {
    b <- read_json_body(req)
    reader <- b$reader %||% "saved"
    if (!reader %in% c("saved", "claude_code")) http_error(400, "reader は saved または claude_code")
    up <- if (is.null(b$uploadId)) list(path = file.path(server_dir, "data", "demo", "c1", "DEMO_TRS_confirmation.pdf"),
                                         file_name = "DEMO_TRS_confirmation.pdf（デモ）") else find_upload("c1", b$uploadId)
    stem <- gsub("[^A-Za-z0-9_-]", "_", tools::file_path_sans_ext(sub(" .*$|（.*$", "", up$file_name)))
    stem <- gsub("^_|_$", "", gsub("_+", "_", stem))
    if (!grepl("[A-Za-z0-9]", stem)) stem <- "TRS"   # 日本語だけのファイル名
    case_id <- paste0(substr(stem, 1, 40), "_", format(Sys.time(), "%Y%m%d_%H%M%S"))
    t0 <- Sys.time()
    res <- job_c1(list(source_path = up$path, reader = reader, case_id = case_id, output_root = dirs$cases_c1))
    res$source_file <- up$file_name
    res$is_demo_document <- is.null(b$uploadId)
    res$seconds <- as.numeric(difftime(Sys.time(), t0, units = "secs"))
    return(json_response(200, res))
  }
  # TRS のキャッシュフロー・スケジュール（RiemannFinMath で両レッグを作り、Excel に保存。名前は PDF と同じベース名）
  m <- regmatches(path, regexec("^/api/c1/cases/([A-Za-z0-9_-]+)/cashflows(\\.xlsx)?$", path))[[1]]
  if (length(m)) {
    d <- case_dir_of(m[2])
    if (method == "POST" && m[3] == "") {
      b <- read_json_body(req)
      pct <- b$scenario_return_pct
      if (!is.null(pct) && (!is.numeric(pct) || !is.finite(pct) || abs(pct) > 100)) http_error(400, "シナリオの年率は -100〜100 の数値（%）")
      x <- tryCatch(write_trs_cashflows_QL(d, pct), error = function(e) http_error(400, paste("キャッシュフローを作れない:", conditionMessage(e))))
      iso_cols <- function(df) dplyr::mutate(df, dplyr::across(dplyr::where(\(v) inherits(v, "Date")), \(v) ifelse(is.na(v), NA_character_, format(v))))
      return(json_response(200, list(
        file = basename(x$path), base_name = x$base_name, name_confirmed = !is.na(x$naming$name), name_missing = x$naming$missing,
        sheets = list(FundingLeg = iso_cols(x$funding$sheet), ReturnLeg = iso_cols(x$return_leg$sheet)),
        checks = x$checks, terms = x$terms$log, evaluation_date = format(x$evaluation_date), scenario_return_pct = pct,
        engine = paste("RiemannFinMath", packageVersion("RiemannFinMath")))))
    }
    if (method == "GET" && m[3] == ".xlsx") {
      info <- file.path(d, "result", "trs_cashflows.json")
      if (!file.exists(info)) http_error(404, "まだ作っていない（先にキャッシュフローを作る）")
      f <- file.path(d, "result", jsonlite::fromJSON(info)$file)
      if (!file.exists(f)) http_error(404, "Excel がない")
      return(file_response(f, content_types[["xlsx"]], basename(f)))
    }
  }
  m <- regmatches(path, regexec("^/api/c1/cases/([A-Za-z0-9_-]+)/(document|fpml|aladdin)$", path))[[1]]
  if (method == "GET" && length(m)) {
    d <- case_dir_of(m[2])
    # 原資料を保存するときは、C1 の共通名（Excel と同じベース名）を付ける
    if (m[3] == "document" && identical(query_param(req, "download"), "1")) {
      f <- list.files(file.path(d, "source"), pattern = "^original\\.", full.names = TRUE)
      if (length(f) != 1L) http_error(404, "原資料がない")
      res <- read_c1_case_results(d)
      naming <- c1_common_name(validate_c1_case(res, Sys.getenv("QUANTLET_FPML_XSD", ""))$conditions, read_aladdin_map_c1())
      ext <- tolower(tools::file_ext(f))
      return(file_response(f, content_types[[ext]] %||% "application/octet-stream", paste0(naming$name %|% naming$review_name, ".", ext)))
    }
    f <- switch(m[3],
      document = list.files(file.path(d, "source"), pattern = "^original\\.", full.names = TRUE),
      fpml = list.files(file.path(d, "result"), pattern = "^fpml_(final|DRAFT)\\.xml$", full.names = TRUE),
      aladdin = file.path(d, "result", "aladdin_request_DRAFT.json"))
    f <- f[file.exists(f)]
    if (length(f) != 1L) http_error(404, "ファイルがない")
    ext <- tolower(tools::file_ext(f))
    return(file_response(f, content_types[[ext]] %||% "application/octet-stream", if (m[3] == "document") NULL else basename(f)))
  }
  if (method == "GET" && path == "/api/bloomberg/status") return(json_response(200, job_bbg_status(list())))
  if (method == "POST" && path == "/api/bloomberg/ois") {
    b <- read_json_body(req)
    if ((b$mode %||% "synthetic") == "live" && !isTRUE(job_bbg_status(list())$live_ready)) {
      http_error(400, "live の取得には QUANTLET_BBG_DL_CREDENTIALS（認証情報 JSON のパス）と httr2 が必要。設定されていない")
    }
    return(json_response(200, job_bbg_ois(b)))
  }
  http_error(404, paste("経路がない:", method, path))
}

serve_static <- function(path) {
  rel <- if (path %in% c("", "/")) "index.html" else sub("^/", "", utils::URLdecode(path))
  if (grepl("\\.\\.", rel)) return(NULL)
  f <- file.path(static_dir, rel)
  if (!file.exists(f) || dir.exists(f)) f <- file.path(static_dir, "index.html")
  file_response(f, content_types[[tolower(tools::file_ext(f))]] %||% "application/octet-stream")
}

app <- list(call = function(req) {
  method <- req$REQUEST_METHOD
  path <- req$PATH_INFO
  t0 <- Sys.time()
  res <- tryCatch({
    if (startsWith(path, "/api/")) handle_api(req, method, path)
    else if (!is.na(static_dir)) serve_static(path)
    else json_response(404, list(error = "画面は ui/ の npm run dev（127.0.0.1:8091）で開く"))
  }, http_error = function(e) json_response(e$status, list(error = conditionMessage(e))),
     error = function(e) json_response(500, list(error = paste("サーバーのエラー:", conditionMessage(e)))))
  message(format(Sys.time(), "%H:%M:%S"), " ", method, " ", path, " -> ", res$status,
          sprintf(" (%.1f s)", as.numeric(difftime(Sys.time(), t0, units = "secs"))))
  res
})

message("QuantLet API: http://", host, ":", port, "/api/health", if (!is.na(static_dir)) paste0("  (page: http://", host, ":", port, "/)"))
runServer(host, port, app)
