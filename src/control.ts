// 司会・スタッフ用の制御ウィンドウ。全画面の操作をここで行い、
// 表示は投影ウィンドウ(?view=projection)へ同期する。
//
// 入力中のフォーカスを失わないよう、このウィンドウは state 購読による
// 全体再描画はしない。各操作のあとに必要な部分だけ描き直す。

import { formatNumber, formatScore } from "./format";
import { computeRoundResults, cumulativeTotals } from "./results";
import {
  exportStateJson,
  getState,
  importStateJson,
  update,
} from "./state";
import type { AppState, Question } from "./types";
import {
  groupLetters,
  makeEmptyRound,
  resizeRound,
  roundAnswer,
  roundQuestion,
} from "./types";

type Tab = "settings" | "question" | "input" | "reveal" | "ranking";

const TAB_LABELS: Record<Tab, string> = {
  settings: "設定",
  question: "お題",
  input: "入力",
  reveal: "公開・結果",
  ranking: "ランキング",
};

let activeTab: Tab = "settings";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function currentRound(state: AppState) {
  return state.rounds[state.currentRound];
}

// ---- お題ファイルの読み込み ----------------------------------------------

function parseQuestions(json: string): Question[] {
  const data = JSON.parse(json) as { questions?: unknown };
  if (!Array.isArray(data.questions)) {
    throw new Error("questions 配列が見つかりません");
  }
  return data.questions.map((raw): Question => {
    const q = raw as Partial<Question>;
    return {
      title: String(q.title ?? ""),
      hint: String(q.hint ?? ""),
      unit: Number(q.unit) || 1,
      unitLabel: String(q.unitLabel ?? ""),
      answer: q.answer == null ? null : Number(q.answer),
      source: q.source ? String(q.source) : undefined,
    };
  });
}

// ---- 各タブの描画 ----------------------------------------------------------

function renderSettings(state: AppState): string {
  const s = state.settings;
  const nameInputs = s.groups
    .map(
      (name, i) =>
        `<div class="group-row">
           <span class="g-tag">G${i + 1}</span>
           <input type="text" data-group-name="${i}" value="${esc(name)}" />
           <label class="rc">走者数 <input type="number" min="1" max="20" data-group-runners="${i}" value="${s.runnerCounts[i] ?? 8}" /></label>
         </div>`,
    )
    .join("");

  const qList = state.questions.length
    ? `<ol class="q-list">${state.questions
        .map(
          (q) =>
            `<li>${esc(q.title)} <em>${q.answer == null ? "(正解は手入力)" : "正解あり"}</em></li>`,
        )
        .join("")}</ol>`
    : `<p class="muted">まだ読み込まれていません。</p>`;

  return `
    <section class="panel">
      <h2>グループ</h2>
      <label class="field"><span>グループ数</span>
        <input type="number" min="1" max="26" data-group-count value="${s.groups.length}" /></label>
      <label class="field"><span>走者数を一括</span>
        <input type="number" min="1" max="20" data-runners-all placeholder="全グループに適用" /></label>
      <div class="group-rows">${nameInputs}</div>
      <p class="muted">グループごとに走者数(人数)を変えられます。</p>
    </section>

    <section class="panel">
      <h2>ルール設定</h2>
      <label class="field"><span>係数 c</span>
        <input type="number" min="0" step="1" data-c value="${s.c}" /></label>
      <label class="field"><span>ピタリ賞</span>
        <input type="number" min="0" step="1" data-pitari value="${s.pitariBonus}" /></label>
      <label class="field field-check"><input type="checkbox" data-timer-enabled ${s.timerEnabled ? "checked" : ""} /><span>お題画面にタイマーを表示</span></label>
    </section>

    <section class="panel">
      <h2>お題ファイル</h2>
      <p class="muted">本番の正解はリポジトリに入れません。司会PCのローカルJSONを読み込みます。</p>
      <input type="file" accept="application/json,.json" data-question-file />
      <div data-question-list>${qList}</div>
    </section>`;
}

