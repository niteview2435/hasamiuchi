// ラウンド結果と累計の集計。得点の計算そのものは scoring.ts に委ねる。

import { computeTeamScore, type TeamScore } from "./scoring";
import type { AppState, Round } from "./types";
import { roundAnswer, roundQuestion } from "./types";

export interface GroupResult {
  name: string;
  /** 入力されたはしごの値(null を除いた入力順)。 */
  values: number[];
  /** 正解とはしごが揃っていなければ null。 */
  score: TeamScore | null;
  /** ピタリ賞の加点。 */
  bonus: number;
  /** チーム得点 + ボーナスの合計。 */
  total: number;
}

export function computeRoundResults(state: AppState, round: Round): GroupResult[] {
  const answer = roundAnswer(state, round);
  const config = {
    c: state.settings.c,
    pitariBonus: state.settings.pitariBonus,
    unit: roundQuestion(state, round)?.unit ?? 1,
  };

  return state.settings.groups.map((name, gi) => {
    const values = (round.ladders[gi] ?? []).filter((v): v is number => v != null);
    if (answer == null || values.length === 0) {
      return { name, values, score: null, bonus: 0, total: 0 };
    }
    const score = computeTeamScore(values, answer, config);
    const bonus = score.pitari ? config.pitariBonus : 0;
    return { name, values, score, bonus, total: score.score + bonus };
  });
}

/** 全ラウンドを合計したグループごとの累計得点。 */
export function cumulativeTotals(state: AppState): number[] {
  const totals = state.settings.groups.map(() => 0);
  for (const round of state.rounds) {
    computeRoundResults(state, round).forEach((result, gi) => {
      totals[gi] = (totals[gi] ?? 0) + result.total;
    });
  }
  return totals;
}
