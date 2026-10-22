// 表紙・ルール説明スライドの描画。
// 中身(文字・座標・スライド)はすべて slides.config.ts にあり、ここはそれを
// 1 枚のキャンバス(SVG)に描くだけ。見た目を変えるときは config を編集する。

import katex from "katex";
import { formatNumber } from "./format";
import {
  AUTO_ADVANCE,
  CANVAS,
  COVER,
  DEFAULT_BODY,
  DEFAULT_QUESTION,
  DEFAULT_TITLE,
  EXAMPLE,
  KICKER,
  LADDER,
  QUESTION,
  SLIDES,
  type El,
  type NumbersSpec,
  type Slide,
  type Txt,
} from "./slides.config";

// 司会コンソール(説明タブ)が参照する。
export const HOWTO_STEP_COUNT = SLIDES.length;
export const HOWTO_STEP_TITLES = SLIDES.map((s) => s.name);

/**
 * ページ = 「見た目上の 1 枚」。group が同じ連続スライドを 1 ページにまとめる。
 * 進行(howtoStep)は 1 スライド単位のままで、ドット・一覧・カウンタだけがページ単位。
 */
interface Page {
  name: string;
  from: number; // 最初のスライド index
  to: number; // 最後のスライド index
  key: string | null; // group 値(なければ null = 単独ページ)
}

const PAGES: Page[] = [];
SLIDES.forEach((s, i) => {
  const last = PAGES[PAGES.length - 1];
  if (s.group != null && last && last.key === s.group) {
    last.to = i;
  } else {
    PAGES.push({ name: s.group ?? s.name, from: i, to: i, key: s.group ?? null });
  }
});

export const HOWTO_PAGE_COUNT = PAGES.length;
export const HOWTO_PAGE_TITLES = PAGES.map((p) => p.name);

/** スライド index(howtoStep)が何ページ目に属するか。 */
export function howtoPageOf(step: number): number {
  const i = PAGES.findIndex((p) => step >= p.from && step <= p.to);
  return i < 0 ? 0 : i;
}

/** ページ index から、そのページ先頭のスライド index(ジャンプ先)。 */
export function howtoPageStart(page: number): number {
  return PAGES[Math.max(0, Math.min(PAGES.length - 1, page))]?.from ?? 0;
}

/**
 * 自動送りの範囲。「1人目」(show===1)から「最後の人」(show===人数)まで、
 * AUTO_ADVANCE.sec 秒ごとに進める。司会コンソールが参照する。
 */
export const HOWTO_AUTO = {
  sec: AUTO_ADVANCE.sec,
  from: SLIDES.findIndex((s) => s.numbers?.show === 1),
  to: SLIDES.findIndex((s) => s.numbers?.show === EXAMPLE.people.length),
};

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/** 人のシルエット。cx=中心、topY=頭の上端、h=全体の高さ。 */
function personIcon(cx: number, topY: number, h: number, active: boolean): string {
  const headR = h * 0.2;
  const headCy = topY + headR;
  const bodyTop = headCy + headR * 1.05;
  const bodyBottom = topY + h;
  const halfW = h * 0.3;
  const body =
    `M ${cx - halfW} ${bodyBottom} ` +
    `L ${cx - halfW} ${bodyTop + h * 0.14} ` +
    `Q ${cx - halfW} ${bodyTop} ${cx - halfW * 0.42} ${bodyTop} ` +
    `L ${cx + halfW * 0.42} ${bodyTop} ` +
    `Q ${cx + halfW} ${bodyTop} ${cx + halfW} ${bodyTop + h * 0.14} ` +
    `L ${cx + halfW} ${bodyBottom} Z`;
  const cls = `howto-person${active ? " is-active" : ""}`;
  return `<g class="${cls}"><circle cx="${cx}" cy="${headCy.toFixed(1)}" r="${headR.toFixed(1)}" /><path d="${body}" /></g>`;
}

function text(t: Txt): string {
  const anchor = t.align ?? "start";
  const color = t.color ?? "ink";
  const weight = t.weight ?? 700;
  const mono = t.mono ? " howto-mono" : "";
  return `<text class="howto-c-${color}${mono}" x="${t.x}" y="${t.y}" font-size="${t.size}" font-weight="${weight}" text-anchor="${anchor}">${esc(t.text)}</text>`;
}