function renderQuestionTab(state: AppState): string {
  const round = currentRound(state);
  if (!round) return `<p class="muted">ラウンドがありません。</p>`;
  const options = state.questions
    .map(
      (q, i) =>
        `<option value="${i}" ${round.questionIndex === i ? "selected" : ""}>${esc(q.title)}</option>`,
    )
    .join("");
  const q = roundQuestion(state, round);
  const detail = q
    ? `<dl class="q-detail">
         <dt>ヒント</dt><dd>${esc(q.hint)}</dd>
         <dt>回答単位</dt><dd>${formatNumber(q.unit)} ${esc(q.unitLabel)}</dd>
         <dt>正解</dt><dd>${q.answer == null ? "<em>発表時に手入力</em>" : "<em>ファイルに設定済み(投影は発表まで非表示)</em>"}</dd>
         ${q.source ? `<dt>司会メモ</dt><dd class="source">${esc(q.source)}</dd>` : ""}
       </dl>`
    : `<p class="muted">お題を選んでください。</p>`;

  const timer = state.settings.timerEnabled
    ? `<section class="panel">
         <h2>タイマー</h2>
         <label class="field"><span>秒数</span><input type="number" min="0" data-timer-sec value="${state.timer.durationSec}" /></label>
         <div class="btn-row">
           <button data-timer-start>開始 / 再開</button>
           <button data-timer-pause>一時停止</button>
           <button data-timer-reset class="ghost">リセット</button>
         </div>
       </section>`
    : "";

  return `
    <section class="panel">
      <h2>第 ${state.currentRound + 1} ラウンドのお題</h2>
      <label class="field"><span>お題</span>
        <select data-question-select>
          <option value="">— 選択 —</option>
          ${options}
        </select></label>
      ${detail}
      <div class="btn-row">
        <button data-show-question class="primary">投影にお題を表示</button>
        <button data-blank class="ghost">投影をブランクに</button>
      </div>
    </section>
    ${timer}`;
}

function renderInput(state: AppState): string {
  const round = currentRound(state);
  if (!round) return `<p class="muted">ラウンドがありません。</p>`;
  const q = roundQuestion(state, round);
  const unit = q?.unit ?? 1;
  const counts = state.settings.runnerCounts;
  const maxM = Math.max(1, ...counts);

  const headerCells = Array.from({ length: maxM }, (_, ri) => `<th>第${ri + 1}走者</th>`).join("");
  const rows = state.settings.groups
    .map((name, gi) => {
      const m = counts[gi] ?? 0;
      const cells = Array.from({ length: maxM }, (_, ri) => {
        if (ri >= m) return `<td class="cell-empty"></td>`;
        const v = round.ladders[gi]?.[ri];
        return `<td><input type="number" inputmode="numeric" data-cell data-gi="${gi}" data-ri="${ri}" value="${v ?? ""}" /></td>`;
      }).join("");
      return `<tr><th class="row-head">${esc(name)}</th>${cells}</tr>`;
    })
    .join("");

  return `
    <section class="panel">
      <h2>はしごの入力(第 ${state.currentRound + 1} ラウンド)</h2>
      <p class="muted">単位 ${formatNumber(unit)} ${esc(q?.unitLabel ?? "")} の倍数 / 前の走者より大きい。違反は<span class="warn-chip">黄色</span>で警告しますが、確定は司会の判断で可能です。Enter で次のセルへ。投影には数字を出しません。</p>
      <div class="grid-scroll">
        <table class="input-grid">
          <thead><tr><th>グループ</th>${headerCells}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="btn-row">
        <button data-clear-round class="ghost">このラウンドの入力をクリア</button>
      </div>
    </section>`;
}

function revealPreviewTable(state: AppState): string {
  const round = currentRound(state);
  if (!round) return "";
  const results = computeRoundResults(state, round);
  const answer = roundAnswer(state, round);
  const rows = results
    .map((r) => {
      let placement = "—";
      if (r.score) {
        switch (r.score.placement.kind) {
          case "below":
            placement = "はしごの外(下)";
            break;
          case "above":
            placement = "はしごの外(上)";
            break;
          case "exact":
            placement = "ピタリ一致";
            break;
          case "band":
            placement = `${formatNumber(r.score.placement.lower)} 〜 ${formatNumber(r.score.placement.upper)}`;
            break;
        }
      }
      return `<tr>
        <td>${esc(r.name)}</td>
        <td class="nums">${r.values.map((v) => formatNumber(v)).join(" / ") || "—"}</td>
        <td>${placement}</td>
        <td class="num">${r.score ? formatScore(r.score.score) : "—"}</td>
        <td class="num">${r.bonus ? `+${r.bonus}` : ""}</td>
        <td class="num total">${r.score ? formatScore(r.total) : "—"}</td>
      </tr>`;
    })
    .join("");
  return `
    <table class="preview-table">
      <thead><tr><th>グループ</th><th>はしご</th><th>正解の位置</th><th>得点</th><th>賞</th><th>計</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="muted">現在の正解:${answer == null ? "<em>未設定</em>" : formatNumber(answer)}</p>`;
}

