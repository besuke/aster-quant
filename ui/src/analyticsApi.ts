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

export const analyticsApi = {
  bond: (body: Partial<BondRequest>) => postJson<BondResponse>("/api/analytics/bond", body),
  zeroCurves: (body: { evaluationDate?: string; nodes?: ZeroNode[]; shiftBp?: number }) => postJson<ZeroCurvesResponse>("/api/analytics/zero-curves", body),
  tonaOis: (body: Partial<TonaRequest>) => postJson<TonaResponse>("/api/analytics/tona-ois", body),
  cds: (body: Partial<CdsRequest>) => postJson<CdsResponse>("/api/analytics/cds", body),
};
