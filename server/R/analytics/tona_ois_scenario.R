# TONA OIS カーブとスワップのシナリオ。Carmine Studio の /api/scenario（yield-curve-ois）を移し、気配は Infrago Quant の
# 保存済み OIS（今はデモの架空データ、data/demo/a1/market/demo_ois_JPY_*.txt）から読む。年限を1つ選んで気配を動かし、
# カーブ（割引係数・ゼロ金利・1暦日フォワード）と、基準カーブのパーレートで固定した OIS（固定払い・TONA 受け）の PV の変化を返す。
# 計算はすべて RiemannFinMath（ブートストラップの条件は Carmine Studio と同じ：Japan、スポット開始2日、年1回払い、支払ラグ0、
# MonotonicLogCubic、精度 1e-12）。
#
# POST /api/analytics/tona-ois {"datasetId":"demo_20261006","bumpTenor":"5Y","bumpBp":1,"swapTenor":"7Y","notional":1e10}

TONA_CONV_QL <- list(index = "tonar", calendar = "japan", curve_day_count = "actual_365_fixed", settlement_days = 2L,
                     payment_frequency = 1L, payment_lag = 0L, interpolation = "monotonic_log_cubic", accuracy = 1e-12)
TONA_CACHE_QL <- new.env(parent = emptyenv())

tona_quotes_QL <- function(dataset_id) {
  key <- paste0("quotes_", dataset_id)
  if (!is.null(TONA_CACHE_QL[[key]])) return(TONA_CACHE_QL[[key]])
  m <- stringr::str_match(dataset_id, "^(demo|bloomberg)_([0-9]{8})$")
  if (is.na(m[1, 1])) an_bad_QL(paste0("datasetId が不正である: ", dataset_id))
  files <- ois_dataset_files_QL()
  f <- files[files$kind == m[1, 2] & files$base_date == as.Date(m[1, 3], "%Y%m%d") & files$currency == "JPY", ]
  if (!nrow(f)) an_bad_QL(paste0("円の OIS 気配がない: ", dataset_id))
  q <- import_ois_files_Curie(f$path, text_import_settings_Curie(), tempfile("ois"))$quotes
  q <- q[q$currency == "JPY" & q$marketdate == f$base_date[1], ]
  out <- list(base_date = f$base_date[1], label = f$label[1], source = paste(unique(q$source), collapse = " / "),
              tenor = toupper(trimws(q$tenor)), rate = q$rate_pct / 100)
  assign(key, out, envir = TONA_CACHE_QL)
  out
}

tona_build_curve_QL <- function(ev, tenors, rates) {
  cv <- TONA_CONV_QL
  inst <- RiemannFinMath::create_ois_instruments(tenors, rates, cv$settlement_days, cv$payment_frequency, cv$payment_lag)
  RiemannFinMath::bootstrap_ois_curve(ev, ev, cv$index, cv$curve_day_count, inst, interpolation = cv$interpolation, accuracy = cv$accuracy)
}

# スワップの日付：スポット（評価日を調整し2営業日先）から年数ぶん（Carmine Studio と同じ決め方）
tona_swap_dates_QL <- function(ev, years) {
  spot <- RiemannFinMath::compute_advanced_date("japan", RiemannFinMath::compute_adjusted_date("japan", ev), "2D")
  list(effective = as.Date(spot), termination = seq(as.Date(spot), by = paste(years, "years"), length.out = 2L)[2L])
}

