// 投影ウィンドウ。状態を購読し、projection.screen に応じて大きく表示する。
// 数字の入力は司会ウィンドウ側で行い、ここは表示専用。

import { buildLadderChart, type ChartGroup } from "./chart";
import { formatNumber, formatScore } from "./format";
import { computeRoundResults, cumulativeTotals, type GroupResult } from "./results";
import { getState, subscribe } from "./state";
import type { AppState, TimerState } from "./types";
import { roundQuestion } from "./types";

function timerRemainingMs(t: TimerState): number {
  if (t.endsAt != null) return Math.max(0, t.endsAt - Date.now());
  if (t.pausedRemainingMs != null) return t.pausedRemainingMs;
  return t.durationSec * 1000;
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function toChartGroup(r: GroupResult): ChartGroup {
  const base: ChartGroup = {
    name: r.name,
    values: r.values,
    band: null,
    ratio: null,
    score: null,
    outside: false,
    exactValue: null,
  };
  const s = r.score;
  if (!s) return base;
  base.score = s.score;
  base.ratio = s.ratio;
  base.exactValue = s.pitariValue; // ピタリの段を赤く強調する
  switch (s.placement.kind) {
    case "below":
    case "above":
      base.outside = true;
      break;
    case "band":
      base.band = { lower: s.placement.lower, upper: s.placement.upper };
      break;
    case "exact":
      break;
  }
  return base;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/**
 * 正解付近のズーム窓。正解に「最も近い段」(= 一番きつい挟み)を基準にする。
 * 広く挟んだチームの遠い段に引っ張られて窓が広がらないようにする。
 */
function focusWindow(results: GroupResult[], answer: number): { min: number; max: number } {
  let nearBelow = Number.NEGATIVE_INFINITY; // 正解以下で最も高い段
  let nearAbove = Number.POSITIVE_INFINITY; // 正解以上で最も低い段
  for (const r of results) {
    for (const v of r.values) {
      if (v <= answer && v > nearBelow) nearBelow = v;
      if (v >= answer && v < nearAbove) nearAbove = v;
    }
  }
  if (!Number.isFinite(nearBelow)) nearBelow = answer;
  if (!Number.isFinite(nearAbove)) nearAbove = answer;

  // 対数で左右に余白を足して近傍の段も少し見えるようにする。
  // きつい挟みでも潰れないよう最小の余白を設ける。
  const logLo = Math.log10(Math.max(nearBelow, 1));
  const logHi = Math.log10(Math.max(nearAbove, 1));
  const halfPad = Math.max((logHi - logLo) * 0.8, 0.11);
  return {
    min: 10 ** (logLo - halfPad),
    max: 10 ** (logHi + halfPad),
  };
}

function renderBlank(): string {
  return `
    <div class="proj-slide proj-blank">
      <p class="kicker">チーム対抗・数字当て</p>
      <h1 class="wordmark">ハサミウチ</h1>
      <p class="subtitle">― 刻むか、跳ぶか ―</p>
    </div>`;
}

function renderQuestion(state: AppState): string {
  const round = state.rounds[state.currentRound];
  const q = round ? roundQuestion(state, round) : null;
  const roundNo = state.currentRound + 1;
  const timer = state.settings.timerEnabled
    ? `<div class="proj-timer" data-timer><span class="clock">${formatClock(timerRemainingMs(state.timer))}</span></div>`
    : "";
  if (!q) {
    return `
      <div class="proj-slide proj-question">
        <p class="round-no">第 ${roundNo} ラウンド</p>
        <p class="awaiting">お題を準備中…</p>
        ${timer}
      </div>`;
  }
  return `
    <div class="proj-slide proj-question">
      <p class="round-no">第 ${roundNo} ラウンド</p>
      <h1 class="q-title">${esc(q.title)}</h1>
      <p class="q-hint">${esc(q.hint)}</p>
      <p class="q-unit">回答単位:${formatNumber(q.unit)} ${esc(q.unitLabel)}</p>
      ${timer}
    </div>`;
}

/** 全体表示のときの対数レンジ(buildLadderChart の既定と一致させる)。 */
function fullLogRange(results: GroupResult[], answer: number | null): { min: number; max: number } {
  const vals = results.flatMap((r) => r.values).filter((v) => v > 0);
  if (answer != null && answer > 0) vals.push(answer);
  const dMin = vals.length ? Math.min(...vals) : 1;
  const dMax = vals.length ? Math.max(...vals) : 10;
  const lMin = Math.log10(dMin);
  const lMax = Math.log10(dMax);
  const pad = (lMax - lMin) * 0.08 || 0.3;
  return { min: lMin - pad, max: lMax + pad };
}

/** 拡大の目標倍率。一番きつい挟み(focusWindow)が画面を満たす程度。 */
function targetZoom(results: GroupResult[], answer: number): number {
  const full = fullLogRange(results, answer);
  const tight = focusWindow(results, answer);
  const targetSpan = Math.log10(tight.max) - Math.log10(tight.min);
  const fullSpan = full.max - full.min;
  if (targetSpan <= 0 || fullSpan <= 0) return 1;
  return Math.min(12, Math.max(1, fullSpan / targetSpan));
}

/**
 * 倍率 z のときの表示値域。正解 answer の対数位置を軸に、全体レンジの上下を
 * それぞれ 1/z に縮める。これにより正解線は画面上の同じ位置に固定されたまま拡大する。
 */
function zoomFocusAt(results: GroupResult[], answer: number, z: number): { min: number; max: number } {
  const full = fullLogRange(results, answer);
  const p = Math.log10(answer);
  return {
    min: 10 ** (p - (p - full.min) / z),
    max: 10 ** (p + (full.max - p) / z),
  };
}

function renderReveal(state: AppState): string {
  const round = state.rounds[state.currentRound];
  if (!round) return renderBlank();
  const results = computeRoundResults(state, round);
  const q = roundQuestion(state, round);
  const answerVal = round.answerOverride ?? (q ? q.answer : null);
  const showAns = state.projection.answerRevealed;

  let footer = "";
  if (showAns) {
    const pitari = results.filter((r) => r.score?.pitari);
    const pitariBadge = pitari.length
      ? `<span class="badge badge-pitari">ピタリ賞 +${state.settings.pitariBonus}点 … ${pitari
          .map((r) => esc(r.name))
          .join("・")}</span>`
      : "";
    const callout =
      answerVal != null ? `<div class="answer-callout">正解 ${formatNumber(answerVal)}</div>` : "";
    footer = `<div class="proj-footer-row"><div class="proj-badges">${pitariBadge}</div>${callout}</div>`;
  }

  // チャートは paintChart が [data-chart] に描く(ズームをアニメーションさせるため)。
  return `
    <div class="proj-slide proj-reveal">
      <p class="round-no">第 ${state.currentRound + 1} ラウンド${q ? ` ― ${esc(q.title)}` : ""}</p>
      <div class="chart-wrap" data-chart></div>
      ${footer}
    </div>`;
}

const CHART_HEIGHT = 860;

/** 現在の倍率 z でチャートを [data-chart] に描く。 */
function paintChart(root: HTMLElement, state: AppState, z: number, answerDrop: boolean): void {
  const wrap = root.querySelector<HTMLElement>("[data-chart]");
  const round = state.rounds[state.currentRound];
  if (!wrap || !round) return;
  const results = computeRoundResults(state, round);
  const q = roundQuestion(state, round);
  const answerVal = round.answerOverride ?? (q ? q.answer : null);
  const showAns = state.projection.answerRevealed;

  const width = Math.max(
    Math.round((CHART_HEIGHT * 16) / 9),
    state.settings.groups.length * 190,
  );
  const focus =
    showAns && answerVal != null && z > 1.0001 ? zoomFocusAt(results, answerVal, z) : null;

  wrap.innerHTML = buildLadderChart({
    groups: results.map(toChartGroup),
    answer: showAns ? answerVal : null,
    showLadders: state.projection.laddersRevealed,
    showAnswer: showAns,
    width,
    height: CHART_HEIGHT,
    focus,
    answerDrop,
  });
}

function renderRanking(state: AppState): string {
  const totals = cumulativeTotals(state);
  const rows = state.settings.groups
    .map((name, gi) => ({ name, total: totals[gi] ?? 0 }))
    .sort((a, b) => b.total - a.total);
  const body = rows
    .map(
      (r, i) => `
      <tr>
        <td class="rank">${i + 1}</td>
        <td class="name">${esc(r.name)}</td>
        <td class="total">${formatScore(r.total)}</td>
      </tr>`,
    )
    .join("");

  // グループ数が多いほど文字と行間を縮めて画面内に収める(ヘッダ行を含めて +1)。
  const fontVmin = Math.max(1.8, Math.min(4, 42 / (rows.length + 1)));

  return `
    <div class="proj-slide proj-ranking" style="--rank-fs:${fontVmin.toFixed(2)}vmin">
      <p class="round-no">累計ランキング</p>
      <table class="ranking-table">
        <thead><tr><th>順位</th><th>グループ</th><th>合計</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

export function mountProjection(root: HTMLElement): void {
  let timerInterval: number | null = null;
  let zoomRaf = 0;
  let zoomCurrent = 1; // 現在の表示倍率(アニメーションで補間)

  const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

  // 現在の状態に向けてズーム倍率をアニメーションさせる。
  const driveZoom = (state: AppState): void => {
    cancelAnimationFrame(zoomRaf);
    const round = state.rounds[state.currentRound];
    const q = round ? roundQuestion(state, round) : null;
    const answerVal = round ? (round.answerOverride ?? (q ? q.answer : null)) : null;

    let target = 1;
    if (round && state.projection.zoomed && state.projection.answerRevealed && answerVal != null) {
      target = targetZoom(computeRoundResults(state, round), answerVal);
    }

    // 既に目標倍率付近なら静止描画。初回公開(倍率1)では正解線のドロップ演出を出す。
    if (Math.abs(target - zoomCurrent) < 0.01) {
      zoomCurrent = target;
      paintChart(root, state, zoomCurrent, target <= 1.0001 && state.projection.answerRevealed);
      return;
    }

    const start = zoomCurrent;
    const t0 = performance.now();
    const duration = 600;
    paintChart(root, state, zoomCurrent, false); // 空フレームを避けて即描画
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / duration);
      zoomCurrent = start + (target - start) * easeOutCubic(t);
      paintChart(root, state, zoomCurrent, false);
      if (t < 1) zoomRaf = requestAnimationFrame(step);
    };
    zoomRaf = requestAnimationFrame(step);
  };

  const render = (state: AppState): void => {
    let html: string;
    switch (state.projection.screen) {
      case "question":
        html = renderQuestion(state);
        break;
      case "reveal":
        html = renderReveal(state);
        break;
      case "ranking":
        html = renderRanking(state);
        break;
      default:
        html = renderBlank();
    }
    root.innerHTML = html;

    if (state.projection.screen === "reveal") {
      driveZoom(state);
    } else {
      // reveal を離れたらズームを解除しておく。
      cancelAnimationFrame(zoomRaf);
      zoomCurrent = 1;
    }

    // タイマーは投影側で毎秒進める(状態は開始時刻だけ共有する)。
    if (timerInterval != null) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    const timerEl = root.querySelector<HTMLElement>("[data-timer] .clock");
    if (timerEl) {
      timerInterval = window.setInterval(() => {
        timerEl.textContent = formatClock(timerRemainingMs(getState().timer));
      }, 250);
    }
  };

  subscribe(render);
}
