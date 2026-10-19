// はしごの対数目盛グラフを SVG 文字列で組み立てる。
// ライブラリは使わず手描きすることで、見た目を仕様どおりに保つ。

import { formatNumber, formatScore } from "./format";

export interface ChartGroup {
  name: string;
  /** はしごの値(昇順に並んでいる前提。入力順をそのまま使う)。 */
  values: number[];
  /** 正解が入った段。挟んでいなければ null。 */
  band: { lower: number; upper: number } | null;
  ratio: number | null;
  /** 得点。未集計なら null。 */
  score: number | null;
  /** はしごの外(0点)なら true。暗く表示する。 */
  outside: boolean;
  /** 正解と一致した値。無ければ null。 */
  exactValue: number | null;
}

export interface ChartOptions {
  groups: ChartGroup[];
  answer: number | null;
  showLadders: boolean;
  showAnswer: boolean;
  width: number;
  height: number;
}

const MARGIN = { top: 48, right: 24, bottom: 96, left: 92 };

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/** 対数目盛の「きりの良い」目盛値を返す(1,2,5 × 10^k)。 */
function niceLogTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const startExp = Math.floor(Math.log10(min));
  const endExp = Math.ceil(Math.log10(max));
  for (let exp = startExp; exp <= endExp; exp++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** exp;
      if (v >= min && v <= max) ticks.push(v);
    }
  }
  return ticks;
}

export function buildLadderChart(o: ChartOptions): string {
  const { groups, answer, showLadders, showAnswer, width, height } = o;

  const plotLeft = MARGIN.left;
  const plotTop = MARGIN.top;
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;

  // y スケール(対数)。全グループの値と正解から範囲を決める。
  const allValues = groups.flatMap((g) => g.values);
  if (answer != null) allValues.push(answer);
  const positive = allValues.filter((v) => v > 0);
  const dataMin = positive.length ? Math.min(...positive) : 1;
  const dataMax = positive.length ? Math.max(...positive) : 10;

  const logMin = Math.log10(dataMin);
  const logMax = Math.log10(dataMax);
  const pad = (logMax - logMin) * 0.1 || 0.3;
  const rangeMin = logMin - pad;
  const rangeMax = logMax + pad;

  const y = (v: number): number =>
    plotTop + ((rangeMax - Math.log10(v)) / (rangeMax - rangeMin)) * plotH;

  const n = Math.max(groups.length, 1);
  const colW = plotW / n;
  const colCenter = (i: number): number => plotLeft + colW * (i + 0.5);

  const parts: string[] = [];

  // 背景の対数グリッド
  for (const tick of niceLogTicks(dataMin, dataMax)) {
    const ty = y(tick);
    parts.push(
      `<line class="grid" x1="${plotLeft}" y1="${ty}" x2="${plotLeft + plotW}" y2="${ty}" />`,
      `<text class="grid-label" x="${plotLeft - 12}" y="${ty + 5}" text-anchor="end">${formatNumber(tick)}</text>`,
    );
  }

  // 各グループの列
  groups.forEach((g, gi) => {
    const cx = colCenter(gi);
    const dim = g.outside && showAnswer;
    const groupClass = `ladder-group${dim ? " is-dim" : ""}`;
    parts.push(`<g class="${groupClass}">`);

    // 段のハイライト(正解を挟んだ区間)
    if (showAnswer && g.band) {
      const yTop = y(g.band.upper);
      const yBottom = y(g.band.lower);
      parts.push(
        `<rect class="band" x="${cx - colW * 0.38}" y="${yTop}" width="${colW * 0.76}" height="${yBottom - yTop}" />`,
      );
    }

    if (showLadders && g.values.length > 0) {
      const top = y(Math.max(...g.values));
      const bottom = y(Math.min(...g.values));
      // はしごの縦レール
      parts.push(`<line class="rail" x1="${cx}" y1="${top}" x2="${cx}" y2="${bottom}" />`);
      // 各段。ラベルが重なる場合(値が近い段)は数字を間引いて読めるようにする。
      const LABEL_GAP = 20;
      let lastLabelY = Number.POSITIVE_INFINITY;
      for (const v of g.values) {
        const vy = y(v);
        const isExact = showAnswer && g.exactValue === v;
        const rungClass = `rung${isExact ? " is-exact" : ""}`;
        parts.push(
          `<line class="${rungClass}" x1="${cx - colW * 0.26}" y1="${vy}" x2="${cx + colW * 0.26}" y2="${vy}" />`,
        );
        // 値は昇順 = vy は上へ(小さく)動く。間隔が空いた段と一致段だけラベルを出す。
        if (isExact || lastLabelY - vy >= LABEL_GAP) {
          parts.push(
            `<text class="rung-label" x="${cx + colW * 0.3}" y="${vy + 4}">${formatNumber(v)}</text>`,
          );
          lastLabelY = vy;
        }
      }
    }

    // 得点のラベル(正解表示後)。比は出さず得点だけ。
    if (showAnswer && g.score != null) {
      const cls = g.outside ? "score-label is-zero" : "score-label";
      parts.push(
        `<text class="${cls}" x="${cx}" y="${plotTop + plotH + 48}" text-anchor="middle">${formatScore(g.score)}点</text>`,
      );
    }

    // グループ名
    parts.push(
      `<text class="group-name" x="${cx}" y="${plotTop + plotH + 22}" text-anchor="middle">${esc(g.name)}</text>`,
    );
    parts.push("</g>");
  });

  // 正解の横線(ドロップ・アニメーションは CSS 側で付ける)
  if (showAnswer && answer != null) {
    // 横線だけ引く。正解の数値はスライド下部に赤文字で別途出す(重なり回避)。
    const ay = y(answer);
    parts.push(
      `<g class="answer-line">`,
      `<line x1="${plotLeft}" y1="${ay}" x2="${plotLeft + plotW}" y2="${ay}" />`,
      `</g>`,
    );
  }

  return `<svg class="ladder-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="各グループのはしご">${parts.join("")}</svg>`;
}
