# 保存済みの OIS 気配（評価用）の一覧と、そのカーブ（RiemannFinMath）。オファーシートの ASW と同じ取込・同じカーブ構築を使う。
#
# データセット（基準日ごと）
#   demo       ：data/demo/a1/market/demo_ois_<CCY>_<yyyymmdd>.txt（架空。オファーシートの計算が今使うもの）
#   bloomberg  ：data/market/bbg_dl/a1_input/bbg_ois_<CCY>_<yyyymmdd>.txt（Bloomberg Data License から取得して変換したもの）
#                dry run の架空の値（source が SYNTHETIC）は評価用のデータではないので一覧に出さない
# カーブ：build_ois_curves_Curie（RiemannFinMath bootstrap_ois_curve、MonotonicLogCubic、年1回払い、支払ラグ0、外挿なし）。
# 表示用のゼロ金利は RiemannFinMath compute_zero_rate（Actual/365 Fixed、連続複利）。

ois_dataset_files_QL <- function(root = Sys.getenv("QUANTLET_ROOT")) {
  find <- function(dir, prefix, kind, label) {
    f <- list.files(dir, pattern = paste0("^", prefix, "_(JPY|USD|EUR|GBP)_([0-9]{8})\\.txt$"), full.names = TRUE)
    if (!length(f)) return(NULL)
    m <- stringr::str_match(basename(f), "_(JPY|USD|EUR|GBP)_([0-9]{8})\\.txt$")
    tibble::tibble(kind = kind, label = label, currency = m[, 2], base_date = as.Date(m[, 3], "%Y%m%d"), path = f)
  }
  x <- dplyr::bind_rows(
    find(file.path(root, "data", "demo", "a1", "market"), "demo_ois", "demo", "デモ（架空）"),
    find(file.path(root, "data", "market", "bbg_dl", "a1_input"), "bbg_ois", "bloomberg", "Bloomberg Data License")
  )
  if (!nrow(x)) return(x)
  # 架空の dry run の値を除く（ファイルの source 列で判定）
  x$synthetic <- purrr::map_lgl(x$path, \(p) any(grepl("SYNTHETIC", readLines(p, warn = FALSE, encoding = "UTF-8")[-1])))
  dplyr::filter(x, !.data$synthetic) |> dplyr::select(-"synthetic")
}

ois_datasets_QL <- function(files = ois_dataset_files_QL()) {
  if (!nrow(files)) return(list())
  files |>
    dplyr::summarise(currencies = list(sort(.data$currency)), .by = c("kind", "label", "base_date")) |>
    dplyr::arrange(dplyr::desc(.data$base_date), .data$kind) |>
    dplyr::mutate(id = paste0(.data$kind, "_", format(.data$base_date, "%Y%m%d"))) |>
    purrr::pmap(\(kind, label, base_date, currencies, id) list(id = id, kind = kind, label = label, base_date = format(base_date), currencies = currencies))
}

# オファーシートの ASW が使う OIS（今はデモ。評価日＝オファー日と同じ市場日のデータだけを使う）
asw_ois_dataset_QL <- function() {
  demo <- a1_demo_inputs_QL()
  list(id = paste0("demo_", format(demo$valuation_date, "%Y%m%d")), kind = "demo", label = "デモ（架空）", base_date = format(demo$valuation_date),
       note = "オファーシートの計算は、評価日（＝オファー日）と同じ市場日の OIS だけを使う。今のオファーとデモの市場データは 2026-10-06")
}

