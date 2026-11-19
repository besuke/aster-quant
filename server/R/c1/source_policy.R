# c1：画面から指定された資料の取得元の検査と、安全な取得。
#
# 取得元は、次の 3 つのどれか。アップロード、公開の https の URL、許可したフォルダーのファイル。
#   - URL は https だけ。ユーザー名・パスワード付き、443 以外のポート、IP アドレス、社内の名前（ドットのない名前、.local など）は使えない。
#     名前を引いた結果が、自分自身・社内・予約済みのアドレスなら使えない。転送（リダイレクト）は 1 回ごとに同じ検査をし、
#     検査した IP アドレスに接続を固定する（検査のあとで名前の指す先が変わる攻撃を避ける）。
#   - ファイルは、環境変数 QUANTLET_C1_SOURCE_DIRS（; 区切り。tmp/.Renviron などに書く）に挙げたフォルダーの中の
#     PDF・HTML だけ。未設定なら、サーバーのフォルダーのファイルは使えない。
# どちらも大きさは 50 MB まで。Infrago Quant は社内 LAN に公開できるので、画面から指定された URL やパスで、
# サーバーが社内の機器やサーバーのファイルに触れないようにする。

C1_MAX_BYTES_QL <- 50 * 1024 * 1024
C1_EXTENSIONS_QL <- c("pdf", "htm", "html")

c1_bad_QL <- function(message) {
  if (exists("http_error", mode = "function")) http_error(400L, message) else stop(message, call. = FALSE)
}

c1_source_dirs_QL <- function() {
  dirs <- trimws(strsplit(Sys.getenv("QUANTLET_C1_SOURCE_DIRS", ""), ";", fixed = TRUE)[[1]])
  dirs <- dirs[nzchar(dirs)]
  if (!length(dirs)) return(character())
  vapply(dirs, function(d) sub("/+$", "", normalizePath(d, winslash = "/", mustWork = FALSE)), "", USE.NAMES = FALSE)
}

# 自分自身・社内・予約済みのアドレスか（IPv4・IPv6）。読めないものも、使えないものとして扱う
c1_blocked_address_QL <- function(ip) {
  ip <- tolower(trimws(ip))
  if (grepl("^::ffff:[0-9.]+$", ip)) ip <- sub("^::ffff:", "", ip)
  if (grepl("^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$", ip)) {
    o <- as.integer(strsplit(ip, ".", fixed = TRUE)[[1]])
    return(anyNA(o) || any(o > 255L) || o[1] == 0L || o[1] == 10L || o[1] == 127L || o[1] >= 224L ||
             (o[1] == 100L && o[2] >= 64L && o[2] <= 127L) || (o[1] == 169L && o[2] == 254L) ||
             (o[1] == 172L && o[2] >= 16L && o[2] <= 31L) || (o[1] == 192L && o[2] == 168L) ||
             (o[1] == 192L && o[2] == 0L && o[3] == 0L))
  }
  if (grepl(":", ip, fixed = TRUE)) return(ip %in% c("::", "::1") || grepl("^f[cd]", ip) || grepl("^fe[89ab]", ip) || grepl("^ff", ip))
  TRUE
}

c1_resolve_QL <- function(host) {
  r <- tryCatch(curl::nslookup(host, multiple = TRUE, error = FALSE), error = function(e) NULL)
  if (is.null(r)) character() else unique(as.character(r))
}

# URL を検査し、接続先の IP アドレスを返す（resolver は名前の引き方。テストで差し替える）
c1_check_url_QL <- function(url, resolver = c1_resolve_QL) {
  m <- regmatches(url, regexec("^([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)", url))[[1]]
  if (!length(m)) c1_bad_QL("URL の形式が正しくない")
  if (tolower(m[2]) != "https") c1_bad_QL("URL は https:// だけ使える")
  authority <- m[3]
  if (grepl("@", authority, fixed = TRUE)) c1_bad_QL("ユーザー名・パスワード付きの URL は使えない")
  if (startsWith(authority, "[")) c1_bad_QL("IP アドレスの URL は使えない（名前で指定する）")
  host <- tolower(sub(":[0-9]*$", "", authority))
  port <- if (grepl(":[0-9]+$", authority)) sub("^.*:", "", authority) else "443"
  if (port != "443") c1_bad_QL("URL のポートは 443 だけ使える")
  if (!nzchar(host) || !grepl("^[a-z0-9.-]+$", host)) c1_bad_QL("URL のホスト名が正しくない")
  if (grepl("^[0-9.]+$", host)) c1_bad_QL("IP アドレスの URL は使えない（名前で指定する）")
  if (!grepl(".", host, fixed = TRUE) || host == "localhost" || grepl("[.](local|localhost|localdomain|internal|lan|corp|home|intranet)$", host)) {
    c1_bad_QL("社内・自分自身の名前の URL は使えない")
  }
  addresses <- resolver(host)
  if (!length(addresses)) c1_bad_QL(paste0("名前を引けない: ", host))
  if (any(vapply(addresses, c1_blocked_address_QL, TRUE))) c1_bad_QL("自分自身・社内・予約済みのアドレスに向く URL は使えない")
  v4 <- addresses[grepl("^[0-9.]+$", addresses)]
  list(url = url, host = host, ip = if (length(v4)) v4[1] else addresses[1])
}