function element(el: El): string {
  switch (el.kind) {
    case "text":
      return text(el);
    case "person":
      return personIcon(el.x, el.y, el.size, el.active ?? false);
    case "hline":
      return `<line class="howto-hl howto-hl-${el.style ?? "number"}" x1="${el.x1}" y1="${el.y}" x2="${el.x2}" y2="${el.y}" />`;
    case "vline":
      return `<line class="howto-vl" x1="${el.x}" y1="${el.y1}" x2="${el.x}" y2="${el.y2}" />`;
    case "rect": {
      const fill = el.fill ?? "none";
      const stroke = el.stroke ? " is-stroke" : "";
      return `<rect class="howto-rect howto-rect-${fill}${stroke}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" />`;
    }
    case "badge":
      return (
        `<g class="howto-badge"><rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="6" />` +
        `<text x="${el.x + el.w / 2}" y="${el.y + el.h * 0.64}" font-size="${el.size}" text-anchor="middle">${esc(el.text)}</text></g>`
      );
    case "math":
      return mathEl(el);
    case "rich":
      return richEl(el);
  }
}

const MATH_COLOR: Record<string, string> = {
  ink: "var(--ink)",
  accent: "var(--accent)",
  muted: "var(--muted)",
  paper: "var(--paper)",
};

/** LaTeX 数式を KaTeX で組み、SVG 内に foreignObject として置く。 */
function mathEl(el: { x: number; y: number; size: number; tex: string; color?: string }): string {
  const html = katex.renderToString(el.tex, { throwOnError: false, displayMode: false, output: "html" });
  const color = MATH_COLOR[el.color ?? "ink"] ?? "var(--ink)";
  const w = CANVAS.w - el.x; // 右端まで使える(はみ出しは overflow:visible で見せる)
  const h = el.size * 2.6;
  return (
    `<foreignObject x="${el.x}" y="${el.y}" width="${w}" height="${h}" class="howto-fo">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" class="howto-math" style="font-size:${el.size}px;color:${color}">${html}</div>` +
    `</foreignObject>`
  );
}

/** 日本語テキスト＋インライン数式($...$)の一行を foreignObject で描く。 */
function richEl(el: {
  x: number;
  y: number;
  size: number;
  md: string;
  color?: string;
  weight?: number;
}): string {
  // $...$ で分割(偶数番=地の文、奇数番=数式)。
  const html = el.md
    .split(/\$([^$]+)\$/)
    .map((seg, i) =>
      i % 2 === 1
        ? katex.renderToString(seg, { throwOnError: false, displayMode: false, output: "html" })
        : esc(seg),
    )
    .join("");
  const color = MATH_COLOR[el.color ?? "ink"] ?? "var(--ink)";
  const w = CANVAS.w - el.x;
  const h = el.size * 2.4;
  return (
    `<foreignObject x="${el.x}" y="${el.y}" width="${w}" height="${h}" class="howto-fo">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" class="howto-rich" style="font-size:${el.size}px;color:${color};font-weight:${el.weight ?? 700}">${html}</div>` +
    `</foreignObject>`
  );
}

type LadderGeom = typeof LADDER;

/** i 番目の数字(0=一番小さく下、人数-1=一番大きく上)の y 座標。 */
function slotY(i: number, g: LadderGeom): number {
  const n = EXAMPLE.people.length;
  if (n <= 1) return g.bottomY;
  return g.bottomY - (i / (n - 1)) * (g.bottomY - g.topY);
}

/** 正解線の y。挟む 2 つの数字の間を、値の位置で按分する。 */
function answerY(g: LadderGeom): number {
  const [lo, hi] = EXAMPLE.bracket;
  const vLo = EXAMPLE.people[lo]!.value;
  const vHi = EXAMPLE.people[hi]!.value;
  const yLo = slotY(lo, g);
  const yHi = slotY(hi, g);
  const f = vHi === vLo ? 0.5 : (EXAMPLE.answer - vLo) / (vHi - vLo);
  return yLo + (yHi - yLo) * f;
}

