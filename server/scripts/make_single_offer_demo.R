# 円債オファー1件のデモ Excel（架空）：Curie のデモと同じ様式（scripts/demo_data/demo_data_offers.R の write_demo_offer_jpy_Curie）で、
# テスト円債B 0.90% 2031/3（JPTEST000022、テスト証券B、単価 98.15、受渡 2026/10/08）の1行だけを持つ。画面からのアップロードの確認用。
#   Rscript scripts/make_single_offer_demo.R     （どのフォルダーからでもよい。ui/ からは npm run r -- ../server/scripts/make_single_offer_demo.R）
# この R スクリプトの場所から server/（VERSION があるフォルダー）を決め、そこを作業ディレクトリにする（どこから起動してもよい）
local({
  f <- sub("^--file=", "", grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE))
  d <- if (length(f)) dirname(normalizePath(f[1L], winslash = "/")) else normalizePath(getwd(), winslash = "/")
  while (!file.exists(file.path(d, "VERSION")) && dirname(d) != d) d <- dirname(d)
  setwd(d)
})
source("R/load_quantlet.R", encoding = "UTF-8"); load_quantlet(getwd())
rows_to_sheet <- function(rows) {
  width <- max(lengths(rows))
  rows |> purrr::map(\(r) rlang::set_names(as.list(c(r, rep(NA_character_, width - length(r)))), paste0("V", seq_len(width)))) |> dplyr::bind_rows()
}
header <- c("No.", "オファー日", "ISINコード", "銘柄名", "業者名", "単価", "数量(億円)", "受渡日", "参考:発行価格")
offer <- c("1", "2026/10/06", "JPTEST000022", "テスト円債B 0.90% 2031/3", "テスト証券B", "98.15", "10", "2026/10/08",
           sprintf("%.2f", readRDS("data/demo/a1/attributes/demo_attributes_20261006.rds") |> dplyr::filter(ISIN == "JPTEST000022") |> dplyr::pull(issue_price)))
sheet <- rows_to_sheet(list("円債オファー一覧（デモ・架空データ・1件）", "作成日: 2026/10/06",
                            "単価は額面100円当たりのクリーン価格（経過利子を含まない）。数量は額面・億円。", NA_character_, header, offer,
                            NA_character_, "※ 架空の銘柄・価格です。実在の銘柄・市場価格ではありません。"))
desc <- rows_to_sheet(list(c("項目", "内容"), c("用途", "QuantLet の画面からのアップロード確認用（架空データ、1件）"),
                           c("対象シート", "「円債オファー」"), c("見出し行", "5行目")))
path <- "data/demo/a1/offers/demo_offer_JPY_single_JPTEST000022.xlsx"
write_xlsx_Curie(list("説明" = desc, "円債オファー" = sheet), path, col_names = FALSE)
cat("wrote", path, "\n")
