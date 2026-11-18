# C1 の照合：QuantLet の C1（Curie から移植）と、Curie の案件 DEMO_TRS_confirmation_20261027_081517（2026-10-27）の成果物。
#
#   Rscript tests/reconciliation/c1/reconcile_c1.R     （どのフォルダーからでもよい。ui/ からは npm run r -- ../server/tests/reconciliation/c1/reconcile_c1.R）
#
# 入力：同じ架空の確認書（DEMO_TRS_confirmation.pdf）と、Curie の案件に残る Claude の抽出結果（reviewed.json・fpml.xml・review_items.md）。
# 読み方は saved（AI を呼ばない）。Curie の参照は tests/reconciliation/curie_reference/c1/ に写したもの。結果は tests/reconciliation/c1/results/。
suppressPackageStartupMessages(library(dplyr))
# この R スクリプトの場所から server/（VERSION があるフォルダー）を決め、そこを作業ディレクトリにする（どこから起動してもよい）
local({
  f <- sub("^--file=", "", grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE))
  d <- if (length(f)) dirname(normalizePath(f[1L], winslash = "/")) else normalizePath(getwd(), winslash = "/")
  while (!file.exists(file.path(d, "VERSION")) && dirname(d) != d) d <- dirname(d)
  setwd(d)
})
source("R/load_quantlet.R", encoding = "UTF-8"); load_quantlet(getwd())
out_dir <- file.path("tests", "reconciliation", "c1", "results"); dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
ref_dir <- file.path("tests", "reconciliation", "curie_reference", "c1")
Sys.setenv(QUANTLET_ALADDIN_MAP = "", QUANTLET_OUR_PARTY_NAMES = "", QUANTLET_FPML_XSD = "")  # Curie の参照と同じく未設定
case <- workflows_c1_case("data/demo/c1/DEMO_TRS_confirmation.pdf", "saved", case_id = "reconcile_c1",
                          output_root = file.path(tempdir(), "c1_cases"), claude_demo_dir = "data/demo/c1/extraction_DEMO_TRS",
                          instruction_path = "agent_instructions/c1_trs_extraction_instructions.md")
rd <- function(...) jsonlite::fromJSON(file.path(...), simplifyVector = TRUE)
ref_val <- rd(ref_dir, "r_validation.json"); ql_val <- rd(case$case_dir, "r_validation.json")
ref_cond <- rd(ref_dir, "conditions.json")$conditions; ql_cond <- rd(case$case_dir, "result", "conditions.json")$conditions
ref_un <- rd(ref_dir, "aladdin_unresolved.json"); ql_un <- rd(case$case_dir, "result", "aladdin_unresolved.json")
keys <- c("item_id", "leg_id", "seq", "value", "unit", "value_status", "source_page", "source_location", "quote", "review_status", "review_note")
same_tbl <- function(a, b, cols) isTRUE(all.equal(as.data.frame(a[cols]), as.data.frame(b[cols]), check.attributes = FALSE))
checks <- tibble::tribble(
  ~item, ~curie, ~quantlet,
  "状態（r_validation.json state）", ref_val$state, ql_val$state,
  "判定：XML構文", ref_val$verdicts[["XML構文"]], ql_val$verdicts[["XML構文"]],
  "判定：公式XSD", ref_val$verdicts[["公式XSD"]], ql_val$verdicts[["公式XSD"]],
  "判定：原文根拠", ref_val$verdicts[["原文根拠"]], ql_val$verdicts[["原文根拠"]],
  "判定：条件JSONとの整合", ref_val$verdicts[["条件JSONとの整合"]], ql_val$verdicts[["条件JSONとの整合"]],
  "FpML の出力名", if (file.exists(file.path(ref_dir, "fpml_DRAFT.xml"))) "fpml_DRAFT.xml" else "fpml_final.xml", basename(case$fpml),
  "条件の件数", as.character(nrow(ref_cond)), as.character(nrow(ql_cond)),
  "条件の内容（11列、全行）", "", if (same_tbl(ref_cond, ql_cond, keys)) "" else "差あり",
  "FpML の内容", paste(readLines(file.path(ref_dir, "fpml_DRAFT.xml"), warn = FALSE), collapse = "\n"),
  paste(readLines(case$fpml, warn = FALSE), collapse = "\n"),
  "Aladdin 下書きの本文", paste(readLines(file.path(ref_dir, "aladdin_request_DRAFT.json"), warn = FALSE), collapse = ""),
  paste(readLines(file.path(case$case_dir, "result", "aladdin_request_DRAFT.json"), warn = FALSE), collapse = ""),
  "Aladdin 下書きの状態", ref_un$status, ql_un$status,
  "未確定の項目（項目・理由）", as.character(jsonlite::toJSON(ref_un$unresolved)), as.character(jsonlite::toJSON(ql_un$unresolved)),
  "原資料の SHA-256", rd(ref_dir, "manifest.json")$document$sha256, case$results$manifest$document$sha256
) |> mutate(match = curie == quantlet)
# 検証の詳細（各検証の表）も、列ごとに比べる
detail <- purrr::imap(ref_val$checks, function(tbl, name) {
  q <- ql_val$checks[[name]]
  tibble(check = name, curie_rows = NROW(tbl), quantlet_rows = NROW(q),
         match = isTRUE(all.equal(as.data.frame(tbl), as.data.frame(q), check.attributes = FALSE)))
}) |> purrr::list_rbind()
# 未確定の理由の文言は、自社の名前（our_party_names）が空か、設定されていて一致しないかで変わる（R/c1/aladdin_payload.R 94〜95 行）。
# Curie の参照案件は名前が設定された状態で作られた（値は記録されていない）。一致しない仮の名前で同じ文言になるかを確かめる
# （この呼び出しは一時フォルダーの案件の下書きを書き直す。上の比較は書き直す前に読んだ内容で行った）
un2 <- write_aladdin_draft_c1(case, read_aladdin_map_c1(our_party_names = "QuantLet Reconciliation Dummy"))$unresolved
checks <- bind_rows(checks, tibble(item = "未確定の項目（自社の名前を仮に設定）", curie = as.character(jsonlite::toJSON(ref_un$unresolved)),
                                   quantlet = as.character(jsonlite::toJSON(un2))) |> mutate(match = curie == quantlet))
write.csv(checks |> mutate(curie = substr(curie, 1, 200), quantlet = substr(quantlet, 1, 200)), file.path(out_dir, "c1_checks.csv"),
          row.names = FALSE, fileEncoding = "UTF-8")
write.csv(detail, file.path(out_dir, "c1_validation_details.csv"), row.names = FALSE, fileEncoding = "UTF-8")
options(width = 200)
print(checks |> transmute(item, match, curie = substr(curie, 1, 50), quantlet = substr(quantlet, 1, 50)), n = 30)
print(detail, n = 30)
writeLines(c(paste("run_at:", format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z")), paste("R:", R.version.string),
             paste("checks:", nrow(checks), "mismatch:", sum(!checks$match)),
             paste("validation detail tables:", nrow(detail), "mismatch:", sum(!detail$match))), file.path(out_dir, "session_info.txt"))
cat(readLines(file.path(out_dir, "session_info.txt")), sep = "\n")