/** メインの数字の並び。spec.show 人ぶん描く。 */
function renderNumbers(spec: NumbersSpec): string {
  const g: LadderGeom = { ...LADDER, ...spec };
  const show = spec.show;
  const people = EXAMPLE.people;
  const parts: string[] = [];
  const activeI = show - 1;
  // 正解表示中は「挟んでいる 2 人」を赤く強調する。通常は今出した人だけ。
  const [brLo, brHi] = EXAMPLE.bracket;

  if (spec.answer) {
    const [lo, hi] = EXAMPLE.bracket;
    const yTop = slotY(hi, g);
    const yBot = slotY(lo, g);
    parts.push(
      `<rect class="howto-rect howto-rect-band" x="${g.railX - g.rungHalf}" y="${yTop}" width="${g.rungHalf * 2}" height="${(yBot - yTop).toFixed(1)}" />`,
    );
  }

  if (show >= 2) {
    parts.push(
      `<line class="howto-vl" x1="${g.railX}" y1="${slotY(0, g)}" x2="${g.railX}" y2="${slotY(show - 1, g)}" />`,
    );
  }

  for (let i = 0; i < show; i++) {
    const y = slotY(i, g);
    const active = spec.answer ? i === brLo || i === brHi : i === activeI;
    parts.push(personIcon(g.personX, y - g.personSize / 2, g.personSize, active));
    parts.push(
      text({
        text: people[i]!.label,
        x: g.personX,
        y: y + g.personLabelDy,
        size: g.personLabelSize,
        align: "middle",
        color: "muted",
      }),
    );
    parts.push(
      `<line class="howto-hl howto-hl-${active ? "active" : "number"}" x1="${g.railX - g.rungHalf}" y1="${y}" x2="${g.railX + g.rungHalf}" y2="${y}" />`,
    );
    parts.push(
      text({
        text: formatNumber(people[i]!.value),
        x: g.numberX,
        y: y + g.numberSize * 0.34,
        size: g.numberSize,
        color: active ? "accent" : "ink",
        weight: 700,
        mono: true,
      }),
    );
  }

  if (spec.answer) {
    const ay = answerY(g);
    const x1 = g.railX - g.rungHalf - g.answerPadLeft;
    const x2 = g.railX + g.rungHalf + g.answerPadRight;
    parts.push(
      `<g class="howto-drop"><line class="howto-hl howto-hl-answer" x1="${x1}" y1="${ay}" x2="${x2}" y2="${ay}" /></g>`,
    );
    // 線の右に「正解」とだけ(縦中央)。
    parts.push(
      text({
        text: EXAMPLE.answerText,
        x: x2 + g.answerLabelGap,
        y: ay + g.answerLabelDy,
        size: g.answerLabelSize,
        color: "accent",
        weight: 900,
      }),
    );
  }

  return parts.join("");
}

function canvas(inner: string): string {
  return `<svg class="howto-canvas" viewBox="0 0 ${CANVAS.w} ${CANVAS.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="スライド">${inner}</svg>`;
}

function renderSlide(slide: Slide): string {
  const parts: string[] = [];

  parts.push(text(KICKER));

  if (slide.question) {
    const q = slide.question === true ? {} : slide.question;
    parts.push(
      text({
        text: q.text ?? `お題の例:  ${EXAMPLE.question}`,
        x: q.x ?? DEFAULT_QUESTION.x,
        y: q.y ?? DEFAULT_QUESTION.y,
        size: q.size ?? DEFAULT_QUESTION.size,
        color: q.color ?? DEFAULT_QUESTION.color,
        weight: q.weight ?? DEFAULT_QUESTION.weight,
        align: q.align,
      }),
    );
  }

  // タイトル(既定位置にスライドの指定を重ねる)
  const t = slide.title;
  parts.push(
    text({
      text: t.text,
      x: t.x ?? DEFAULT_TITLE.x,
      y: t.y ?? DEFAULT_TITLE.y,
      size: t.size ?? DEFAULT_TITLE.size,
      color: t.color ?? DEFAULT_TITLE.color,
      weight: t.weight ?? DEFAULT_TITLE.weight,
      align: t.align,
    }),
  );

  // 本文(1 行ずつ)
  const b = slide.body;
  const bx = b.x ?? DEFAULT_BODY.x;
  const by = b.y ?? DEFAULT_BODY.y;
  const gap = b.gap ?? DEFAULT_BODY.gap;
  const size = b.size ?? DEFAULT_BODY.size;
  b.lines.forEach((line, i) => {
    parts.push(
      text({ text: line, x: bx, y: by + i * gap, size, color: b.color ?? DEFAULT_BODY.color, weight: b.weight ?? DEFAULT_BODY.weight }),
    );
  });

  // 数字の並び
  if (slide.numbers) parts.push(renderNumbers(slide.numbers));

  // 自由配置(最前面)
  for (const el of slide.extras ?? []) parts.push(element(el));

  return canvas(parts.join(""));
}

