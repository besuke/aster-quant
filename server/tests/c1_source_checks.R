# C1 の取得元（URL・許可したフォルダーのファイル）の検査の検算。ネットワークは使わない（名前の引き方と取得は差し替える）。
#   Rscript tests/c1_source_checks.R     （どのフォルダーからでもよい。ui/ からは npm run test:c1-source）
local({
  f <- sub("^--file=", "", grep("^--file=", commandArgs(trailingOnly = FALSE), value = TRUE))
  d <- if (length(f)) dirname(normalizePath(f[1L], winslash = "/")) else normalizePath(getwd(), winslash = "/")
  while (!file.exists(file.path(d, "VERSION")) && dirname(d) != d) d <- dirname(d)
  setwd(d)
})
source("R/load_quantlet.R", encoding = "UTF-8"); load_quantlet(getwd())
results <- list()
check <- function(name, ok, detail = "") {
  results[[length(results) + 1L]] <<- data.frame(check = name, result = if (isTRUE(ok)) "PASS" else "FAIL", detail = detail)
}
refused <- function(expr, pattern = "") {   # 拒否された（エラーになり、メッセージが合う）か
  msg <- tryCatch({ expr; NA_character_ }, error = function(e) conditionMessage(e))
  !is.na(msg) && grepl(pattern, msg)
}
public <- function(host) "93.184.216.34"      # 公開のアドレスに引ける名前

# ---- アドレス
blocked <- c("10.0.0.1", "127.0.0.1", "192.168.1.5", "172.16.0.1", "172.31.255.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
             "::1", "fe80::1", "fd00::1", "fc00::1", "::ffff:10.0.0.1", "999.1.1.1", "abc")
allowed <- c("93.184.216.34", "8.8.8.8", "172.32.0.1", "172.15.0.1", "2606:4700::1111")
check("自分自身・社内・予約済みのアドレスを使えないとする（16 例）", all(vapply(blocked, c1_blocked_address_QL, TRUE)),
      paste(blocked[!vapply(blocked, c1_blocked_address_QL, TRUE)], collapse = " "))
check("公開のアドレスは使えるとする（5 例、172.16/12 のすぐ外の 172.15・172.32 を含む）", !any(vapply(allowed, c1_blocked_address_QL, TRUE)),
      paste(allowed[vapply(allowed, c1_blocked_address_QL, TRUE)], collapse = " "))

# ---- URL
check("https の公開の URL は通る", identical(c1_check_url_QL("https://example.com/a/b.pdf", public)$ip, "93.184.216.34"))
bad_urls <- list(
  c("http:// は使えない", "http://example.com/a.pdf", "https://"),
  c("ftp:// は使えない", "ftp://example.com/a.pdf", "https://"),
  c("ユーザー名・パスワード付きは使えない", "https://user:pw@example.com/a.pdf", "ユーザー名"),
  c("IPv6 の IP アドレスの URL は使えない", "https://[::1]/a.pdf", "IP アドレス"),
  c("IPv4 の IP アドレスの URL は使えない", "https://127.0.0.1/a.pdf", "IP アドレス"),
  c("localhost は使えない", "https://localhost/a.pdf", "社内"),
  c("ドットのない名前（社内の名前）は使えない", "https://intranet/a.pdf", "社内"),
  c(".local は使えない", "https://files.corp.local/a.pdf", "社内"),
  c("443 以外のポートは使えない", "https://example.com:8443/a.pdf", "ポート"))
for (b in bad_urls) check(b[1], refused(c1_check_url_QL(b[2], public), b[3]), b[2])
check("名前が社内のアドレスに引ける URL は使えない", refused(c1_check_url_QL("https://example.com/a.pdf", function(h) "10.1.2.3"), "社内"))
check("名前が 1 つでも社内のアドレスを含むと使えない", refused(c1_check_url_QL("https://example.com/a.pdf", function(h) c("93.184.216.34", "192.168.0.9")), "社内"))
check("名前を引けない URL は使えない", refused(c1_check_url_QL("https://example.com/a.pdf", function(h) character()), "名前を引けない"))
check("追跡用のパラメータ（utm_）は除いて取得元にする",
      identical(c1_check_source_QL("https://example.com/a.pdf?utm_source=x&id=7", public, character())$source, "https://example.com/a.pdf?id=7"))

# ---- 転送（リダイレクト）
hops <- function(sequence) {   # 取得を順に返す（status, location）
  i <- 0L
  function(url, path, ua, checked) { i <<- i + 1L; writeLines("x", path); sequence[[i]] }
}
path <- tempfile()
r <- c1_safe_fetch_QL("https://example.com/a.pdf", path, "ua", public, hops(list(list(status = 200L, content_type = "application/pdf", location = ""))))
check("転送のない取得は、最後の URL と状態を返す", identical(r$final_url, "https://example.com/a.pdf") && r$status == 200L)
r <- c1_safe_fetch_QL("https://example.com/a.pdf", path, "ua", public,
                      hops(list(list(status = 302L, content_type = "", location = "/b/c.pdf"), list(status = 200L, content_type = "application/pdf", location = ""))))
