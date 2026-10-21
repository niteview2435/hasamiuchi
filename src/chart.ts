// 各チームが出した数字の対数目盛グラフを SVG 文字列で組み立てる。
// ライブラリは使わず手描きすることで、見た目を仕様どおりに保つ。

import { formatNumber, formatScore } from "./format";

export interface ChartGroup {
  name: string;
  /** 出した数字(昇順に並んでいる前提。入力順をそのまま使う)。 */
  values: number[];
  /** 正解が入った区間。挟んでいなければ null。 */
  band: { lower: number; upper: number } | null;
  ratio: number | null;
  /** 得点。未集計なら null。 */
  score: number | null;
  /** 正解を外した(0点)なら true。暗く表示する。 */
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
  /** 指定すると y 軸をこの値域に絞る(正解付近のズーム用)。範囲外の数字は描かない。 */
  focus?: { min: number; max: number } | null;
  /** 正解線の落下アニメーションを付けるか(初回公開のみ true。ズーム中は false)。 */
  answerDrop?: boolean;
}

const MARGIN = { top: 24, right: 24, bottom: 80, left: 92 };

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

  // y スケール(対数)。focus があればその値域に、無ければ全データから範囲を決める。
  const allValues = groups.flatMap((g) => g.values);
  if (answer != null) allValues.push(answer);
  const positive = allValues.filter((v) => v > 0);
  const dataMin = o.focus?.min ?? (positive.length ? Math.min(...positive) : 1);
  const dataMax = o.focus?.max ?? (positive.length ? Math.max(...positive) : 10);

  const logMin = Math.log10(dataMin);
  const logMax = Math.log10(dataMax);
  // focus を渡されたときはその値域をそのまま使う(ズームの倍率を精密に制御するため)。
  const pad = o.focus ? 0 : (logMax - logMin) * 0.08 || 0.3;
  const rangeMin = logMin - pad;
  const rangeMax = logMax + pad;

  const y = (v: number): number =>
    plotTop + ((rangeMax - Math.log10(v)) / (rangeMax - rangeMin)) * plotH;

  // グリッド線を引く範囲(表示値域)。数字の線や縦線は消さずにクリップで枠内に収める。
  const vMinView = 10 ** rangeMin;
  const vMaxView = 10 ** rangeMax;

  const n = Math.max(groups.length, 1);
  const colW = plotW / n;
  const colCenter = (i: number): number => plotLeft + colW * (i + 0.5);

  const parts: string[] = [];

  // 枠外にはみ出す線を「消さずに」切り取るためのクリップ領域(プロット矩形)。
  parts.push(
    `<defs><clipPath id="plot-clip"><rect x="${plotLeft}" y="${plotTop}" width="${plotW}" height="${plotH}" /></clipPath></defs>`,
  );

  // 背景の対数グリッド
  for (const tick of niceLogTicks(vMinView, vMaxView)) {
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

    // 帯・縦線・数字の線は本来の位置に描き、枠外はクリップで切る(消さない・端で途切れない)。
    parts.push(`<g clip-path="url(#plot-clip)">`);

    // 区間のハイライト(正解を挟んだところ)
    if (showAnswer && g.band) {
      const yTop = y(g.band.upper);
      const yBottom = y(g.band.lower);
      parts.push(
        `<rect class="band" x="${cx - colW * 0.38}" y="${yTop}" width="${colW * 0.76}" height="${Math.max(0, yBottom - yTop)}" />`,
      );
    }

    if (showLadders && g.values.length > 0) {
      // 縦線は本来の上端・下端まで引く(枠外はクリップ)。
      const top = y(Math.max(...g.values));
      const bottom = y(Math.min(...g.values));
      parts.push(`<line class="rail" x1="${cx}" y1="${top}" x2="${cx}" y2="${bottom}" />`);
      // 各数字。ラベルが重なる場合(値が近いとき)は数字を間引いて読めるようにする。
      const LABEL_GAP = 20;
      let lastLabelY = Number.POSITIVE_INFINITY;
      for (const v of g.values) {
        const vy = y(v);
        const isExact = showAnswer && g.exactValue === v;
        const rungClass = `rung${isExact ? " is-exact" : ""}`;
        parts.push(
          `<line class="${rungClass}" x1="${cx - colW * 0.26}" y1="${vy}" x2="${cx + colW * 0.26}" y2="${vy}" />`,
        );
        // 値は昇順 = vy は上へ(小さく)動く。間隔が空いた数字と一致した数字だけラベルを出す。
        if (isExact || lastLabelY - vy >= LABEL_GAP) {
          parts.push(
            `<text class="rung-label" x="${cx + colW * 0.3}" y="${vy + 4}">${formatNumber(v)}</text>`,
          );
          lastLabelY = vy;
        }
      }
    }

    parts.push(`</g>`); // クリップ領域ここまで

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
    const dropClass = o.answerDrop ? " drop" : "";
    parts.push(
      `<g class="answer-line${dropClass}">`,
      `<line x1="${plotLeft}" y1="${ay}" x2="${plotLeft + plotW}" y2="${ay}" />`,
      `</g>`,
    );
  }

  return `<svg class="ladder-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="各グループが出した数字">${parts.join("")}</svg>`;
}
