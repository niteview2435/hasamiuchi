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
}

export const DEFAULT_SCORING: ScoringConfig = {
  c: 20,
  pitariBonus: 20,
  unit: 1,
};

/** 正解がはしごのどこに入ったか。 */
export type Placement =
  | { kind: "below" } // a < x_1(はしごの外・下)
  | { kind: "above" } // a > x_m(はしごの外・上)
  | { kind: "exact"; index: number } // 誰かの数字が a と一致(0-based)
  | { kind: "band"; lower: number; upper: number }; // x_k < a < x_{k+1}(0-based の k)

export interface TeamScore {
  placement: Placement;
  /** 挟んだ段の比 r。はしごの外は null、一致・正常時は 1 以上。 */
  ratio: number | null;
  /** 四捨五入後のチーム得点。 */
  score: number;
  /** ピタリ賞の対象か。 */
  pitari: boolean;
  /** ピタリ賞になった値(正解を単位に丸めた値)。対象外なら null。 */
  pitariValue: number | null;
  /**
   * 段の番号(仕様 1.7 の宣言ルール用):
   * 第1走者より下 = 0、[x_k, x_{k+1}] = k(1-based)、アンカーより上 = m。
   */
  declaredBand: number;
  /** MVP 候補(正解を挟んだ2人の 0-based インデックス)。はしごの外は null。 */
  mvpPair: [number, number] | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 1チームのはしごと正解から得点を計算する。
 * @param ladder 走者が出した数字の列。昇順(x_1 < ... < x_m)を前提とする。
 * @param answer 正解 a。
 */
export function computeTeamScore(
  ladder: readonly number[],
  answer: number,
  config: ScoringConfig = DEFAULT_SCORING,
): TeamScore {
  const m = ladder.length;

  // ピタリ賞:正解を回答単位に丸めた値に一致した走者がいれば成立(段の位置とは独立)。
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

  // 1. はしごの外:0点
  if (answer < first) return outside({ kind: "below" }, 0);
  if (answer > last) return outside({ kind: "above" }, m);

  // 2. 正解がちょうど走者の数字と一致:r = 1 → 満点
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

  // 3. x_k < a < x_{k+1} の段を探す(0-based の k)
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

  // 4. S = max(0, 30 - c * log2(r))
  const score = round1(Math.max(0, 30 - config.c * Math.log2(ratio)));

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