check("同じ名前への転送（相対）は追う", identical(r$final_url, "https://example.com/b/c.pdf"))
resolver <- function(h) if (h == "internal-host.example.org") "10.9.9.9" else "93.184.216.34"
check("転送先が社内のアドレスなら止める", refused(c1_safe_fetch_QL("https://example.com/a.pdf", path, "ua", resolver,
      hops(list(list(status = 302L, content_type = "", location = "https://internal-host.example.org/x.pdf")))), "社内"))
check("http:// への転送は止める", refused(c1_safe_fetch_QL("https://example.com/a.pdf", path, "ua", public,
      hops(list(list(status = 301L, content_type = "", location = "http://example.com/a.pdf")))), "https://"))
check("転送が 6 回を超えたら止める", refused(c1_safe_fetch_QL("https://example.com/a.pdf", path, "ua", public,
      hops(rep(list(list(status = 302L, content_type = "", location = "/again.pdf")), 10))), "転送が多すぎる"))
big <- function(url, path, ua, checked) { con <- file(path, "wb"); writeBin(raw(1024), con); close(con); list(status = 200L, content_type = "", location = "") }
old <- C1_MAX_BYTES_QL; C1_MAX_BYTES_QL <- 512
check("大きすぎる資料は止めて、ファイルを消す", refused(c1_safe_fetch_QL("https://example.com/a.pdf", path, "ua", public, big), "大きすぎる") && !file.exists(path))
C1_MAX_BYTES_QL <- old

# ---- 許可したフォルダーのファイル
root <- file.path(tempfile("c1dirs")); dir.create(file.path(root, "allowed"), recursive = TRUE); dir.create(file.path(root, "other"))
allowed_dir <- normalizePath(file.path(root, "allowed"), winslash = "/"); other_dir <- normalizePath(file.path(root, "other"), winslash = "/")
writeLines("%PDF-1.4", file.path(allowed_dir, "ok.pdf")); writeLines("x", file.path(allowed_dir, "note.txt")); writeLines("%PDF-1.4", file.path(other_dir, "no.pdf"))
check("許可したフォルダーのファイルは通る", identical(c1_check_source_QL(file.path(allowed_dir, "ok.pdf"), public, allowed_dir)$kind, "file"))
check("許可したフォルダーの外のファイルは使えない", refused(c1_check_source_QL(file.path(other_dir, "no.pdf"), public, allowed_dir), "外"))
check("「..」で外に出るパスは使えない", refused(c1_check_source_QL(file.path(allowed_dir, "..", "other", "no.pdf"), public, allowed_dir), "外"))
check("フォルダー名が前方一致するだけの別のフォルダーは使えない",
      refused(c1_check_source_QL(file.path(other_dir, "no.pdf"), public, substr(other_dir, 1, nchar(other_dir) - 2)), "外"))
check(".pdf・.htm・.html 以外は使えない", refused(c1_check_source_QL(file.path(allowed_dir, "note.txt"), public, allowed_dir), "だけ使える"))
check("ないファイルは使えない", refused(c1_check_source_QL(file.path(allowed_dir, "none.pdf"), public, allowed_dir), "見つからない"))
check("許可したフォルダーが未設定なら、ファイルは使えない", refused(c1_check_source_QL(file.path(allowed_dir, "ok.pdf"), public, character()), "未設定"))
check("空の取得元は使えない", refused(c1_check_source_QL("  ", public, allowed_dir), "空"))
Sys.setenv(QUANTLET_C1_SOURCE_DIRS = paste0(allowed_dir, ";", other_dir, "/"))
check("環境変数 QUANTLET_C1_SOURCE_DIRS（; 区切り）から許可したフォルダーを読む", identical(sort(c1_source_dirs_QL()), sort(c(allowed_dir, other_dir))))
s <- c1_sources_QL()
check("画面に出す取得元の情報（URL は https、フォルダーは名前だけ）", identical(s$url$scheme, "https") && s$files$enabled && setequal(unlist(s$files$folders), c("allowed", "other")))
Sys.unsetenv("QUANTLET_C1_SOURCE_DIRS")
check("未設定なら、フォルダーのファイルは使えないと伝える", !c1_sources_QL()$files$enabled)

out <- do.call(rbind, results)
print(out, right = FALSE)
dir.create("tests/results", showWarnings = FALSE)
write.csv(out, "tests/results/c1_source_checks.csv", row.names = FALSE, fileEncoding = "UTF-8")
cat(sprintf("run_at: %s  PASS %d / %d\n", format(Sys.time(), "%Y-%m-%d %H:%M:%S %Z"), sum(out$result == "PASS"), nrow(out)))
if (any(out$result != "PASS")) quit(status = 1)