tona_case_QL <- function(ev, tenors, rates, dates, fixed_rate, notional) {
  curve <- tona_build_curve_QL(ev, tenors, rates)
  rep <- RiemannFinMath::get_quote_repricing(curve)
  nodes <- RiemannFinMath::get_discount_nodes(curve)
  last <- max(as.Date(rep$pillar_date))
  grid <- sort(unique(c(seq(ev, last - 1L, by = "1 week"), as.Date(rep$pillar_date) - 1L)))
  grid <- grid[grid + 1L <= last]
  zero_at <- function(d) { z <- RiemannFinMath::compute_zero_rate(curve, d, "actual_365_fixed", "continuous"); z[d == ev] <- NA_real_; z }
  swap <- RiemannFinMath::create_ois_swap("payer", notional, dates$effective, dates$termination, "tonar", fixed_rate,
                                          fixed_frequency = 1L, overnight_frequency = 1L, payment_lag = 0L)
  value <- RiemannFinMath::compute_ois_swap_value(swap, curve, ev)
  flows <- RiemannFinMath::compute_ois_swap_cashflows(swap, curve, ev)
  node_t <- as.numeric(as.Date(nodes$date) - ev) / 365
  list(
    instruments = data.frame(tenor = rep$tenor, rate = rep$rate, pillar_date = format(as.Date(rep$pillar_date)),
                             implied_rate = rep$implied_rate, reproduction_error = rep$reproduction_error),
    nodes = data.frame(date = format(as.Date(nodes$date)), time = node_t, discount = nodes$discount, zero_continuous = zero_at(as.Date(nodes$date))),
    curve_points = data.frame(date = format(grid), time = as.numeric(grid - ev) / 365, discount = RiemannFinMath::compute_discount(curve, grid),
                              zero_continuous = zero_at(grid),
                              forward_1d_simple = RiemannFinMath::compute_forward_rate(curve, grid, grid + 1L, "actual_365_fixed", "simple")),
    swap = list(npv = value$npv, fixed_leg_npv = value$fixed_leg_npv, overnight_leg_npv = value$overnight_leg_npv,
                fixed_leg_bps = value$fixed_leg_bps, par_rate = value$fair_rate,
                cashflows = data.frame(leg = flows$leg, accrual_start = format(as.Date(flows$accrual_start)), accrual_end = format(as.Date(flows$accrual_end)),
                                       payment_date = format(as.Date(flows$payment_date)), amount = flows$amount,
                                       discount = RiemannFinMath::compute_discount(curve, as.Date(flows$payment_date))))
  )
}

compute_tona_ois_QL <- function(body = list()) {
  an_unknown_QL(body, c("datasetId", "bumpTenor", "bumpBp", "swapTenor", "notional"))
  default_id <- asw_ois_dataset_QL()$id
  dataset_id <- if (is.null(body$datasetId)) default_id else as.character(body$datasetId)
  q <- tona_quotes_QL(dataset_id)
  ev <- as.Date(q$base_date)
  bump_tenor <- an_choice_QL(body, "bumpTenor", if ("5Y" %in% q$tenor) "5Y" else q$tenor[1], q$tenor)
  bump_bp <- an_num_QL(body, "bumpBp", 0, -100, 100)
  years_ok <- q$tenor[grepl("^[0-9]+Y$", q$tenor)]
  swap_tenor <- an_choice_QL(body, "swapTenor", if ("7Y" %in% years_ok) "7Y" else years_ok[1], years_ok)
  notional <- an_num_QL(body, "notional", 1e10, 1, 1e13)
  dates <- tona_swap_dates_QL(ev, as.integer(sub("Y$", "", swap_tenor)))

  key <- paste("base", dataset_id, swap_tenor, format(notional, digits = 17))
  base <- TONA_CACHE_QL[[key]]
  if (is.null(base)) {
    probe <- RiemannFinMath::create_ois_swap("payer", notional, dates$effective, dates$termination, "tonar", 0,
                                             fixed_frequency = 1L, overnight_frequency = 1L, payment_lag = 0L)
    fixed <- RiemannFinMath::compute_ois_swap_value(probe, tona_build_curve_QL(ev, q$tenor, q$rate), ev)$fair_rate
    base <- list(fixed_rate = fixed, case = tona_case_QL(ev, q$tenor, q$rate, dates, fixed, notional))
    assign(key, base, envir = TONA_CACHE_QL)
  }
  scen_rates <- q$rate
  scen_rates[q$tenor == bump_tenor] <- scen_rates[q$tenor == bump_tenor] + bump_bp / 1e4
  scenario <- if (bump_bp == 0) base$case else tona_case_QL(ev, q$tenor, scen_rates, dates, base$fixed_rate, notional)

  list(
    dataset = list(id = dataset_id, label = q$label, base_date = format(ev), source = q$source),
    evaluation_date = format(ev),
    request = list(bumpTenor = bump_tenor, bumpBp = bump_bp, swapTenor = swap_tenor, notional = notional),
    conventions = list(curve = "TONA OIS：Japan、スポット開始2日、年1回払い、支払ラグ0、割引係数の対数を単調3次補間（MonotonicLogCubic）",
                       forward = "フォワードは1暦日の単利（Actual/365 Fixed）", engine = an_engine_QL()),
    quotes = data.frame(tenor = q$tenor, rate_base = q$rate, rate_scenario = scen_rates),
    swap_terms = list(tenor = swap_tenor, side = "payer", notional = notional, fixed_rate = base$fixed_rate,
                      effective_date = format(dates$effective), termination_date = format(dates$termination)),
    cases = list(base = base$case, scenario = scenario),
    pv_change = scenario$swap$npv - base$case$swap$npv,
    par_change_bp = 1e4 * (scenario$swap$par_rate - base$case$swap$par_rate)
  )
}