c1_check_file_QL <- function(path, dirs = c1_source_dirs_QL()) {
  if (!length(dirs)) {
    c1_bad_QL("サーバーのフォルダーのファイルは使えない（許可したフォルダーが未設定）。URL かアップロードを使う")
  }
  p <- normalizePath(path, winslash = "/", mustWork = FALSE)
  if (!file.exists(p) || dir.exists(p)) c1_bad_QL("ファイルが見つからない")
  if (!any(startsWith(tolower(p), tolower(paste0(dirs, "/"))))) c1_bad_QL("許可したフォルダーの外のファイルは使えない")
  if (!tolower(tools::file_ext(p)) %in% C1_EXTENSIONS_QL) c1_bad_QL("ファイルは .pdf・.htm・.html だけ使える")
  if (file.size(p) > C1_MAX_BYTES_QL) c1_bad_QL("ファイルが大きすぎる（50 MB まで）")
  list(kind = "file", source = p, label = basename(p))
}

# 取得元の文字列を検査して、取り込みに渡す形にする
c1_check_source_QL <- function(source, resolver = c1_resolve_QL, dirs = c1_source_dirs_QL()) {
  s <- trimws(gsub('^"|"$', "", source))
  if (!nzchar(s)) c1_bad_QL("取得元が空である")
  if (grepl("^[A-Za-z][A-Za-z0-9+.-]*://", s)) {
    s <- strip_tracking_params_c1(s)
    c1_check_url_QL(s, resolver)
    name <- utils::URLdecode(basename(sub("[?#].*$", "", s)))
    return(list(kind = "url", source = s, label = if (nzchar(name)) name else "document"))
  }
  c1_check_file_QL(s, dirs)
}

c1_absolute_url_QL <- function(location, base) {
  if (grepl("^https?://", location, ignore.case = TRUE)) return(location)
  origin <- sub("^(https?://[^/?#]+).*$", "\\1", base, ignore.case = TRUE)
  if (startsWith(location, "/")) return(paste0(origin, location))
  paste0(sub("[?#].*$", "", sub("[^/]*$", "", sub("^(https?://[^/?#]+)$", "\\1/", base))), location)
}

# 1 回分の取得（転送は追わない。検査した IP アドレスに接続を固定する）
c1_fetch_one_QL <- function(url, path, user_agent, checked) {
  handle <- curl::new_handle(useragent = user_agent, followlocation = FALSE, timeout = 120L, connecttimeout = 15L)
  curl::handle_setopt(handle, resolve = sprintf("%s:443:%s", checked$host, checked$ip))
  res <- curl::curl_fetch_disk(url, path, handle = handle)
  location <- curl::parse_headers_list(res$headers)$location
  list(status = res$status_code, content_type = res$type, location = if (is.null(location)) "" else location)
}

# 取り込み（acquire_document_c1）の fetcher：転送を 1 回ずつ検査して追う。resolver・fetch_one はテストで差し替える
c1_safe_fetch_QL <- function(url, path, user_agent, resolver = c1_resolve_QL, fetch_one = c1_fetch_one_QL, max_hops = 5L) {
  current <- url
  for (hop in seq_len(max_hops + 1L)) {
    checked <- c1_check_url_QL(current, resolver)
    res <- fetch_one(current, path, user_agent, checked)
    if (as.integer(res$status) %in% c(301L, 302L, 303L, 307L, 308L) && nzchar(res$location)) {
      current <- c1_absolute_url_QL(res$location, current)
      next
    }
    if (file.exists(path) && file.size(path) > C1_MAX_BYTES_QL) {
      unlink(path)
      c1_bad_QL("資料が大きすぎる（50 MB まで）")
    }
    return(list(status = res$status, content_type = res$content_type, final_url = current))
  }
  c1_bad_QL("転送が多すぎる")
}

# 画面に出す、いま使える取得元
c1_sources_QL <- function() {
  dirs <- c1_source_dirs_QL()
  list(url = list(enabled = TRUE, scheme = "https"),
       files = list(enabled = length(dirs) > 0L, folders = as.list(basename(dirs))),
       max_mb = C1_MAX_BYTES_QL / 1024 / 1024)
}
