// ドメインの型と状態の初期値。副作用のない純粋な定義のみを置く。

export interface Question {
  title: string;
  hint: string;
  unit: number;
  unitLabel: string;
  /** 正解。お題ファイルに含めない運用なら null(発表時に司会が手入力する)。 */
  answer: number | null;
  /** 司会用メモ。投影には出さない。 */
  source?: string;
}

export interface Settings {
  /** グループ名の配列。長さがグループ数。 */
  groups: string[];
  /** 走者数 m(デフォルト8)。 */
  runnerCount: number;
  /** 得点係数 c(デフォルト20)。 */
  c: number;
  /** ピタリ賞の点数(デフォルト20)。 */
  pitariBonus: number;
  /** お題表示にタイマーを出すか。 */
  timerEnabled: boolean;
}

export interface Round {
  /** 使用するお題のインデックス(questions 配列への参照)。未選択なら null。 */
  questionIndex: number | null;
  /** 正解の手入力・訂正。お題ファイルの answer より優先する。 */
  answerOverride: number | null;
  /** ladders[グループ][走者] = 数字。未入力は null。 */
  ladders: (number | null)[][];
}

export type ProjectionScreen = "blank" | "question" | "reveal" | "ranking";

export interface ProjectionState {
  screen: ProjectionScreen;
  /** 公開・結果画面ではしごを表示済みか。 */
  laddersRevealed: boolean;
  /** 正解の横線を表示済みか。 */
  answerRevealed: boolean;
}

export interface TimerState {
  durationSec: number;
  /** 走行中なら終了予定時刻(ms)。停止・一時停止中は null。 */
  endsAt: number | null;
  /** 一時停止中の残り(ms)。 */
  pausedRemainingMs: number | null;
}

export interface AppState {
  version: number;
  settings: Settings;
  questions: Question[];
  rounds: Round[];
  currentRound: number;
  projection: ProjectionState;
  timer: TimerState;
}

export const STATE_VERSION = 1;

export function groupLetters(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    i < 26 ? String.fromCharCode(65 + i) : `G${i + 1}`,
  );
}

export function makeEmptyRound(groupCount: number, runnerCount: number): Round {
  return {
    questionIndex: null,
    answerOverride: null,
    ladders: Array.from({ length: groupCount }, () =>
      Array.from({ length: runnerCount }, () => null),
    ),
  };
}

/** グループ数・走者数の変更に合わせて、既存の入力を保ったまま ladders を作り直す。 */
export function resizeRound(round: Round, groupCount: number, runnerCount: number): void {
  round.ladders = Array.from({ length: groupCount }, (_, gi) =>
    Array.from({ length: runnerCount }, (_, ri) => round.ladders[gi]?.[ri] ?? null),
  );
}

/** そのラウンドで使う正解を解決する。手入力 > お題ファイル > なし の優先順。 */
export function roundAnswer(state: AppState, round: Round): number | null {
  if (round.answerOverride != null) return round.answerOverride;
  if (round.questionIndex == null) return null;
  return state.questions[round.questionIndex]?.answer ?? null;
}

export function roundQuestion(state: AppState, round: Round): Question | null {
  if (round.questionIndex == null) return null;
  return state.questions[round.questionIndex] ?? null;
}

export function createDefaultState(): AppState {
  const groups = groupLetters(4);
  const runnerCount = 8;
  return {
    version: STATE_VERSION,
    settings: { groups, runnerCount, c: 20, pitariBonus: 20, timerEnabled: true },
    questions: [],
    rounds: [makeEmptyRound(groups.length, runnerCount)],
    currentRound: 0,
    projection: { screen: "blank", laddersRevealed: false, answerRevealed: false },
    timer: { durationSec: 180, endsAt: null, pausedRemainingMs: null },
  };
}
