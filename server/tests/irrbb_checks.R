# IRRBB 金利シナリオの検算（RiemannFinMath と QuantLet の集計）。
#   "C:/Program Files/R/R-4.6.0/bin/Rscript.exe" tests/irrbb_checks.R     （server/ で実行）
source("R/load_quantlet.R", encoding = "UTF-8"); load_quantlet(getwd())
results <- list()
check <- function(name, ok, detail = "") {
  results[[length(results) + 1L]] <<- data.frame(check = name, result = if (isTRUE(ok)) "PASS" else "FAIL", detail = detail)
}
jpy <- RiemannFinMath::get_irrbb_shock_sizes("JPY")
t <- c(0, 0.25, 0.5, 1, 2, 3.5, 5, 10, 20, 30)
up <- RiemannFinMath::compute_irrbb_shocks(t, "parallel_up", jpy)
down <- RiemannFinMath::compute_irrbb_shocks(t, "parallel_down", jpy)
check("円の上方パラレルは全年限で +100 bp", all(abs(up - 100) < 1e-12), paste(range(up), collapse = "〜"))
check("円の下方パラレルは全年限で -100 bp", all(abs(down + 100) < 1e-12), paste(range(down), collapse = "〜"))
st <- RiemannFinMath::compute_irrbb_shocks(3.5, "steepener", jpy)
check("円のスティープ化は 3.5 年で約 +25.4 bp（SRP31.92 の計算例）", round(st, 1) == 25.4, sprintf("%.6f bp", st))
r <- compute_irrbb_portfolio_QL()
pu <- purrr::detect(r$scenarios, \(s) s$id == "parallel_up")
check("上方パラレルでサンプル債券の PV がすべて下がる", all(pu$bonds$pv_change < 0), paste(format(round(pu$bonds$pv_change)), collapse = ", "))
for (s in r$scenarios) {
  d <- abs(sum(s$bonds$pv_change) - s$total$pv_change)
  check(paste0(s$label, "：銘柄別 PV 変化の合計 = ポートフォリオの PV 変化"), d < 1e-6, sprintf("差 %.3g 円", d))
}
check("国内基準行は 3 シナリオ、国際統一基準行は 6 シナリオ",
      identical(r$scenario_sets$domestic$ids, c("parallel_up", "parallel_down", "steepener")) && length(r$scenario_sets$international$ids) == 6L)
out <- do.call(rbind, results)
print(out, right = FALSE)
dir.create("tests/results", showWarnings = FALSE)
write.csv(out, "tests/results/irrbb_checks.csv", row.names = FALSE, fileEncoding = "UTF-8")
cat(sprintf("run_at: %s  RiemannFinMath %s  PASS %d / %d\n", format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z"), packageVersion("RiemannFinMath"),
            sum(out$result == "PASS"), nrow(out)))
if (any(out$result != "PASS")) quit(status = 1)
