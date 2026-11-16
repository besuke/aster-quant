// R の API（server/server.R）の呼び出し。画面は計算をせず、返った JSON を表示するだけ。

export type Workflow = "JPY" | "ISO";

export interface UploadResult {
  uploadId: string;
  fileName: string;
  bytes: number;
  savedTo: string;
}

export interface OfferRow {
  ISIN: string;
  security_name: string | null;
  currency: string | null;
  broker_names: string | null;
  offer_price: number | null;
  offer_size: number | null;
  offer_size_unit: string | null;
  offer_date: string | null;
  offer_settlementdate: string | null;
  coupon_rate: number | null;
  maturity_date: string | null;
  calculation_end_date: string | null;
  validation_status: string;
  validation_message: string;
  pricing_status: string;
  pricing_message: string;
  accrued_per_100: number | null;
  dirty_price: number | null;
  asw_effective_date: string | null;
  asw_maturity_date: string | null;
  native_asw_bp: number | null;
  compound_yield_pct?: number | null;
  modified_duration?: number | null;
  convexity?: number | null;
  jpy_compound_yield_pct?: number | null;
  jgb_interpolated_yield_pct?: number | null;
  jgb_spread_bp?: number | null;
  fx_spot?: number | null;
  basis_bp?: number | null;
  jpy_asw_bp?: number | null;
  simple_sum_bp?: number | null;
  calibrated_discount_spread_bp?: number | null;
  offer_source_file: string;
  offer_source_sheet: string;
  offer_source_row: number;
  [key: string]: unknown;
}

export interface CurveRow {
  currency: string;
  curve_status: string;
  curve_message: string;
  index?: string;
  quotes?: number;
  last_tenordate?: string;
  max_abs_quote_error_bp?: number;
  engine?: string;
}

export interface A1Result {
  workflow: Workflow;
  run_id: string;
  valuation_date: string;
  counts: { validation_status: string; pricing_status: string; n: number }[];
  offers: OfferRow[];
  curves: CurveRow[];
  market_log: Record<string, unknown>[];
  settings: Record<string, unknown>;
  environment: { item: string; value: string; note: string }[];
  output_file: string;
  offer_file: string;
  input_note: string;
  market_note: string;
  seconds: number;
}

export interface ConditionRow {
  item_id: string;
  leg_id: string;
  seq: string | number;
  value: string;
  unit: string;
  value_status: string;
  source_page: string;
  source_location: string;
  quote: string;
  review_status: string;
  review_note: string;
  section: string;
  label_ja: string;
  required: boolean;
  引用の実在確認: string;
  [key: string]: unknown;
}

export interface C1Result {
  case_id: string;
  state: string;
  reader: string;
  reader_note: string;
  failure: { kind: string; message: string } | null;
  verdicts: Record<string, string> | null;
  final: boolean;
  summary: Record<string, string> | null;
  conditions: ConditionRow[] | null;
  checks: { 区分: string; 検証: string; 結果: string; 詳細: string }[] | null;
  pages: { page: number; method: string; chars: number; text: string }[] | null;
  review_items: string | null;
  document: { file_name: string; pages: number; sha256: string; kind: string } | null;
  fpml_file: string | null;
  fpml_xml: string | null;
  aladdin: {
    status: string;
    payload: unknown;
    unresolved: {
      status: string;
      note: string;
      endpoint: Record<string, string>;
      mapping_file: string;
      unresolved: { 項目: string; 条件: string; 値: string; 理由: string }[];
    } | null;
  } | null;
  source_file: string;
  is_demo_document: boolean;
  naming: { name: string | null; review_name: string; missing: Record<string, string> } | null;
  seconds: number;
}

export interface BloombergStatus {
  config: { credentials_set: boolean; credentials_file_exists: boolean; catalog: string; httr2_installed: boolean };
  live_ready: boolean;
  universe: { currency: string; index: string; tenor: string; ticker: string }[];
  note: string;
}

