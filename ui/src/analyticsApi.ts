import { postJson } from "./api";

// 債券キャッシュフロー・イールドカーブ・TONA OIS・クレジット（CDS）の API（server/R/analytics/）。数値はすべてサーバーの
// RiemannFinMath の計算結果で、画面は表示するだけ。金利は小数（0.0124 = 1.24%）、名前が *Pct・*_pct のものは %。

export interface BondRequest {
  tradeDate: string;
  issueDate: string;
  maturityDate: string;
  couponPct: number;
  simpleYieldPct: number;
  zSpreadBp: number;
}
export interface BondResponse {
  inputs: BondRequest;
  conventions: { bond: string; yen: string; engine: string };
  settlement_date: string;
  remaining_years: number;
  clean_price: number;
  compound_yield_pct: number;
  accrued: number;
  dirty_price: number;
  flat_dirty_price: number;
  z_spread_npv: number;
  z_spread_back_bp: number;
  risk: { price: number; dirty_price: number; dp_dy_pct: number; d2p_dy2_pct: number; bpv_yen: number; bpv_sen: number; modified_duration: number; convexity: number };
  cashflows: { payment_date: string; amount: number; kind: string; accrual_start: string | null; accrual_end: string | null; received: boolean }[];
  price_yield: { yield_pct: number; price: number; duration_approx: number; convexity_approx: number }[];
}

export interface ZeroNode { tenor: string; date?: string; ratePct: number }
export interface ZeroCurvePoint { date: string; time: number; discount: number; zero_continuous: number | null; forward_step: number | null }
export interface ZeroCurveBlock { table: { tenor: string; date: string; discount: number; zero_continuous: number | null }[]; points: ZeroCurvePoint[] }
export interface ZeroCurvesResponse {
  evaluation_date: string;
  shift_bp: number;
  conventions: Record<"day_count" | "curve" | "shift" | "engine", string>;
  nodes: { tenor: string; date: string; time: number; zero_rate: number }[];
  curve: ZeroCurveBlock;
  shifted_curve: ZeroCurveBlock;
}

export interface TonaRequest { datasetId?: string; bumpTenor: string; bumpBp: number; swapTenor: string; notional: number }
export interface TonaCase {
  instruments: { tenor: string; rate: number; pillar_date: string; implied_rate: number; reproduction_error: number }[];
  nodes: { date: string; time: number; discount: number; zero_continuous: number | null }[];
  curve_points: { date: string; time: number; discount: number; zero_continuous: number | null; forward_1d_simple: number }[];
  swap: {
    npv: number; fixed_leg_npv: number; overnight_leg_npv: number; fixed_leg_bps: number; par_rate: number;
    cashflows: { leg: string; accrual_start: string; accrual_end: string; payment_date: string; amount: number; discount: number }[];
  };
}
export interface TonaResponse {
  dataset: { id: string; label: string; base_date: string; source: string };
  evaluation_date: string;
  request: TonaRequest;
  conventions: { curve: string; forward: string; engine: string };
  quotes: { tenor: string; rate_base: number; rate_scenario: number }[];
  swap_terms: { tenor: string; side: string; notional: number; fixed_rate: number; effective_date: string; termination_date: string };
  cases: { base: TonaCase; scenario: TonaCase };
  pv_change: number;
  par_change_bp: number;
}

export interface CdsRequest {
  tradeDate: string;
  tenor: string;
  spreadBp: number;
  couponBp: number;
  recoveryPct: number;
  ratePct: number;
  notional: number;
  engine: "isda" | "midpoint";
}
export interface CdsResponse {
  inputs: CdsRequest;
  conventions: { contract: string; curves: string; engine: string };
  maturity_date: string;
  years: number;
  hazard: number;
  hazard_approx: number;
  survival_at_maturity: number;
  discount_at_maturity: number;
  value: { npv: number; coupon_leg_npv: number; default_leg_npv: number; upfront_npv: number; accrual_rebate_npv: number; fair_spread: number; fair_upfront: number };
  upfront_amount: number;
  cashflows: { payment_date: string; accrual_start: string; accrual_days: number; coupon_amount: number; discount_factor: number; survival_probability: number; default_probability: number }[];
  probability_curve: { date: string; time: number; survival_probability: number; default_probability: number }[];
  upfront_by_spread: { spread_bp: number; hazard: number; fair_upfront: number; upfront_amount: number }[];
}

export interface FuturesRow {
  issue: number; coupon_pct: number; maturity_date: string; conversion_factor: number; price: number; yield: number; duration: number; dv01: number;
  accrued_start: number; accrued_end: number; coupon_income: number; futures_invoice: number; gross_basis: number; funding_cost: number; carry: number;
  net_basis: number; implied_repo: number; ctd: boolean;
}
export interface FuturesRequest { mode: "current" | "flat"; yieldPct?: number; fundingPct?: number }
export interface FuturesResponse {
  mode: "current" | "flat";
  valuation_date: string;
  delivery_date: string;
  flat_yield: number | null;
  inputs_note: string;
  current_curve: { tenor_years: number; yield_pct: number }[];
  stress_curve: { tenor_years: number; yield_pct: number }[];
  conventions: Record<string, string>;
  rows: FuturesRow[];
  futures_price: number;
  funding_rate: number;
  ctd_issue: number;
  futures_bpv: number;
  ctd_dv01: number;
  ctd_conversion_factor: number;
  ctd_by_level: { yield_pct: number; ctd_issue: number; ctd_duration: number; futures_price: number; futures_bpv: number }[];
}

export interface EarlyRedemptionRequest {
  bond: { ratePct: number; aPct: number; sigmaPct: number; couponPct: number; firstCallYear: number; callPrice: number };
  mbs: { psaPct: number; incentive: number; refiCostPct: number };
}
export interface EarlyRedemptionResponse {
  inputs: EarlyRedemptionRequest;
  conventions: { bond: string; mbs: string; engine: string };
  bond: {
    flows: { time: number; coupon: number; principal: number; call_price: number | null }[];
    bullet: number; callable: number; issuer_call_value: number;
    by_volatility: { volatility: number; callable: number; bullet: number; issuer_call_value: number }[];
  };
  mbs: {
    pool: { balance: number; mortgage_rate: number; pass_through_rate: number; months: number };
    scenarios: { scenario: string; weighted_average_life: number; price_fixed_discount: number; price_path_discount: number; total_principal: number }[];
    cpr: { month: number; falling: number; flat: number; rising: number }[];
    flat_cashflows: { month: number; interest: number; scheduled_principal: number; prepaid_principal: number; end_balance: number }[];
  };
}

export const analyticsApi = {
  bond: (body: Partial<BondRequest>) => postJson<BondResponse>("/api/analytics/bond", body),
  zeroCurves: (body: { evaluationDate?: string; nodes?: ZeroNode[]; shiftBp?: number }) => postJson<ZeroCurvesResponse>("/api/analytics/zero-curves", body),
  tonaOis: (body: Partial<TonaRequest>) => postJson<TonaResponse>("/api/analytics/tona-ois", body),
  cds: (body: Partial<CdsRequest>) => postJson<CdsResponse>("/api/analytics/cds", body),
  earlyRedemption: (body: EarlyRedemptionRequest) => postJson<EarlyRedemptionResponse>("/api/analytics/early-redemption", body),
  futures: (body: FuturesRequest) => postJson<FuturesResponse>("/api/analytics/futures", body),
};
