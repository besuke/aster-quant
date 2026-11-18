# イールドカーブ（ゼロ金利のノードから、割引カーブと平行移動したカーブを作る）。Carmine Studio の
# /api/curves/zero（yield-curves）から移した。計算はすべて RiemannFinMath。
#
# POST /api/analytics/zero-curves
#   {"evaluationDate":"2022-08-19","nodes":[{"tenor":"0D","date":"2022-08-19","ratePct":0.05},...],"shiftBp":50}
#   ノードの date を省くと、評価日に年限を足した日（営業日の調整なし）にする
#   カーブ    ：ノードのゼロ金利（連続複利、Actual/365 Fixed）を割引係数に直し、単調な対数3次補間（monotonic_log_cubic）
#              ゼロ金利の線形補間や割引係数の対数線形補間は、フォワード金利が折れ線・階段状になるので使わない
#   平行移動  ：カーブに単利・年1回の複利でスプレッドを加える
#   ノードのシミュレーション："bump":{"tenor":"30Y","bp":100} を付けると、そのノードのゼロ金利だけを bp 動かしてカーブを作り直し、
#              基準との割引係数・ゼロクーポン債の価格（額面100 × 割引係数）・ゼロ金利を、ノードと標準の年限ごとに返す（bump）

ZERO_DEFAULTS_QL <- list(
  evaluationDate = "2022-08-19",
  tenors = c("0D", "1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "10Y", "20Y", "30Y"),
  # Carmine Studio と同じノードの日付（週末を避けた日）
  dates = c("2022-08-19", "2022-09-19", "2022-11-21", "2023-02-20", "2023-08-21", "2024-08-19", "2025-08-19", "2027-08-19", "2032-08-19", "2042-08-19", "2052-08-19"),
  ratesPct = c(0.05, 0.06, 0.08, 0.11, 0.18, 0.32, 0.48, 0.75, 1.15, 1.55, 1.80),
  shiftBp = 50
)
ZERO_TABLE_TENORS_QL <- c("1D", "1W", "1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "15Y", "20Y", "30Y")

zero_curve_points_QL <- function(curve, dates, ev) {
  t <- as.numeric(dates - ev) / 365
  df <- RiemannFinMath::compute_discount(curve, dates)
  zero <- ifelse(t > 0, -log(df) / t, NA_real_)
  fwd <- c(-log(df[-1] / df[-length(df)]) / diff(t), NA_real_)  # 隣り合う格子日のあいだのフォワード（連続複利）
  data.frame(date = format(dates), time = t, discount = df, zero_continuous = zero, forward_step = fwd)
}

compute_zero_curves_QL <- function(body = list()) {
  an_unknown_QL(body, c("evaluationDate", "nodes", "shiftBp", "bump"))
  ev <- an_date_QL(body, "evaluationDate", ZERO_DEFAULTS_QL$evaluationDate)
  shift <- an_num_QL(body, "shiftBp", ZERO_DEFAULTS_QL$shiftBp, -500, 500)
  if (is.null(body$nodes)) {
    tenors <- ZERO_DEFAULTS_QL$tenors; rates <- ZERO_DEFAULTS_QL$ratesPct
    given <- if (is.null(body$evaluationDate) || ev == as.Date(ZERO_DEFAULTS_QL$evaluationDate)) as.Date(ZERO_DEFAULTS_QL$dates) else rep(as.Date(NA), length(tenors))
  } else {
    if (!is.list(body$nodes) || length(body$nodes) < 2L) an_bad_QL("nodes は2点以上にする")
    tenors <- vapply(body$nodes, function(n) if (is.character(n$tenor) && length(n$tenor) == 1L) toupper(n$tenor) else NA_character_, "")
    rates <- vapply(body$nodes, function(n) if (is.numeric(n$ratePct) && length(n$ratePct) == 1L) as.numeric(n$ratePct) else NA_real_, 0)
    if (anyNA(tenors) || !all(grepl("^[0-9]{1,3}[DWMY]$", tenors))) an_bad_QL("tenor は 0D・1M・5Y のように書く")
    if (anyNA(rates) || any(!is.finite(rates)) || any(abs(rates) > 20)) an_bad_QL("ratePct は ±20 以内の数値にする")
    given <- do.call(c, lapply(body$nodes, function(n) {
      if (is.null(n$date) || identical(n$date, "")) return(as.Date(NA))
      d <- if (is.character(n$date) && length(n$date) == 1L) tryCatch(as.Date(n$date), error = function(e) NA) else NA
      if (is.na(d)) an_bad_QL("ノードの date は YYYY-MM-DD の日付にする")
      d
    }))
  }
  dates <- do.call(c, lapply(tenors, function(x) an_add_tenor_QL(ev, x)))
  dates[!is.na(given)] <- given[!is.na(given)]
  if (any(dates < ev)) an_bad_QL("ノードの日付が評価日より前になっている")
  o <- order(dates); tenors <- tenors[o]; rates <- rates[o] / 100; dates <- dates[o]
  if (anyDuplicated(dates)) an_bad_QL("同じ日付になる年限がある")
  if (dates[1] != ev) { tenors <- c("0D", tenors); rates <- c(rates[1], rates); dates <- c(ev, dates) }  # 基準日のノードがなければ最短の金利で足す
  t_nodes <- as.numeric(dates - ev) / 365

  dcv <- RiemannFinMath::with_extrapolation(RiemannFinMath::create_discount_curve(dates, exp(-rates * t_nodes), "actual_365_fixed", "monotonic_log_cubic"))
  # ノードのシミュレーションの入力（あれば）
  bump <- body$bump
  if (!is.null(bump)) {
    if (!is.list(bump) || !is.character(bump$tenor) || length(bump$tenor) != 1L) an_bad_QL("bump は {\"tenor\":\"30Y\",\"bp\":100} の形にする")
    bump_i <- match(toupper(bump$tenor), tenors)
    if (is.na(bump_i)) an_bad_QL(paste0("bump.tenor がノードにない: ", bump$tenor))
    bump_bp <- an_num_QL(bump, "bp", 0, -1000, 1000)
  }
  shifted <- RiemannFinMath::create_zero_spreaded_curve(dcv, shift / 1e4, "simple", 1L)

  grid <- sort(unique(c(ev + round(seq(0, max(t_nodes), length.out = 300) * 365), dates)))
  tdates <- do.call(c, lapply(ZERO_TABLE_TENORS_QL, function(x) an_add_tenor_QL(ev, x)))
  keep <- tdates <= max(dates)
  table <- function(curve) {
    p <- zero_curve_points_QL(curve, tdates[keep], ev)
    data.frame(tenor = ZERO_TABLE_TENORS_QL[keep], date = p$date, discount = p$discount, zero_continuous = p$zero_continuous)
  }
  out <- list(
    evaluation_date = format(ev), shift_bp = shift,
    conventions = list(day_count = "Actual/365 Fixed",
                       curve = "ノードのゼロ金利を割引係数に直し、割引係数の対数を単調3次補間（MonotonicLogCubic）",
                       shift = "カーブのゼロ金利に単利・年1回の複利で一定のスプレッドを加える",
                       engine = an_engine_QL()),
    nodes = data.frame(tenor = tenors, date = format(dates), time = t_nodes, zero_rate = rates),
    curve = list(table = table(dcv), points = zero_curve_points_QL(dcv, grid, ev)),
    shifted_curve = list(table = table(shifted), points = zero_curve_points_QL(shifted, grid, ev))
  )
  if (!is.null(bump)) {
    rates_b <- rates
    rates_b[bump_i] <- rates_b[bump_i] + bump_bp / 1e4
    bcv <- RiemannFinMath::with_extrapolation(RiemannFinMath::create_discount_curve(dates, exp(-rates_b * t_nodes), "actual_365_fixed", "monotonic_log_cubic"))
    # ノードと標準の年限を日付の順に並べる（同じ日付はノードの年限名を残す）
    all_dates <- c(dates, tdates[keep]); all_tenors <- c(tenors, ZERO_TABLE_TENORS_QL[keep]); is_node <- c(rep(TRUE, length(dates)), rep(FALSE, sum(keep)))
    ord <- order(all_dates); all_dates <- all_dates[ord]; all_tenors <- all_tenors[ord]; is_node <- is_node[ord]
    dup <- duplicated(all_dates); all_dates <- all_dates[!dup]; all_tenors <- all_tenors[!dup]; is_node <- is_node[!dup]
    t <- as.numeric(all_dates - ev) / 365
    d0 <- RiemannFinMath::compute_discount(dcv, all_dates); d1 <- RiemannFinMath::compute_discount(bcv, all_dates)
    z <- function(d) ifelse(t > 0, -log(d) / t, NA_real_)
    out$bump <- list(
      tenor = tenors[bump_i], bp = bump_bp, node_date = format(dates[bump_i]),
      table = data.frame(tenor = all_tenors, date = format(all_dates), time = t, is_node = is_node, is_bumped = all_dates == dates[bump_i],
                         discount_base = d0, discount_bumped = d1, price_base = 100 * d0, price_bumped = 100 * d1,
                         price_change = 100 * (d1 - d0), price_change_pct = 100 * (d1 / d0 - 1), zero_base = z(d0), zero_bumped = z(d1)),
      points = zero_curve_points_QL(bcv, grid, ev)
    )
  }
  out
}
