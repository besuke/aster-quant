# 国債先物と CTD（Cheapest-to-Deliver）。Carmine Studio の /api/futures/basket（jgb-futures）から移した。計算はすべて
# RiemannFinMath。受渡適格銘柄・コンバージョンファクター・日付・Funding Rate は server/data/demo/futures/inputs.json
# （教材の例で、現物価格と先物価格は架空）。
#
# POST /api/analytics/futures
#   {"mode":"current"}                                   入力ファイルの価格と先物価格
#   {"mode":"flat","yieldPct":8,"fundingPct":9}          全銘柄を同じ複利利回りにする。先物価格は6%・10年の標準物をその利回りで評価
# 先物 BPV = CTD の DV01 ÷ CF。DV01 = （−1bp の価格 − ＋1bp の価格）/ 2（額面100）。

FUT_DC_QL <- "actual_365_fixed"
FUT_CACHE_QL <- new.env(parent = emptyenv())

fut_setup_QL <- function() {
  if (!is.null(FUT_CACHE_QL$setup)) return(FUT_CACHE_QL$setup)
  inp <- jsonlite::fromJSON(file.path(Sys.getenv("QUANTLET_ROOT"), "data", "demo", "futures", "inputs.json"))
  inp$basket$issue_date <- as.Date(inp$basket$issue_date)
  inp$basket$maturity_date <- as.Date(inp$basket$maturity_date)
  mk <- function(issue_date, maturity_date, coupon_pct) {
    RiemannFinMath::create_fixed_rate_bond(
      settlement_days = 0L, face_amount = 100, effective_date = issue_date, termination_date = maturity_date, tenor = "6M",
      calendar = "japan", convention = "unadjusted", termination_convention = "unadjusted", rule = "backward", end_of_month = FALSE,
      coupon_rate = coupon_pct / 100, day_count = FUT_DC_QL, payment_convention = "following", redemption = 100)
  }
  inp$bonds <- lapply(seq_len(nrow(inp$basket)), function(i) mk(inp$basket$issue_date[i], inp$basket$maturity_date[i], inp$basket$coupon_pct[i]))
  inp$standard <- mk(as.Date(inp$valuation_date), as.Date(inp$stress$standard_maturity), 100 * inp$stress$standard_coupon)
  FUT_CACHE_QL$setup <- inp
  inp
}

fut_price_QL <- function(F, bond, y) RiemannFinMath::compute_clean_price(bond, y, FUT_DC_QL, "compounded", 2L, F$valuation_date)
fut_dv01_QL <- function(F, bond, y) (fut_price_QL(F, bond, y - 1e-4) - fut_price_QL(F, bond, y + 1e-4)) / 2

fut_basket_QL <- function(F, prices, yields, futures_price, funding) {
  b <- F$basket
  basis <- RiemannFinMath::compute_future_basket(F$bonds, prices, futures_price, b$conversion_factor, funding, F$valuation_date, F$delivery_date)
  dur <- vapply(seq_along(F$bonds), function(i) RiemannFinMath::compute_duration(F$bonds[[i]], yields[i], FUT_DC_QL, "compounded", 2L, F$valuation_date, "modified"), 0)
  dv01 <- vapply(seq_along(F$bonds), function(i) fut_dv01_QL(F, F$bonds[[i]], yields[i]), 0)
  ctd <- which(basis$ctd)[1]
  list(
    rows = data.frame(issue = b$issue, coupon_pct = b$coupon_pct, maturity_date = format(b$maturity_date), conversion_factor = b$conversion_factor,
                      price = prices, yield = yields, duration = dur, dv01 = dv01,
                      accrued_start = basis$accrued_start, accrued_end = basis$accrued_end, coupon_income = basis$coupon_income,
                      futures_invoice = basis$futures_invoice, gross_basis = basis$gross_basis, funding_cost = basis$funding_cost,
                      carry = basis$carry, net_basis = basis$net_basis, implied_repo = basis$implied_repo, ctd = basis$ctd),
    futures_price = futures_price, funding_rate = funding, ctd_issue = b$issue[ctd],
    futures_bpv = dv01[ctd] / b$conversion_factor[ctd], ctd_dv01 = dv01[ctd], ctd_conversion_factor = b$conversion_factor[ctd]
  )
}

fut_flat_QL <- function(F, y, funding) {
  prices <- vapply(F$bonds, function(bd) fut_price_QL(F, bd, y), 0)
  fut_basket_QL(F, prices, rep(y, length(prices)), fut_price_QL(F, F$standard, y), funding)
}

# 利回りの水準ごとの CTD（Funding Rate だけで決まるので、Funding Rate ごとに覚えておく）
fut_ctd_by_level_QL <- function(F, funding) {
  key <- paste0("level_", format(funding, digits = 17))
  if (!is.null(FUT_CACHE_QL[[key]])) return(FUT_CACHE_QL[[key]])
  out <- do.call(rbind, lapply(seq(1, 10, by = 0.25), function(lv) {
    r <- fut_flat_QL(F, lv / 100, funding)
    i <- which(r$rows$issue == r$ctd_issue)
    data.frame(yield_pct = lv, ctd_issue = r$ctd_issue, ctd_duration = r$rows$duration[i], futures_price = r$futures_price, futures_bpv = r$futures_bpv)
  }))
  assign(key, out, envir = FUT_CACHE_QL)
  out
}

compute_futures_QL <- function(body = list()) {
  an_unknown_QL(body, c("mode", "yieldPct", "fundingPct"))
  F <- fut_setup_QL()
  mode <- an_choice_QL(body, "mode", "current", c("current", "flat"))
  funding_in <- if (is.null(body$fundingPct)) NULL else an_num_QL(body, "fundingPct", 0, -1, 20) / 100
  if (mode == "current") {
    funding <- funding_in %||% F$funding_rate
    prices <- F$basket$fictitious_price
    yields <- vapply(seq_along(F$bonds), function(i) RiemannFinMath::compute_yield_from_price(
      F$bonds[[i]], prices[i], "clean", FUT_DC_QL, "compounded", 2L, F$valuation_date, accuracy = 1e-8), 0)
    res <- fut_basket_QL(F, prices, yields, F$futures_price, funding)
    yield_pct <- NA
  } else {
    yield_pct <- an_num_QL(body, "yieldPct", 8, 0.1, 15)
    funding <- funding_in %||% (yield_pct / 100 + 0.01)
    res <- fut_flat_QL(F, yield_pct / 100, funding)
  }
  c(list(
    mode = mode, valuation_date = F$valuation_date, delivery_date = F$delivery_date, flat_yield = if (mode == "flat") yield_pct / 100 else NA,
    inputs_note = F$note, current_curve = F$current_curve, stress_curve = F$stress$curve,
    conventions = list(bond = "日本国債：年2回利払、Actual/365 Fixed、受渡0日（評価日に受渡）、日付は調整なし、支払は Following",
                       yield = "複利利回り（年2回複利、Actual/365 Fixed）。価格からの逆算の精度は 1e-8",
                       carry = "Carry = 保有期間のクーポン ＋（受渡日の経過利子 − 評価日の経過利子）− Funding Cost、Funding Cost = ダーティ価格 × Funding Rate × 日数/365",
                       futures_bpv = "先物BPV = CTD の DV01 ÷ CF。DV01 = （−1bp の価格 − ＋1bp の価格）/ 2（額面100）",
                       engine = an_engine_QL())),
    res, list(ctd_by_level = fut_ctd_by_level_QL(F, funding)))
}
