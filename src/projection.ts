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
  switch (s.placement.kind) {
    case "below":
    case "above":
      base.outside = true;
      break;
    case "band":
      base.band = { lower: s.placement.lower, upper: s.placement.upper };
      break;
    case "exact":
      base.exactValue = r.values[s.placement.index] ?? null;
      break;
  }
  return base;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
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

function renderReveal(state: AppState): string {
  const round = state.rounds[state.currentRound];
  if (!round) return renderBlank();
  const results = computeRoundResults(state, round);
  const q = roundQuestion(state, round);
  const chart = buildLadderChart({
    groups: results.map(toChartGroup),
    answer: state.projection.answerRevealed
      ? (round.answerOverride ?? (q ? q.answer : null))
      : null,
    showLadders: state.projection.laddersRevealed,
    showAnswer: state.projection.answerRevealed,
    width: Math.max(960, state.settings.groups.length * 150),
    height: 640,
  });

  let footer = "";
  if (state.projection.answerRevealed) {
    const pitari = results.filter((r) => r.score?.pitari);
    const bracketed = results.filter((r) => r.score?.placement.kind === "band");
    const top = bracketed.sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0))[0];
    const badges: string[] = [];
    if (pitari.length) {
      badges.push(
        `<span class="badge badge-pitari">ピタリ賞 +${state.settings.pitariBonus}点 … ${pitari
          .map((r) => esc(r.name))
          .join("・")}</span>`,
      );
    }
    if (top?.score && top.score.mvpPair) {
      const [a, b] = top.score.mvpPair;
      badges.push(
        `<span class="badge badge-mvp">MVP … ${esc(top.name)} 第${a + 1}走者・第${b + 1}走者</span>`,
      );
    }
    if (badges.length) footer = `<div class="proj-badges">${badges.join("")}</div>`;
  }

  return `
    <div class="proj-slide proj-reveal">
      <p class="round-no">第 ${state.currentRound + 1} ラウンド${q ? ` ― ${esc(q.title)}` : ""}</p>
      <div class="chart-wrap">${chart}</div>
      ${footer}
    </div>`;
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
  return `
    <div class="proj-slide proj-ranking">
      <p class="round-no">累計ランキング</p>
      <table class="ranking-table">
        <thead><tr><th>順位</th><th>グループ</th><th>合計</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

export function mountProjection(root: HTMLElement): void {
  let timerInterval: number | null = null;

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