function renderReveal(state: AppState): string {
  const round = currentRound(state);
  if (!round) return `<p class="muted">ラウンドがありません。</p>`;
  const answer = roundAnswer(state, round);
  const p = state.projection;

  return `
    <section class="panel">
      <h2>公開・結果(第 ${state.currentRound + 1} ラウンド)</h2>
      <div class="btn-row">
        <button data-reveal-open class="primary">結果画面を投影</button>
        <button data-reveal-ladders>① はしごを一斉表示</button>
        <button data-reveal-answer>② 正解を表示</button>
        <button data-reveal-hide class="ghost">隠す(やり直し)</button>
      </div>
      <div class="btn-row">
        <button data-reveal-zoom>③ 正解付近を拡大</button>
        <button data-reveal-unzoom class="ghost">全体に戻す</button>
      </div>
      <p class="status">投影:${p.screen === "reveal" ? "結果画面" : p.screen} / はしご ${p.laddersRevealed ? "表示" : "非表示"} / 正解 ${p.answerRevealed ? "表示" : "非表示"} / 表示 ${p.zoomed ? "拡大" : "全体"}</p>
    </section>

    <section class="panel">
      <h2>正解の入力・訂正</h2>
      <label class="field"><span>正解の値</span>
        <input type="number" data-answer value="${answer ?? ""}" placeholder="お題ファイルに無ければ入力" /></label>
      <div class="btn-row">
        <button data-answer-apply>この値を正解にする</button>
        <button data-answer-clear class="ghost">ファイルの値に戻す</button>
      </div>
    </section>

    <section class="panel">
      <h2>得点プレビュー(司会用)</h2>
      <div data-preview>${revealPreviewTable(state)}</div>
    </section>`;
}

function renderRanking(state: AppState): string {
  const totals = cumulativeTotals(state);
  const ranked = state.settings.groups
    .map((name, gi) => ({ name, gi, total: totals[gi] ?? 0 }))
    .sort((a, b) => b.total - a.total);

  const perRound = state.rounds.map((round, ri) => {
    const res = computeRoundResults(state, round);
    return { ri, byGroup: res.map((r) => r.total) };
  });

  const head = `<tr><th>順位</th><th>グループ</th>${perRound
    .map((p) => `<th>R${p.ri + 1}</th>`)
    .join("")}<th>合計</th></tr>`;
  const body = ranked
    .map(
      (row, i) =>
        `<tr><td>${i + 1}</td><td>${esc(row.name)}</td>${perRound
          .map((p) => `<td class="num">${formatScore(p.byGroup[row.gi] ?? 0)}</td>`)
          .join("")}<td class="num total">${formatScore(row.total)}</td></tr>`,
    )
    .join("");

  return `
    <section class="panel">
      <h2>ランキング</h2>
      <div class="btn-row"><button data-show-ranking class="primary">ランキングを投影</button></div>
      <div class="grid-scroll">
        <table class="ranking-table detail"><thead>${head}</thead><tbody>${body}</tbody></table>
      </div>
    </section>`;
}

// ---- シェルと操作の結線 ----------------------------------------------------