ois_curves_QL <- function(dataset_id, files = ois_dataset_files_QL()) {
  m <- stringr::str_match(dataset_id, "^(demo|bloomberg)_([0-9]{8})$")
  if (is.na(m[1, 1])) stop("データセットの ID が不正である: ", dataset_id, call. = FALSE)
  base_date <- as.Date(m[1, 3], "%Y%m%d")
  f <- files[files$kind == m[1, 2] & files$base_date == base_date, ]
  if (!nrow(f)) stop("データセットが見つからない: ", dataset_id, call. = FALSE)
  quotes <- import_ois_files_Curie(f$path, text_import_settings_Curie(), tempfile("ois"))$quotes
  curves <- build_ois_curves_Curie(quotes, base_date, sort(unique(f$currency)))
  per <- purrr::imap(curves, function(cv, ccy) {
    q <- quotes[quotes$currency == ccy & quotes$marketdate == base_date, ]
    base <- list(currency = ccy, source = paste(unique(q$source), collapse = " / "),
                 quote_time = paste(unique(stats::na.omit(q$quote_time)), collapse = ", "))
    if (!is.null(cv$error)) return(c(base, list(status = "failed", message = cv$error)))
    rep <- cv$repricing
    grid <- sort(unique(c(base_date + round(seq(0.25, as.numeric(cv$last_date - base_date) / 365, by = 0.25) * 365), rep$pillar_date)))
    grid <- grid[grid > base_date & grid <= cv$last_date]
    c(base, list(
      status = "success", index = cv$index_name, last_date = format(cv$last_date),
      quotes = tibble::tibble(tenor = rep$tenor, quote_pct = rep$rate * 100, pillar_date = format(rep$pillar_date),
                              years = as.numeric(rep$pillar_date - base_date) / 365,
                              zero_pct = RiemannFinMath::compute_zero_rate(cv$curve, rep$pillar_date, "actual_365_fixed", "continuous") * 100,
                              reproduction_error_bp = rep$reproduction_error * 1e4),
      curve = tibble::tibble(years = as.numeric(grid - base_date) / 365,
                             zero_pct = RiemannFinMath::compute_zero_rate(cv$curve, grid, "actual_365_fixed", "continuous") * 100)
    ))
  })
  list(id = dataset_id, kind = m[1, 2], label = f$label[1], base_date = format(base_date), curves = unname(per),
       conventions = list(
         curve = "RiemannFinMath bootstrap_ois_curve（MonotonicLogCubic、年1回払い、支払ラグ0、外挿なし）。オファーシートの ASW と同じ構築",
         zero = "ゼロ金利は RiemannFinMath compute_zero_rate（Actual/365 Fixed、連続複利）",
         note = "評価用の OIS カーブ。国債の公表利回りとは定義が違う（比較の目的が違う）"))
}

# Bloomberg からの更新（実接続）。前提がそろわないとき・失敗したときは理由と、今使えるデータの基準日を返す
refresh_ois_from_bloomberg_QL <- function(end_date = Sys.Date(), days = 14) {
  cfg <- bbg_dl_config_QL()
  current <- list(asw = asw_ois_dataset_QL(), available = ois_datasets_QL())
  missing <- c(if (!cfg$credentials_set) "認証情報のパス（QUANTLET_BBG_DL_CREDENTIALS）が設定されていない",
               if (cfg$credentials_set && !cfg$credentials_file_exists) "QUANTLET_BBG_DL_CREDENTIALS のファイルがない",
               if (!cfg$httr2_installed) "R パッケージ httr2 が入っていない")
  if (length(missing)) {
    return(list(status = "failed", stage = "接続の前提", reason = paste(missing, collapse = "。"), current = current,
                attempted = "Bloomberg には接続していない（前提の確認で止めた）"))
  }
  res <- tryCatch({
    r <- fetch_bbg_ois_QL(end_date - days, end_date, "live")
    last <- max(r$rates$date)
    files <- write_bbg_ois_files_QL(r$rates, last, file.path(dirname(r$csv_path), "a1_input"))
    list(status = "success", base_date = format(last), files = basename(unname(files)), rows = nrow(r$rates))
  }, error = function(e) list(status = "failed", stage = "取得", reason = conditionMessage(e), attempted = "Data License の REST に接続した"))
  res$current <- list(asw = asw_ois_dataset_QL(), available = ois_datasets_QL())
  res
}