/** 表紙スライド(投影がブランクのとき)。 */
export function buildCoverSlide(): string {
  const inner = COVER.elements.map(element).join("");
  return `<div class="proj-slide proj-cover">${canvas(inner)}</div>`;
}

/** お題スライドの 1 要素(HTML を foreignObject で座標に置く)。y は左上。 */
function qBlock(
  x: number,
  y: number,
  w: number,
  size: number,
  color: string,
  weight: number,
  inner: string,
  attr = "",
): string {
  return (
    `<foreignObject x="${x}" y="${y}" width="${w}" height="${size * 5}" class="howto-fo"${attr}>` +
    `<div xmlns="http://www.w3.org/1999/xhtml" class="q-fo" style="font-size:${size}px;color:var(--${color});font-weight:${weight}">${inner}</div>` +
    `</foreignObject>`
  );
}

/** お題スライド。位置・サイズは slides.config.ts の QUESTION(キャンバス座標)。 */
export function buildQuestionSlide(args: {
  roundNo: number;
  question: { title: string; hint: string; unit: string; unitLabel: string } | null;
  clock: string | null;
}): string {
  const Q = QUESTION;
  const parts: string[] = [];

  const round = `${Q.round.prefix}${args.roundNo}${Q.round.suffix}`;
  parts.push(qBlock(Q.round.x, Q.round.y, CANVAS.w - Q.round.x, Q.round.size, Q.round.color, 900, esc(round)));

  if (!args.question) {
    const a = Q.awaiting;
    parts.push(qBlock(a.x, a.y, CANVAS.w - a.x, a.size, a.color, 900, esc(a.text)));
  } else {
    const q = args.question;
    parts.push(qBlock(Q.title.x, Q.title.y, Q.title.w, Q.title.size, Q.title.color, 900, esc(q.title)));
    if (Q.hint.show) {
      parts.push(qBlock(Q.hint.x, Q.hint.y, Q.hint.w, Q.hint.size, Q.hint.color, 700, esc(q.hint)));
    }
    const box =
      `<span class="q-unit-box${Q.unit.boxed ? " is-boxed" : ""}">` +
      `<span class="q-unit-label" style="font-size:${Q.unit.labelSize}px">${esc(Q.unit.label)}</span>` +
      `<span class="q-unit-val" style="font-size:${Q.unit.size}px">${esc(q.unit)} ${esc(q.unitLabel)}</span>` +
      `</span>`;
    parts.push(
      `<foreignObject x="${Q.unit.x}" y="${Q.unit.y}" width="${CANVAS.w - Q.unit.x}" height="${Q.unit.size * 3}" class="howto-fo">` +
        `<div xmlns="http://www.w3.org/1999/xhtml">${box}</div></foreignObject>`,
    );
  }

  if (args.clock != null) {
    // 時計は projection 側の interval が [data-timer] .clock を毎秒書き換える。
    parts.push(
      qBlock(
        Q.timer.x,
        Q.timer.y,
        CANVAS.w - Q.timer.x,
        Q.timer.size,
        Q.timer.color,
        900,
        `<span class="clock">${esc(args.clock)}</span>`,
        ' data-timer',
      ),
    );
  }

  return `<div class="proj-slide proj-question">${canvas(parts.join(""))}</div>`;
}

/** ルール説明スライド 1 枚ぶんの HTML を返す。 */
export function buildHowtoSlide(step: number): string {
  const s = Number.isFinite(step) ? Math.max(0, Math.min(HOWTO_STEP_COUNT - 1, Math.floor(step))) : 0;
  const curPage = howtoPageOf(s);
  const dots = PAGES.map((_, i) => `<span class="howto-dot${i === curPage ? " is-on" : ""}"></span>`).join("");
  return `
    <div class="proj-slide proj-howto">
      ${renderSlide(SLIDES[s]!)}
      <div class="howto-dots">${dots}</div>
    </div>`;
}
