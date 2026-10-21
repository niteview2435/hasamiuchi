// ラウンド結果と累計の集計。得点の計算そのものは scoring.ts に委ねる。

import { computeTeamScore, type TeamScore } from "./scoring";
import type { AppState, Round } from "./types";
import { roundAnswer, roundQuestion } from "./types";

export interface GroupResult {
  name: string;
  /** 入力された数字(null を除いた入力順)。 */
  values: number[];
  /** 正解と数字が揃っていなければ null。 */
  score: TeamScore | null;
  /** ピタリ賞の加点。 */
  bonus: number;
  /** チーム得点 + ボーナスの合計。 */
  total: number;
}

export function computeRoundResults(state: AppState, round: Round): GroupResult[] {
  const answer = roundAnswer(state, round);
  const unit = roundQuestion(state, round)?.unit ?? 1;
  // 人数ハンデ:得点ペナルティを (その人数-1)/(最大人数-1) 倍する。
  // 全チーム同数なら係数は 1 で無影響。
  const counts = state.settings.runnerCounts;
  const maxM = Math.max(1, ...counts);

  return state.settings.groups.map((name, gi) => {
    const values = (round.ladders[gi] ?? []).filter((v): v is number => v != null);
    if (answer == null || values.length === 0) {
      return { name, values, score: null, bonus: 0, total: 0 };
    }
    const m = counts[gi] ?? maxM;
    const penaltyScale =
      state.settings.handicap && maxM > 1 ? (m - 1) / (maxM - 1) : 1;
    const config = {
      c: state.settings.c,
      pitariBonus: state.settings.pitariBonus,
      unit,
      penaltyScale,
    };
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
