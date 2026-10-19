// 得点計算ロジック(仕様 1.5 / 1.6)。
// UI から切り離した純粋関数として実装し、テスト可能にする(仕様 2.4)。

export interface ScoringConfig {
  /** 狭めることへのご褒美の強さ。デフォルト 20(仕様 1.5)。 */
  c: number;
  /** ピタリ賞の点数。デフォルト 20(仕様 1.6)。 */
  pitariBonus: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  c: 20,
  pitariBonus: 20,
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
  const outside: TeamScore = {
    placement: { kind: "below" },
    ratio: null,
    score: 0,
    pitari: false,
    declaredBand: 0,
    mvpPair: null,
  };

  if (m === 0) return outside;

  const first = ladder[0]!;
  const last = ladder[m - 1]!;

  // 1. はしごの外:0点
  if (answer < first) return outside;
  if (answer > last) return { ...outside, placement: { kind: "above" }, declaredBand: m };

  // 2. 一致:r = 1 → 満点、ピタリ賞対象
  const exactIndex = ladder.indexOf(answer);
  if (exactIndex !== -1) {
    return {
      placement: { kind: "exact", index: exactIndex },
      ratio: 1,
      score: round1(config.c <= 0 ? 30 : 30), // log2(1) = 0 なので係数に依らず 30
      pitari: true,
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
    pitari: false,
    declaredBand: k + 1,
    mvpPair: [k, k + 1],
  };
}
