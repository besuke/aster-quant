# RStudio（Positron）でこのプロジェクトを開いたときだけ、使い方を表示する。
# Rscript・サーバーの起動（interactive() が FALSE）では何もしない。
if (interactive()) {
  iq_check <- function() {
    # いま使っている R で、R の版と必須パッケージ（RiemannFinMath など）を確かめる
    rscript <- file.path(R.home("bin"), if (.Platform$OS.type == "windows") "Rscript.exe" else "Rscript")
    invisible(system2(rscript, shQuote("server/scripts/check_r.R")))
  }
  local({
    cat("Infrago Quant（", R.version.string, "）\n", sep = "")
    cat("  iq_check()   この R で必須パッケージを読み込めるか確かめる\n")
    cat("  起動：ターミナルで  .\\start_infrago.ps1   （R API 8790 と画面 8091。引き継ぎ・手順は HANDOVER.md）\n")
    if (!requireNamespace("RiemannFinMath", quietly = TRUE)) {
      cat("  ※ RiemannFinMath がこの R に入っていません。HANDOVER.md の「RiemannFinMath を入れる」を参照\n")
    }
  })
}