export interface BloombergOis {
  mode: string;
  request_id: string;
  csv_file: string;
  rows: number;
  dates: string[];
  summary: { currency: string; index: string; tenor: string; rows: number }[];
  a1_input_files: string[];
}

// ---- QuantLet Server ----
export interface ServerInfo {
  name: string;
  status: string;
  app_version: string;
  engine: { name: string; version: string; library: string };
  runtime: { r_version: string; platform: string; pid: number; logical_processors: number };
  listen: { host: string; port: number; lan: boolean; serves_page: boolean };
  urls: { public_host: string | null; public_host_source: string; share: string | null; local: string; note: string };
  started_at: string;
  server_time: string;
  uptime_seconds: number;
  requests_served: number;
  probe: { calculation: string; repeats: number; seconds_each: number; check_value: number };
  routes: { method: string; path: string; page: string }[];
}

// ---- IRRBB 金利シナリオ ----
export interface IrrbbBond {
  bond_id: string;
  security_name: string;
  base_pv: number;
  shocked_pv: number;
  pv_change: number;
}
export interface IrrbbScenario {
  id: string;
  label: string;
  domestic: boolean;
  shocks_by_tenor: { tenor_years: number; shock_bp: number }[];
  curve: { years: number; base_zero_pct: number; shocked_zero_pct: number; shock_bp: number; floored: boolean }[];
  floored_points: number;
  bonds: IrrbbBond[];
  total: { base_pv: number; shocked_pv: number; pv_change: number; sum_of_bond_changes: number };
}
export interface IrrbbResult {
  title: string;
  valuation_date: string;
  base_curve: { name: string; source: string; base_date: string; quote_time: string; last_date: string };
  portfolio: { bond_id: string; security_name: string; issue_date: string; maturity_date: string; coupon_pct: number; coupon_frequency: number; face_amount: number; remaining_years: number; compound_yield_pct?: number; modified_duration?: number; convexity?: number }[];
  shock_sizes_bp: { parallel_bp: number; short_bp: number; long_bp: number };
  scenario_sets: Record<"domestic" | "international", { label: string; ids: string[] }>;
  scenarios: IrrbbScenario[];
  references: { id: string; title: string; publisher: string; published: string; effective: string | null; url: string; used_for: string }[];
  assumptions: Record<string, string>;
  engine: string;
}

// ---- 掲示板の反応・コメント ----
export interface FeedbackComment {
  id: string;
  parent_id: string | null;
  author: string;
  text: string;
  created_at: string;
}
export interface Feedback {
  report_id: string;
  likes: number;
  dislikes: number;
  my_reaction: "like" | "dislike" | null;
  comments: FeedbackComment[];
  comment_count: number;
}

// ---- 評価用 OIS ----
export interface OisDataset {
  id: string;
  kind: "demo" | "bloomberg";
  label: string;
  base_date: string;
  currencies: string[];
}
export interface AswOis {
  id: string;
  kind: string;
  label: string;
  base_date: string;
  note: string;
}
export interface OisCurve {
  currency: string;
  source: string;
  quote_time: string;
  status: string;
  message?: string;
  index?: string;
  last_date?: string;
  quotes?: { tenor: string; quote_pct: number; pillar_date: string; years: number; zero_pct: number; reproduction_error_bp: number }[];
  curve?: { years: number; zero_pct: number }[];
}
export interface OisCurves {
  id: string;
  kind: string;
  label: string;
  base_date: string;
  curves: OisCurve[];
  conventions: Record<string, string>;
}
export interface OisStatus {
  asw: AswOis;
  available: OisDataset[];
  bloomberg: { credentials_set: boolean; credentials_file_exists: boolean; catalog: string; httr2_installed: boolean };
  live_ready: boolean;
}
export interface OisRefresh {
  status: "success" | "failed";
  stage?: string;
  reason?: string;
  attempted?: string;
  base_date?: string;
  files?: string[];
  current: { asw: AswOis; available: OisDataset[] };
}

