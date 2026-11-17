# 早期償還：コール条項つき債券（Hull-White 1因子）と MBS（パススルー、PSA・借換えインセンティブ）。Carmine Studio の
# /api/callable（early-redemption）から、RiemannFinMath で計算できる部分を移した。計算はすべて RiemannFinMath。
# （Carmine にある、コール判断の境界・20本の経路・静的 OAS の表は、原稿の独自の R 関数や乱数に依るので移していない）
#
# POST /api/analytics/early-redemption
#   {"bond":{"ratePct":2,"aPct":15,"sigmaPct":1.2,"couponPct":3,"firstCallYear":1,"callPrice":100},
#    "mbs":{"psaPct":100,"incentive":20,"refiCostPct":0.5}}
# 債券：額面100、5年、半年ごとのクーポン、フラットな連続複利の初期カーブ。コールはクーポン支払後に元本をコール価格で償還。
# MBS ：元本100、モーゲージ金利 5%、パススルー金利 4.5%、360か月。

ER_DEFAULTS_QL <- list(
  bond = list(ratePct = 2, aPct = 15, sigmaPct = 1.2, couponPct = 3, firstCallYear = 1, callPrice = 100),
  mbs = list(psaPct = 100, incentive = 20, refiCostPct = 0.5)
)
ER_MBS_QL <- list(balance = 100, mortgage_rate = 0.05, pass_through_rate = 0.045, months = 360L)
ER_CACHE_QL <- new.env(parent = emptyenv())

er_memo_QL <- function(name, inputs, f) {
  key <- paste(name, paste(format(unlist(inputs), digits = 17), collapse = "|"))
  if (is.null(ER_CACHE_QL[[key]])) assign(key, f(), envir = ER_CACHE_QL)
  ER_CACHE_QL[[key]]
}

er_read_QL <- function(body, section, ranges) {
  given <- body[[section]]
  if (!is.null(given) && !is.list(given)) an_bad_QL(sprintf("%s はオブジェクトにする", section))
  extra <- setdiff(names(given), names(ER_DEFAULTS_QL[[section]]))
  if (length(extra)) an_bad_QL(paste0("知らない項目: ", section, ".", extra[1]))
  p <- utils::modifyList(ER_DEFAULTS_QL[[section]], if (is.null(given)) list() else given)
  for (k in names(ranges)) {
    x <- p[[k]]; lim <- ranges[[k]]
    if (!(is.numeric(x) && length(x) == 1L && is.finite(x) && x >= lim[1] && x <= lim[2])) {
      an_bad_QL(sprintf("%s.%s は %s 以上 %s 以下の数値にする", section, k, lim[1], lim[2]))
    }
  }
  p
}

er_flows_QL <- function(p) {
  time <- seq(0.5, 5, by = 0.5)
  data.frame(time = time, coupon = 100 * p$couponPct / 100 * 0.5, principal = ifelse(time == 5, 100, 0),
             call_price = ifelse(time >= p$firstCallYear & time < 5, p$callPrice, NA_real_))
}
er_value_QL <- function(flows, a, sigma, curve) {
  as.list(RiemannFinMath::compute_hull_white_callable_bond_value(flows$time, flows$coupon, flows$principal, flows$call_price,
                                                                 a, sigma, curve, points = 321L, limit = 0.13, nodes = 24L))
}

er_bond_QL <- function(p) er_memo_QL("bond", p, function() {
  r <- p$ratePct / 100; a <- p$aPct / 100; sigma <- p$sigmaPct / 100
  curve <- RiemannFinMath::create_flat_curve("2026-11-02", r, "actual_365_fixed", "continuous")
  flows <- er_flows_QL(p)
  v <- er_value_QL(flows, a, sigma, curve)
  vol_grid <- seq(0, 0.025, by = 0.0025)
  by_vol <- do.call(rbind, lapply(vol_grid, function(s) {
    x <- er_value_QL(flows, a, s, curve)
    data.frame(volatility = s, callable = x$callable, bullet = x$bullet, issuer_call_value = x$issuer_call_value)
  }))
  list(flows = flows, bullet = v$bullet, callable = v$callable, issuer_call_value = v$issuer_call_value, by_volatility = by_vol)
})

er_mbs_QL <- function(p) er_memo_QL("mbs", p, function() {
  m <- ER_MBS_QL
  pool <- RiemannFinMath::create_mbs_pass_through(m$balance, m$mortgage_rate, m$pass_through_rate, maturity_months = m$months,
                                                  psa_multiplier = p$psaPct / 100, incentive_sensitivity = p$incentive,
                                                  refinancing_cost_rate = p$refiCostPct / 100, cpr_cap = 0.6, amortization = "fixed_payment")
  names3 <- c("借換え金利低下", "金利一定", "借換え金利上昇")
  paths <- list(c(rep(0.05, 24), rep(0.035, m$months - 24)), rep(0.05, m$months), c(rep(0.05, 24), rep(0.065, m$months - 24)))
  cfs <- lapply(paths, function(f) RiemannFinMath::compute_mbs_cashflows(pool, f))
  scen <- do.call(rbind, lapply(seq_along(paths), function(i) {
    f <- paths[[i]]
    fixed <- RiemannFinMath::compute_mbs_path_values(pool, matrix(0.04, 1, m$months), matrix(f, 1))
    path <- RiemannFinMath::compute_mbs_path_values(pool, matrix(f - 0.01, 1), matrix(f, 1))
    data.frame(scenario = names3[i], weighted_average_life = fixed$weighted_average_life, price_fixed_discount = fixed$price,
               price_path_discount = path$price, total_principal = sum(cfs[[i]]$scheduled_principal + cfs[[i]]$prepaid_principal))
  }))
  flat <- as.data.frame(cfs[[2]])
  list(
    pool = list(balance = m$balance, mortgage_rate = m$mortgage_rate, pass_through_rate = m$pass_through_rate, months = m$months),
    scenarios = scen,
    cpr = data.frame(month = seq_len(m$months), falling = cfs[[1]]$cpr, flat = flat$cpr, rising = cfs[[3]]$cpr),
    flat_cashflows = flat[, c("month", "interest", "scheduled_principal", "prepaid_principal", "end_balance")]
  )
})

compute_early_redemption_QL <- function(body = list()) {
  an_unknown_QL(body, c("bond", "mbs"))
  b <- er_read_QL(body, "bond", list(ratePct = c(-2, 10), aPct = c(1, 100), sigmaPct = c(0, 3), couponPct = c(0, 10), firstCallYear = c(0.5, 4.5), callPrice = c(90, 120)))
  m <- er_read_QL(body, "mbs", list(psaPct = c(0, 500), incentive = c(0, 50), refiCostPct = c(0, 3)))
  if (abs(b$firstCallYear * 2 - round(b$firstCallYear * 2)) > 1e-9) an_bad_QL("最初のコール日は利払日（0.5 年刻み）にする")
  list(
    inputs = list(bond = b, mbs = m),
    conventions = list(
      bond = "額面100、5年、半年ごとのクーポン。コールはクーポン支払後に元本をコール価格で償還。フラットな連続複利の初期カーブ、Hull-White 1因子（状態の格子 321 点、Gauss-Hermite 24 点）",
      mbs = "パススルー（元本100、モーゲージ金利 5%、パススルー金利 4.5%、360か月、元の毎月返済額を維持）。CPR = min(0.6, PSA × min(0.002m, 0.06) × exp(β(c − f − k)))",
      engine = an_engine_QL()),
    bond = er_bond_QL(b), mbs = er_mbs_QL(m)
  )
}
