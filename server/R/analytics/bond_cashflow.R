# 債券キャッシュフロー（固定利付債、半年払い）。Carmine Studio の /api/bond（deterministic-cashflow）から、
# 実務で使う部分（単利→単価→複利利回り、経過利子、Zスプレッド、金利リスク、キャッシュフロー、価格と利回り）を移した。
# 計算はすべて RiemannFinMath。
#
# POST /api/analytics/bond
#   {"tradeDate":"2022-03-30","issueDate":"2022-04-01","maturityDate":"2062-04-01","couponPct":7.5,"simpleYieldPct":6.515,"zSpreadBp":50}

BOND_DEFAULTS_QL <- list(tradeDate = "2022-03-30", issueDate = "2022-04-01", maturityDate = "2062-04-01",
                         couponPct = 7.5, simpleYieldPct = 6.515, zSpreadBp = 50)
BOND_DC_QL <- "thirty_360_bond_basis"

compute_bond_cashflow_QL <- function(body = list()) {
  an_unknown_QL(body, names(BOND_DEFAULTS_QL))
  p <- BOND_DEFAULTS_QL
  trade <- an_date_QL(body, "tradeDate", p$tradeDate)
  issue <- an_date_QL(body, "issueDate", p$issueDate)
  maturity <- an_date_QL(body, "maturityDate", p$maturityDate)
  C <- an_num_QL(body, "couponPct", p$couponPct, 0, 20)
  simple <- an_num_QL(body, "simpleYieldPct", p$simpleYieldPct, 0.001, 20)
  zbp <- an_num_QL(body, "zSpreadBp", p$zSpreadBp, -500, 1000)
  if (!(issue < maturity)) an_bad_QL("発行日は償還日より前にする")
  if (as.numeric(maturity - issue) < 182) an_bad_QL("発行日から償還日までは半年以上にする")

  bond <- RiemannFinMath::create_fixed_rate_bond(
    settlement_days = 2L, face_amount = 100, effective_date = format(issue), termination_date = format(maturity), tenor = "6M",
    calendar = "japan", convention = "unadjusted", termination_convention = "unadjusted", rule = "backward", end_of_month = FALSE,
    coupon_rate = C / 100, day_count = BOND_DC_QL, payment_convention = "unadjusted", redemption = 100, issue_date = format(issue))
  settlement <- as.Date(RiemannFinMath::compute_settlement_date(bond, format(trade)))
  if (!(settlement < maturity)) an_bad_QL("受渡日（取引日の2営業日後）が償還日より前になるようにする")
  if (settlement < issue) an_bad_QL("受渡日（取引日の2営業日後）が発行日より前になっている")
  cf <- RiemannFinMath::get_bond_cashflows(bond)

  # 単利 → 単価（日本の規則で小数3桁切り捨て）→ 複利利回り（小数3桁、4桁目切り捨て）
  trunc3 <- function(x) trunc(x * 1000) / 1000
  t <- RiemannFinMath::compute_remaining_years(settlement, maturity)
  price <- RiemannFinMath::compute_price_from_simple_rate(t, C, simple, 100)
  Y_raw <- RiemannFinMath::compute_compound_yield_from_price(t, C, price, 100)
  accrued <- RiemannFinMath::compute_accrued_amount(bond, settlement)
  y <- Y_raw / 100

  # 複利利回りのフラットなカーブ（30/360、半年複利）での評価と、Zスプレッドを加えた評価・逆算
  flat <- RiemannFinMath::create_flat_curve(settlement, y, BOND_DC_QL, "compounded", 2L)
  flat_value <- RiemannFinMath::compute_bond_value_on_curve(bond, flat, format(trade))
  z_value <- RiemannFinMath::compute_bond_value_with_zero_spread(bond, flat, zbp / 1e4, "compounded", 2L, format(trade))
  z_back <- RiemannFinMath::compute_z_spread_from_price(bond, flat, z_value$npv, "dirty", "compounded", 2L, settlement)

  risk <- as.list(RiemannFinMath::compute_risk_from_compound_yield(t, C, Y_raw, 100, accrued))
  risk$modified_duration <- trunc3(risk$modified_duration)
  risk$convexity <- trunc3(risk$convexity)

  # 価格と複利利回りの関係（RiemannFinMath の価格式）と、いまの利回りのまわりの一次・二次の近似（傾きは RiemannFinMath の dP/dY）
  P0 <- RiemannFinMath::compute_price_from_compound_yield(t, C, Y_raw, 100, digits = 10L)
  grid <- sort(unique(c(seq(max(0, floor(Y_raw) - 5), floor(Y_raw) + 6, by = 0.125))))
  pg <- vapply(grid, function(g) RiemannFinMath::compute_price_from_compound_yield(t, C, g, 100, digits = 10L), 0)
  dY <- grid - Y_raw
  price_yield <- data.frame(yield_pct = grid, price = pg,
                            duration_approx = P0 + risk$dp_dy_pct * dY,
                            convexity_approx = P0 + risk$dp_dy_pct * dY + 0.5 * risk$d2p_dy2_pct * dY^2)

  list(
    inputs = list(tradeDate = format(trade), issueDate = format(issue), maturityDate = format(maturity),
                  couponPct = C, simpleYieldPct = simple, zSpreadBp = zbp),
    conventions = list(
      bond = "額面100、半年払い、30/360（Bond Basis）、日付は調整なし、Backward、受渡は取引日の2営業日後（Japan）",
      yen = "単価は単利利回りから日本の規則で計算（小数3桁切り捨て）。複利利回り・修正デュレーション・コンベクシティは小数3桁（4桁目切り捨て）",
      engine = an_engine_QL()),
    settlement_date = format(settlement), remaining_years = t,
    clean_price = price, compound_yield_pct = trunc3(Y_raw), accrued = accrued, dirty_price = price + accrued,
    flat_dirty_price = flat_value$npv, z_spread_npv = z_value$npv, z_spread_back_bp = 1e4 * z_back,
    risk = risk,
    cashflows = data.frame(payment_date = format(cf$payment_date), amount = cf$amount, kind = cf$kind,
                           accrual_start = format(cf$accrual_start), accrual_end = format(cf$accrual_end),
                           received = as.Date(cf$payment_date) > settlement),
    price_yield = price_yield
  )
}