// ---- TRS のキャッシュフロー・スケジュール ----
export type SheetRow = Record<string, string | number | null>;
export interface TrsCashflows {
  file: string;
  base_name: string;
  name_confirmed: boolean;
  name_missing: Record<string, string>;
  sheets: { FundingLeg: SheetRow[]; ReturnLeg: SheetRow[] };
  checks: { レッグ: string; 照合: string; 契約: string; 計算: string; 一致: boolean }[];
  terms: { 項目ID: string; 項目: string; 原文の値: string; 変換後: string; 状態: string; 備考: string }[];
  evaluation_date: string;
  scenario_return_pct: number | null;
  engine: string;
}

// ---- 日米の国債金利 ----
export interface YieldSide {
  yield_pct: (number | null)[];
  obs_date: (string | null)[];
  note: string[];
  last_date: string | null;
}
export interface YieldMonth {
  month: string;
  US: YieldSide;
  JP: YieldSide;
}
export interface YieldsPayload {
  tenors: number[];
  countries: Record<"US" | "JP", { label: string; source: string }>;
  months: YieldMonth[];
  in_progress_month: string;
  latest_date: string;
  refreshed_at: string;
  conventions: Record<string, string>;
}

// ---- レポート掲示板 ----
export interface BoardRow {
  report_id: string;
  registered_at: string;
  file_name: string;
  state: string;
  issue_date: string | null;
  publisher: string | null;
  authors: string | null;
  headline: string | null;
  isin_links: number;
  issuer_links: number;
  pending_links: number;
  failure: { kind: string; message: string } | null;
  feedback: { likes: number; dislikes: number; comment_count: number };
}
export interface Evidence {
  group: string;
  label: string;
  status: string;
  value: string;
  page: number | null;
  quote: string;
  check: string;
  found_page: number | null;
}
export interface IssuerCandidate {
  issuer_id: string;
  issuer_name: string;
  match: "exact" | "partial";
  hint: string;
}
export interface IssuerMention {
  mention: string;
  page: number | null;
  status: "auto" | "pending" | "confirmed" | "rejected" | "no_match";
  issuer_id: string | null;
  issuer_name: string | null;
  basis: string;
  candidates: IssuerCandidate[];
  decided_by: string | null;
  decided_at: string | null;
}
export interface ReportDetail {
  report_id: string;
  manifest: {
    registered_at: string;
    original_file_name: string;
    reader: string;
    failure: { kind: string; message: string } | null;
    document?: { pages: number; sha256: string; kind: string };
    reader_log?: { seconds?: number; mode?: string };
  };
  summary: {
    headline: string;
    summary: string;
    report_type: string;
    publisher: { status: string; value: string };
    authors: { status: string; name: string; role?: string }[];
    issue_date: { status: string; value: string };
    rating_changes: Record<string, string>[];
  } | null;
  verification: { state: string; reasons: string[]; headline_chars: number; evidence: Evidence[] } | null;
  links: {
    isin_links: { level: string; isin: string; security_name: string; issuer_id: string; issuer_name: string; page: number; basis: string }[];
    unknown_isins: string[];
    issuer_mentions: IssuerMention[];
    master_note: string;
  } | null;
  offers: { workflow: string; run_id: string; ISIN: string; security_name: string; issuer_name: string; level: string; offer_price: number; pricing_status: string; native_asw_bp: number | null }[] | null;
  pages: { page: number; method: string; text: string }[] | null;
  seconds?: number;
}
export interface RelatedReport {
  report_id: string;
  issue_date: string | null;
  publisher: string | null;
  authors: string | null;
  headline: string | null;
  state: string;
  level: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`サーバーの応答を読めない（HTTP ${res.status}）。R の API（npm run api）が起動しているか確かめる`);
  }
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