export function mountControl(root: HTMLElement): void {
  root.innerHTML = `
    <div class="control">
      <header class="control-head">
        <div class="brand"><span class="brand-mark">ハサミウチ</span><span class="brand-sub">司会コンソール</span></div>
        <div class="round-nav">
          <button data-round-prev class="ghost">◀</button>
          <span data-round-label class="round-label"></span>
          <button data-round-next class="ghost">▶</button>
          <button data-round-add>＋ 新ラウンド</button>
        </div>
        <div class="global-actions">
          <button data-open-projection class="primary">投影ウィンドウを開く</button>
          <button data-export class="ghost">エクスポート</button>
          <label class="file-btn ghost">インポート<input type="file" accept="application/json,.json" data-import hidden /></label>
        </div>
      </header>
      <nav class="tabs" data-tabs></nav>
      <main class="control-main" data-main></main>
      <footer class="control-foot"><span data-proj-status></span></footer>
    </div>`;

  const tabsEl = root.querySelector<HTMLElement>("[data-tabs]")!;
  const main = root.querySelector<HTMLElement>("[data-main]")!;
  const roundLabel = root.querySelector<HTMLElement>("[data-round-label]")!;
  const projStatus = root.querySelector<HTMLElement>("[data-proj-status]")!;

  tabsEl.innerHTML = (Object.keys(TAB_LABELS) as Tab[])
    .map((t) => `<button data-tab="${t}">${TAB_LABELS[t]}</button>`)
    .join("");

  function refreshChrome(): void {
    const state = getState();
    roundLabel.textContent = `第 ${state.currentRound + 1} / ${state.rounds.length} ラウンド`;
    const screenName: Record<string, string> = {
      blank: "ブランク",
      question: "お題",
      reveal: "結果",
      ranking: "ランキング",
    };
    projStatus.textContent = `投影中の画面:${screenName[state.projection.screen] ?? state.projection.screen}`;
    tabsEl.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.tab === activeTab);
    });
  }

  function renderActive(): void {
    const state = getState();
    switch (activeTab) {
      case "settings":
        main.innerHTML = renderSettings(state);
        bindSettings();
        break;
      case "question":
        main.innerHTML = renderQuestionTab(state);
        bindQuestion();
        break;
      case "input":
        main.innerHTML = renderInput(state);
        bindInput();
        break;
      case "reveal":
        main.innerHTML = renderReveal(state);
        bindReveal();
        break;
      case "ranking":
        main.innerHTML = renderRanking(state);
        bindRanking();
        break;
    }
    refreshChrome();
  }

  // --- 各タブのイベント結線 ---

  function bindSettings(): void {
    main.querySelector<HTMLInputElement>("[data-group-count]")?.addEventListener("change", (e) => {
      const count = Math.max(1, Math.min(26, Number((e.target as HTMLInputElement).value) || 1));
      update((s) => {
        s.settings.groups = groupLetters(count).map((def, i) => s.settings.groups[i] ?? def);
        s.settings.runnerCounts = Array.from({ length: count }, (_, i) => s.settings.runnerCounts[i] ?? 8);
        for (const r of s.rounds) resizeRound(r, s.settings.runnerCounts);
      });
      renderActive();
    });
    main.querySelectorAll<HTMLInputElement>("[data-group-name]").forEach((input) => {
      input.addEventListener("change", () => {
        const i = Number(input.dataset.groupName);
        update((s) => {
          if (s.settings.groups[i] != null) s.settings.groups[i] = input.value;
        });
      });
    });
    main.querySelectorAll<HTMLInputElement>("[data-group-runners]").forEach((input) => {
      input.addEventListener("change", () => {
        const i = Number(input.dataset.groupRunners);
        const m = Math.max(1, Math.min(20, Number(input.value) || 1));
        update((s) => {
          if (s.settings.runnerCounts[i] != null) s.settings.runnerCounts[i] = m;
          for (const r of s.rounds) resizeRound(r, s.settings.runnerCounts);
        });
      });
    });
    main.querySelector<HTMLInputElement>("[data-runners-all]")?.addEventListener("change", (e) => {
      const m = Math.max(1, Math.min(20, Number((e.target as HTMLInputElement).value) || 0));
      if (!m) return;
      update((s) => {
        s.settings.runnerCounts = s.settings.groups.map(() => m);
        for (const r of s.rounds) resizeRound(r, s.settings.runnerCounts);
      });
      renderActive();
    });
    const num = (sel: string, apply: (s: AppState, v: number) => void) =>
      main.querySelector<HTMLInputElement>(sel)?.addEventListener("change", (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        if (Number.isFinite(v)) update((s) => apply(s, v));
      });
    num("[data-c]", (s, v) => (s.settings.c = v));
    num("[data-pitari]", (s, v) => (s.settings.pitariBonus = v));
    main.querySelector<HTMLInputElement>("[data-timer-enabled]")?.addEventListener("change", (e) => {
      update((s) => (s.settings.timerEnabled = (e.target as HTMLInputElement).checked));
    });
    main.querySelector<HTMLInputElement>("[data-question-file]")?.addEventListener("change", async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const questions = parseQuestions(await file.text());
        update((s) => (s.questions = questions));
        renderActive();
      } catch (error) {
        alert(`お題ファイルを読み込めませんでした:${error instanceof Error ? error.message : error}`);
      }
    });
  }

  function bindQuestion(): void {
    main.querySelector<HTMLSelectElement>("[data-question-select]")?.addEventListener("change", (e) => {
      const val = (e.target as HTMLSelectElement).value;
      update((s) => {
        const r = s.rounds[s.currentRound];
        if (r) r.questionIndex = val === "" ? null : Number(val);
      });
      renderActive();
    });
    main.querySelector("[data-show-question]")?.addEventListener("click", () => {
      update(
        (s) =>
          (s.projection = {
            screen: "question",
            laddersRevealed: false,
            answerRevealed: false,
            zoomed: false,
          }),
      );
      refreshChrome();
    });
    main.querySelector("[data-blank]")?.addEventListener("click", () => {
      update((s) => (s.projection.screen = "blank"));
      refreshChrome();
    });
    main.querySelector("[data-timer-start]")?.addEventListener("click", () => {
      const sec = Number(main.querySelector<HTMLInputElement>("[data-timer-sec]")?.value) || 0;
      update((s) => {
        if (s.timer.pausedRemainingMs != null) {
          s.timer.endsAt = Date.now() + s.timer.pausedRemainingMs;
          s.timer.pausedRemainingMs = null;
        } else {
          s.timer.durationSec = sec;
          s.timer.endsAt = Date.now() + sec * 1000;
        }
      });
    });
    main.querySelector("[data-timer-pause]")?.addEventListener("click", () => {
      update((s) => {
        if (s.timer.endsAt != null) {
          s.timer.pausedRemainingMs = Math.max(0, s.timer.endsAt - Date.now());
          s.timer.endsAt = null;
        }
      });
    });
    main.querySelector("[data-timer-reset]")?.addEventListener("click", () => {
      update((s) => {
        s.timer.endsAt = null;
        s.timer.pausedRemainingMs = null;
      });
    });
  }

  function cellWarn(values: (number | null)[], ri: number, unit: number): boolean {
    const v = values[ri];
    if (v == null) return false;
    if (v <= 0) return true;
    if (unit > 0 && Math.abs(v % unit) > 1e-9) return true;
    for (let k = ri - 1; k >= 0; k--) {
      const p = values[k];
      if (p != null) return v <= p;
    }
    return false;
  }

  function refreshCellValidity(): void {
    const state = getState();
    const round = currentRound(state);
    if (!round) return;
    const unit = roundQuestion(state, round)?.unit ?? 1;
    main.querySelectorAll<HTMLInputElement>("[data-cell]").forEach((input) => {
      const gi = Number(input.dataset.gi);
      const ri = Number(input.dataset.ri);
      const warn = cellWarn(round.ladders[gi] ?? [], ri, unit);
      input.classList.toggle("is-warn", warn);
    });
  }

  function bindInput(): void {
    const cells = Array.from(main.querySelectorAll<HTMLInputElement>("[data-cell]"));
    cells.forEach((input) => {
      input.addEventListener("input", () => {
        const gi = Number(input.dataset.gi);
        const ri = Number(input.dataset.ri);
        const raw = input.value.trim();
        const v = raw === "" ? null : Number(raw);
        update((s) => {
          const r = s.rounds[s.currentRound];
          const row = r?.ladders[gi];
          if (row) row[ri] = v != null && Number.isFinite(v) ? v : null;
        });
        refreshCellValidity();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const idx = cells.indexOf(input);
          cells[idx + 1]?.focus();
        }
      });
    });
    main.querySelector("[data-clear-round]")?.addEventListener("click", () => {
      if (!confirm("このラウンドの入力をすべて消しますか?")) return;
      update((s) => {
        const r = s.rounds[s.currentRound];
        if (r) r.ladders = makeEmptyRound(s.settings.runnerCounts).ladders;
      });
      renderActive();
    });
    refreshCellValidity();
  }

  function refreshPreview(): void {
    const el = main.querySelector<HTMLElement>("[data-preview]");
    if (el) el.innerHTML = revealPreviewTable(getState());
  }

  function bindReveal(): void {
    main.querySelector("[data-reveal-open]")?.addEventListener("click", () => {
      update((s) => {
        s.projection.screen = "reveal";
        s.projection.zoomed = false;
      });
      renderActive();
    });
    main.querySelector("[data-reveal-ladders]")?.addEventListener("click", () => {
      update((s) => {
        s.projection.screen = "reveal";
        s.projection.laddersRevealed = true;
      });
      renderActive();
    });
    main.querySelector("[data-reveal-answer]")?.addEventListener("click", () => {
      if (roundAnswer(getState(), currentRound(getState())!) == null) {
        alert("正解が未設定です。先に「正解の値」を入力してください。");
        return;
      }
      update((s) => {
        s.projection.screen = "reveal";
        s.projection.laddersRevealed = true;
        s.projection.answerRevealed = true;
      });
      renderActive();
    });
    main.querySelector("[data-reveal-hide]")?.addEventListener("click", () => {
      update((s) => {
        s.projection.laddersRevealed = false;
        s.projection.answerRevealed = false;
        s.projection.zoomed = false;
      });
      renderActive();
    });
    main.querySelector("[data-reveal-zoom]")?.addEventListener("click", () => {
      if (!getState().projection.answerRevealed) {
        alert("先に「② 正解を表示」してから拡大してください。");
        return;
      }
      update((s) => {
        s.projection.screen = "reveal";
        s.projection.zoomed = true;
      });
      renderActive();
    });
    main.querySelector("[data-reveal-unzoom]")?.addEventListener("click", () => {
      update((s) => (s.projection.zoomed = false));
      renderActive();
    });
    main.querySelector("[data-answer-apply]")?.addEventListener("click", () => {
      const raw = main.querySelector<HTMLInputElement>("[data-answer]")?.value.trim() ?? "";
      const v = raw === "" ? null : Number(raw);
      update((s) => {
        const r = s.rounds[s.currentRound];
        if (r) r.answerOverride = v != null && Number.isFinite(v) ? v : null;
      });
      refreshPreview();
    });
    main.querySelector("[data-answer-clear]")?.addEventListener("click", () => {
      update((s) => {
        const r = s.rounds[s.currentRound];
        if (r) r.answerOverride = null;
      });
      renderActive();
    });
  }

  function bindRanking(): void {
    main.querySelector("[data-show-ranking]")?.addEventListener("click", () => {
      update((s) => (s.projection.screen = "ranking"));
      refreshChrome();
    });
  }

  // --- シェル(ヘッダ)のイベント ---

  tabsEl.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab as Tab;
      renderActive();
    });
  });

  root.querySelector("[data-round-prev]")?.addEventListener("click", () => {
    update((s) => {
      if (s.currentRound > 0) s.currentRound--;
    });
    renderActive();
  });
  root.querySelector("[data-round-next]")?.addEventListener("click", () => {
    update((s) => {
      if (s.currentRound < s.rounds.length - 1) s.currentRound++;
    });
    renderActive();
  });
  root.querySelector("[data-round-add]")?.addEventListener("click", () => {
    update((s) => {
      s.rounds.push(makeEmptyRound(s.settings.runnerCounts));
      s.currentRound = s.rounds.length - 1;
      s.projection = { screen: "blank", laddersRevealed: false, answerRevealed: false, zoomed: false };
    });
    renderActive();
  });

  root.querySelector("[data-open-projection]")?.addEventListener("click", () => {
    window.open(`${location.pathname}?view=projection`, "hasamiuchi-projection", "width=1280,height=720");
  });

  root.querySelector("[data-export]")?.addEventListener("click", () => {
    const blob = new Blob([exportStateJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hasamiuchi-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  root.querySelector<HTMLInputElement>("[data-import]")?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!confirm("現在の進行状態を、読み込んだファイルで上書きします。よろしいですか?")) return;
    const ok = importStateJson(await file.text());
    if (!ok) alert("インポートに失敗しました。ファイルを確認してください。");
    renderActive();
  });

  renderActive();
}
