// 得点計算ロジック(仕様 1.5 / 1.6)。
// UI から切り離した純粋関数として実装し、テスト可能にする(仕様 2.4)。

export interface ScoringConfig {
  /** 狭めることへのご褒美の強さ。デフォルト 20(仕様 1.5)。 */
  c: number;
  /** ピタリ賞の点数。デフォルト 20(仕様 1.6)。 */
  pitariBonus: number;
  /**
   * 回答単位。ピタリ賞は「正解をこの単位に丸めた値」への一致で成立する。
   * これにより真の正解が単位の倍数でなくても必ず狙える的になる。
   * unit = 1 なら「正解との完全一致」と同じ挙動。
   */
  unit: number;
  /**
   * 得点ペナルティに掛ける係数(人数ハンデ用)。デフォルト 1。
   * 例:(その人数-1)/(最大人数-1) を渡すと、人数が少ないチームの
   * ペナルティが緩み、人数差の有利不利を打ち消す。全チーム同数なら 1 で無補正。
   */
  penaltyScale?: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  c: 20,
  pitariBonus: 20,
  unit: 1,
  penaltyScale: 1,
};

/** 正解が数字のどこに入ったか。 */
export type Placement =
  | { kind: "below" } // a < x_1(全部より下に外れ)
  | { kind: "above" } // a > x_m(全部より上に外れ)
  | { kind: "exact"; index: number } // 誰かの数字が a と一致(0-based)
  | { kind: "band"; lower: number; upper: number }; // x_k < a < x_{k+1}(0-based の k)

export interface TeamScore {
  placement: Placement;
  /** 挟んだ2つの数字の比 r。外したら null、一致・正常時は 1 以上。 */
  ratio: number | null;
  /** 四捨五入後のチーム得点。 */
  score: number;
  /** ピタリ賞の対象か。 */
  pitari: boolean;
  /** ピタリ賞になった値(正解を単位に丸めた値)。対象外なら null。 */
  pitariValue: number | null;
  /**
   * 区間の番号(仕様 1.7 の宣言ルール用):
   * 1人目より下 = 0、[x_k, x_{k+1}] = k(1-based)、最後の人より上 = m。
   */
  declaredBand: number;
  /** MVP 候補(正解を挟んだ2人の 0-based インデックス)。外したら null。 */
  mvpPair: [number, number] | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 正解を挟めたチームの最低点。広すぎても2つの数字の間に入れていれば 0 ではなく
 * この点を保証する(外した 0 点とはっきり差をつけ、挟む価値を残すため)。
 */
export const BAND_FLOOR = 1;

/**
 * 1チームの数字と正解から得点を計算する。
 * @param ladder 出した数字の列。昇順(x_1 < ... < x_m)を前提とする。
 * @param answer 正解 a。
 */
export function computeTeamScore(
  ladder: readonly number[],
  answer: number,
  config: ScoringConfig = DEFAULT_SCORING,
): TeamScore {
  const m = ladder.length;

  // ピタリ賞:正解を回答単位に丸めた値に一致した人がいれば成立(位置とは独立)。
  const unit = config.unit > 0 ? config.unit : 1;
  const pitariTarget = Math.round(answer / unit) * unit;
  const pitariValue = ladder.includes(pitariTarget) ? pitariTarget : null;
  const pitari = pitariValue !== null;

  const outside = (placement: Placement, declaredBand: number): TeamScore => ({
    placement,
    ratio: null,
    score: 0,
    pitari,
    pitariValue,
    declaredBand,
    mvpPair: null,
  });

  if (m === 0) return outside({ kind: "below" }, 0);

  const first = ladder[0]!;
  const last = ladder[m - 1]!;

  // 1. 外れ(全部より下/上):0点
  if (answer < first) return outside({ kind: "below" }, 0);
  if (answer > last) return outside({ kind: "above" }, m);

  // 2. 正解がちょうど出した数字と一致:r = 1 → 満点
  const exactIndex = ladder.indexOf(answer);
  if (exactIndex !== -1) {
    return {
      placement: { kind: "exact", index: exactIndex },
      ratio: 1,
      score: round1(30), // log2(1) = 0 なので係数に依らず 30
      pitari,
      pitariValue,
      declaredBand: exactIndex + 1,
      mvpPair: null,
    };
  }

  // 3. x_k < a < x_{k+1} の区間を探す(0-based の k)
  let k = -1;
  for (let i = 0; i < m - 1; i++) {
    if (ladder[i]! < answer && answer < ladder[i + 1]!) {
      k = i;
      break;
    }
  }
  // ここに来る時点で first < answer < last かつ一致なしなので必ず見つかる
  const lower = ladder[k]!;
  const upper = ladder[k + 1]!;
  const ratio = upper / lower;

  // 4. S = max(BAND_FLOOR, 30 - c * penaltyScale * log2(r))
  //    挟めていれば最低 BAND_FLOOR 点を保証する(外れの 0 点と差をつける)。
  const scale = config.penaltyScale ?? 1;
  const score = round1(Math.max(BAND_FLOOR, 30 - config.c * scale * Math.log2(ratio)));

  return {
    placement: { kind: "band", lower, upper },
    ratio,
    score,
    pitari,
    pitariValue,
    declaredBand: k + 1,
    mvpPair: [k, k + 1],
  };
}