const postJson = <T,>(path: string, body: unknown) =>
  call<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  health: () => call<{ status: string; quantlet: string; engine: string }>("/api/health"),
  server: () => call<ServerInfo>("/api/server"),
  irrbb: (floor: "none" | "zero") => call<IrrbbResult>(`/api/irrbb?floor=${floor}`),
  feedback: (id: string, client: string) => call<Feedback>(`/api/reports/${id}/feedback?client=${encodeURIComponent(client)}`),
  react: (id: string, client_id: string, reaction: "like" | "dislike" | null) => postJson<Feedback>(`/api/reports/${id}/reactions`, { client_id, reaction }),
  comment: (id: string, body: { text: string; author: string; parent_id: string | null; client_id: string }) => postJson<Feedback>(`/api/reports/${id}/comments`, body),
  oisDatasets: () => call<{ datasets: OisDataset[]; asw: AswOis }>("/api/ois/datasets"),
  oisCurves: (id: string) => call<OisCurves>(`/api/ois/curves?dataset=${encodeURIComponent(id)}`),
  oisStatus: () => call<OisStatus>("/api/market/ois/status"),
  refreshOis: () => postJson<OisRefresh>("/api/market/ois/refresh", {}),
  trsCashflows: (caseId: string, scenario_return_pct: number | null) =>
    postJson<TrsCashflows>(`/api/c1/cases/${caseId}/cashflows`, scenario_return_pct === null ? {} : { scenario_return_pct }),
  trsCashflowsUrl: (caseId: string) => `/api/c1/cases/${caseId}/cashflows.xlsx`,
  documentDownloadUrl: (caseId: string) => `/api/c1/cases/${caseId}/document?download=1`,
  a1Latest: () => call<{ runs: Partial<Record<Workflow, A1Result>> }>("/api/a1/latest"),
  yields: () => call<YieldsPayload>("/api/yields/monthly"),
  refreshYields: () => postJson<{ refreshed_at: string }>("/api/yields/refresh", {}),
  reports: () => call<{ reports: BoardRow[] }>("/api/reports"),
  report: (id: string) => call<ReportDetail>(`/api/reports/${id}`),
  registerReport: (body: { uploadId?: string; sample?: boolean; reader: "claude_code" | "saved" }) => postJson<ReportDetail>("/api/reports/register", body),
  decideLink: (id: string, mention_index: number, issuer_id: string | null) => postJson<ReportDetail>(`/api/reports/${id}/links`, { mention_index, issuer_id }),
  relatedReports: (isin: string) => call<{ reports: RelatedReport[] }>(`/api/reports/related?isin=${encodeURIComponent(isin)}`),
  reportDocumentUrl: (id: string) => `/api/reports/${id}/document`,
  upload: (kind: "a1" | "c1" | "reports", file: File) =>
    call<UploadResult>(`/api/uploads/${kind}?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    }),
  runA1: (workflow: Workflow, uploadId: string | null) => postJson<A1Result>("/api/a1/run", { workflow, uploadId }),
  runC1: (uploadId: string | null, reader: "saved" | "claude_code") => postJson<C1Result>("/api/c1/run", { uploadId, reader }),
  bloombergStatus: () => call<BloombergStatus>("/api/bloomberg/status"),
  bloombergOis: (start_date: string, end_date: string, marketdate: string) =>
    postJson<BloombergOis>("/api/bloomberg/ois", { start_date, end_date, marketdate, mode: "synthetic" }),
  excelUrl: (runId: string) => `/api/a1/runs/${runId}/excel`,
  documentUrl: (caseId: string) => `/api/c1/cases/${caseId}/document`,
  fpmlUrl: (caseId: string) => `/api/c1/cases/${caseId}/fpml`,
  aladdinUrl: (caseId: string) => `/api/c1/cases/${caseId}/aladdin`,
};

export const fmt = (x: number | null | undefined, digits = 4) =>
  x === null || x === undefined || Number.isNaN(x) ? "—" : x.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });

// 小数点以下3桁（4桁目を切り捨て）で表示する（複利利回り・デュレーション・コンベクシティ用）
export const fmtTrunc3 = (x: number | null | undefined) =>
  x === null || x === undefined || Number.isNaN(x) ? "—" : (Math.trunc(x * 1000) / 1000).toFixed(3);
