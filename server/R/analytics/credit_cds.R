# クレジット・CDS（標準 CDS の評価）。Carmine Studio の /api/cds（credit-cds）の標準5年物（ISDA）の部分を、取引日と
# 年限を選べる形にして移した。CDS の評価・生存確率・満期は rmql。市場スプレッドから、NPV がゼロになる
# フラットな Hazard Rate を求めるのは Carmine Studio と同じく uniroot（rmql の評価値を目的関数にする）。
#
# POST /api/analytics/cds
#   {"tradeDate":"2022-08-19","tenor":"5Y","spreadBp":30.426,"couponBp":100,"recoveryPct":40,"ratePct":0.25,
#    "notional":10000000,"engine":"isda"}
#   金額は想定元本の通貨単位、プロテクションの買い手から見た符号。

CDS_DEFAULTS_QL <- list(tradeDate = "2022-08-19", tenor = "5Y", spreadBp = 30.426, couponBp = 100, recoveryPct = 40,
                        ratePct = 0.25, notional = 1e7, engine = "isda")
CDS_HAZARD_END_QL <- "2080-01-01"
CDS_UPFRONT_CACHE_QL <- new.env(parent = emptyenv())

cds_rates_QL <- function(date, rate) rmql::create_flat_curve(date, rate, "actual_365_fixed", "continuous")
cds_hazard_curve_QL <- function(date, h) rmql::create_hazard_curve(date, CDS_HAZARD_END_QL, h)
cds_contract_QL <- function(trade, maturity, notional, s) {
  rmql::create_credit_default_swap("buyer", notional, s, trade, maturity, rule = "cds2015", trade_date = trade,
                                             protection_start = trade, last_period_day_count = "actual_360_include_last_day")
}
cds_value_QL <- function(swap, h, recovery, rates, date, engine) {
  as.list(rmql::compute_cds_value(swap, cds_hazard_curve_QL(date, h), recovery, rates, date, engine))
}
# 市場スプレッドの契約の NPV がゼロになるフラットな Hazard Rate
cds_calibrate_QL <- function(trade, maturity, notional, spread, recovery, rates, engine) {
  market <- cds_contract_QL(trade, maturity, notional, spread)
  approx <- spread / (1 - recovery)
  stats::uniroot(function(h) cds_value_QL(market, h, recovery, rates, trade, engine)$npv, c(1e-8, max(0.5, 3 * approx)), tol = 1e-10)$root
}

compute_cds_QL <- function(body = list()) {
  an_unknown_QL(body, names(CDS_DEFAULTS_QL))
  d <- CDS_DEFAULTS_QL
  trade <- format(an_date_QL(body, "tradeDate", d$tradeDate))
  tenor <- an_choice_QL(body, "tenor", d$tenor, c("1Y", "2Y", "3Y", "4Y", "5Y", "7Y", "10Y"))
  spread <- an_num_QL(body, "spreadBp", d$spreadBp, 1, 2000) / 1e4
  coupon <- an_num_QL(body, "couponBp", d$couponBp, 0, 1000) / 1e4
  recovery <- an_num_QL(body, "recoveryPct", d$recoveryPct, 0, 90) / 100
  rate <- an_num_QL(body, "ratePct", d$ratePct, -1, 20) / 100
  notional <- an_num_QL(body, "notional", d$notional, 1, 1e12)
  engine <- an_choice_QL(body, "engine", d$engine, c("isda", "midpoint"))

  maturity <- format(as.Date(rmql::compute_cds_maturity(trade, tenor, "cds2015")))
  rates <- cds_rates_QL(trade, rate)
  hazard <- cds_calibrate_QL(trade, maturity, notional, spread, recovery, rates, engine)
  hc <- cds_hazard_curve_QL(trade, hazard)
  value <- cds_value_QL(cds_contract_QL(trade, maturity, notional, coupon), hazard, recovery, rates, trade, engine)

  sched <- as.Date(rmql::generate_schedule(trade, maturity, "3M", "weekends_only", "following", "unadjusted", "cds2015")$date)
  n <- length(sched)
  pay <- sched[-1]; start <- sched[-n]
  q <- rmql::compute_survival_probability(hc, pay)
  cashflows <- data.frame(payment_date = format(pay), accrual_start = format(start), accrual_days = as.numeric(pay - start),
                          coupon_amount = notional * coupon * as.numeric(pay - start) / 360,
                          discount_factor = rmql::compute_discount(rates, pay), survival_probability = q,
                          default_probability = c(1, head(q, -1)) - q)

  years <- as.numeric(as.Date(maturity) - as.Date(trade)) / 365
  gdates <- as.Date(trade) + round(seq(0, ceiling(years), by = 0.25) * 365)
  sq <- rmql::compute_survival_probability(hc, gdates)
  probability_curve <- data.frame(date = format(gdates), time = as.numeric(gdates - as.Date(trade)) / 365,
                                  survival_probability = sq, default_probability = 1 - sq)

  # 市場スプレッドを動かしたときの Fair Upfront（契約の条件は同じ）
  key <- paste(trade, tenor, format(c(coupon, recovery, rate, notional), digits = 17), engine, collapse = "|")
  upfront <- CDS_UPFRONT_CACHE_QL[[key]]
  if (is.null(upfront)) {
    upfront <- do.call(rbind, lapply(seq(10, 500, by = 10), function(s) {
      h <- cds_calibrate_QL(trade, maturity, notional, s / 1e4, recovery, rates, engine)
      v <- cds_value_QL(cds_contract_QL(trade, maturity, notional, coupon), h, recovery, rates, trade, engine)
      data.frame(spread_bp = s, hazard = h, fair_upfront = v$fair_upfront, upfront_amount = v$fair_upfront * notional)
    }))
    assign(key, upfront, envir = CDS_UPFRONT_CACHE_QL)
  }

  list(
    inputs = list(tradeDate = trade, tenor = tenor, spreadBp = spread * 1e4, couponBp = coupon * 1e4, recoveryPct = recovery * 100,
                  ratePct = rate * 100, notional = notional, engine = engine),
    conventions = list(
      contract = "標準 CDS：満期は CDS2015 の IMM 日、3か月ごと（週末のみ休日、Following）、Premium は Actual/360（最終期間は最終日を含む）、Protection 開始は取引日",
      curves = "割引：フラットな連続複利（Actual/365 Fixed）。Hazard：フラット。市場スプレッドで NPV がゼロになる Hazard Rate を uniroot で求める",
      engine = paste(an_engine_QL(), if (engine == "isda") "ISDA Engine" else "MidPoint Engine")),
    maturity_date = maturity, years = years, hazard = hazard, hazard_approx = spread / (1 - recovery),
    survival_at_maturity = rmql::compute_survival_probability(hc, maturity),
    discount_at_maturity = rmql::compute_discount(rates, maturity),
    value = value, upfront_amount = value$fair_upfront * notional,
    cashflows = cashflows, probability_curve = probability_curve, upfront_by_spread = upfront
  )
}
