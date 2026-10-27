// 司会・スタッフ用の制御ウィンドウ。全画面の操作をここで行い、
// 表示は投影ウィンドウ(?view=projection)へ同期する。
//
// 入力中のフォーカスを失わないよう、このウィンドウは state 購読による
// 全体再描画はしない。各操作のあとに必要な部分だけ描き直す。

import { formatNumber, formatScore } from "./format";
import {
  HOWTO_PAGE_COUNT,
  HOWTO_PAGE_TITLES,
  HOWTO_STEP_COUNT,
  howtoPageOf,
  howtoPageStart,
} from "./slides";
import { computeRoundResults, cumulativeTotals } from "./results";
import { MAX_ZOOM, autoFitZoom } from "./projection";
import {
  exportStateJson,
  getState,
  importStateJson,
  update,
} from "./state";
import { qrSvg } from "./qr";
import { getTransport, submissionKey } from "./transport";
import type { SessionBroadcast } from "./transport";
import type { AppState, Question } from "./types";
import {
  groupLetters,
  makeEmptyRound,
  resizeRound,
  roundAnswer,
  roundQuestion,
} from "./types";

type Tab = "settings" | "howto" | "question" | "input" | "reception" | "reveal" | "ranking";

const TAB_LABELS: Record<Tab, string> = {
  settings: "設定",
  howto: "説明",
  question: "お題",
  input: "入力",
  reception: "受付(スマホ)",
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
           <label class="rc">人数 <input type="number" min="1" max="20" data-group-runners="${i}" value="${s.runnerCounts[i] ?? 8}" /></label>
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
      <label class="field"><span>人数を一括</span>
        <input type="number" min="1" max="20" data-runners-all placeholder="全グループに適用" /></label>
      <div class="group-rows">${nameInputs}</div>
      <p class="muted">グループごとに人数を変えられます。</p>
    </section>

    <section class="panel">
      <h2>ルール設定</h2>
      <label class="field"><span>係数 c</span>
        <input type="number" min="0" step="1" data-c value="${s.c}" /></label>
      <label class="field"><span>ピタリ賞</span>
        <input type="number" min="0" step="1" data-pitari value="${s.pitariBonus}" /></label>
      <label class="field field-check"><input type="checkbox" data-handicap ${s.handicap ? "checked" : ""} /><span>人数ハンデ(人数差を補正。同数なら無影響)</span></label>
    </section>

    <section class="panel">
      <h2>お題ファイル</h2>
      <p class="muted">本番の正解はリポジトリに入れません。司会PCのローカルJSONを読み込みます。</p>
      <input type="file" accept="application/json,.json" data-question-file />
      <div data-question-list>${qList}</div>
    </section>`;
}

function renderHowtoTab(state: AppState): string {
  const p = state.projection;
  const onHowto = p.screen === "howto";
  const step = p.howtoStep;
  const page = howtoPageOf(step);
  const list = HOWTO_PAGE_TITLES.map(
    (t, i) =>
      `<li class="${onHowto && i === page ? "is-current" : ""}"><button data-howto-go="${howtoPageStart(i)}">${esc(t)}</button></li>`,
  ).join("");

  return `
    <section class="panel">
      <h2>ルール説明スライド</h2>
      <p class="muted">人のアイコンと具体例(富士山の登山者数)で、1人ずつ数字を出して正解をはさむ流れを見せます。「次へ」を押すたびに 1 人ずつ進みます。</p>
      <div class="btn-row">
        <button data-howto-open class="primary">投影に説明を表示</button>
        <button data-howto-restart class="ghost">最初から</button>
      </div>
      <div class="btn-row">
        <button data-howto-prev>◀ 戻る</button>
        <button data-howto-next class="primary">次へ ▶</button>
        <span class="status howto-nav-status">${onHowto ? `ステップ ${page + 1} / ${HOWTO_PAGE_COUNT}(${esc(HOWTO_PAGE_TITLES[page] ?? "")})` : "投影外"}</span>
      </div>
    </section>

    <section class="panel">
      <h2>ステップ一覧</h2>
      <p class="muted">クリックでそのステップへ飛べます。</p>
      <ol class="howto-steplist">${list}</ol>
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
    </section>`;
}

function renderInput(state: AppState): string {
  const round = currentRound(state);
  if (!round) return `<p class="muted">ラウンドがありません。</p>`;
  const q = roundQuestion(state, round);
  const unit = q?.unit ?? 1;
  const counts = state.settings.runnerCounts;
  const maxM = Math.max(1, ...counts);

  const headerCells = Array.from({ length: maxM }, (_, ri) => `<th>${ri + 1}人目</th>`).join("");
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
      <h2>数字の入力(第 ${state.currentRound + 1} ラウンド)</h2>
      <p class="muted">単位 ${formatNumber(unit)} ${esc(q?.unitLabel ?? "")} の倍数 / 前の人より大きい。違反は<span class="warn-chip">黄色</span>で警告しますが、確定は司会の判断で可能です。Enter で次のセルへ。<strong>表計算(行=グループ・列=人目)からコピーし、左上のセルに貼り付けると一括入力できます。</strong>投影には数字を出しません。</p>
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

// ---- 受付(第2段階:代表者スマホからの送信)------------------------------

/** 現在の状態から、送信画面へ公開するセッション情報を作る(正解は載せない)。 */
function buildSession(state: AppState, open: boolean): SessionBroadcast {
  const round = currentRound(state);
  const q = round ? roundQuestion(state, round) : null;
  return {
    round: state.currentRound,
    open,
    groups: state.settings.groups.map((name, i) => ({
      name,
      runnerCount: state.settings.runnerCounts[i] ?? 0,
    })),
    question: q
      ? { title: q.title, hint: q.hint, unit: q.unit, unitLabel: q.unitLabel }
      : null,
    updatedAt: Date.now(),
  };
}

function submitUrl(): string {
  return `${location.origin}${location.pathname}?view=submit`;
}

function renderReception(state: AppState): string {
  const snap = getTransport().getSnapshot();
  const session = snap.session;
  const open = session?.open ?? false;
  const transportKind = getTransport().kind;
  const round = state.currentRound;
  const url = submitUrl();

  const rows = state.settings.groups
    .map((name, gi) => {
      const sub = snap.submissions[submissionKey(round, gi)];
      const status = sub
        ? `<span class="recv-ok">送信済み ${new Date(sub.submittedAt).toLocaleTimeString("ja-JP")}</span>`
        : `<span class="recv-none">未送信</span>`;
      const nums = sub
        ? sub.numbers.map((v) => (v == null ? "—" : formatNumber(v))).join(" / ")
        : "—";
      return `<tr>
        <td>${esc(name)}</td>
        <td>${status}</td>
        <td class="nums">${nums}</td>
        <td><button data-recv-import="${gi}" ${sub ? "" : "disabled"}>入力表へ取り込む</button></td>
      </tr>`;
    })
    .join("");

  return `
    <section class="panel">
      <h2>スマホ受付(第 ${round + 1} ラウンド)</h2>
      <p class="muted">
        代表者のスマホから数字を送ってもらい、ここで確認して入力表へ取り込みます。
        通信が不調なら「入力」タブの手入力にそのまま切り替えられます(受付は補助です)。
        同期方式:<strong>${transportKind === "local" ? "ローカル(同一ブラウザの別タブ・別ウィンドウ間のみ。動作確認・リハーサル用)" : "Firebase"}</strong>
      </p>
      <div class="btn-row">
        ${open
          ? `<button data-recv-close class="ghost">受付を締め切る</button>
             <button data-recv-republish>お題・ラウンドを再公開</button>`
          : `<button data-recv-open class="primary">受付を開始(今のお題を公開)</button>`}
        <span class="status">${open ? "受付中" : "停止中"}</span>
      </div>
    </section>

    <section class="panel">
      <h2>回答送信の QR(全グループ共通)</h2>
      <p class="muted">参加者は QR を読み取り、送信画面でグループを選んで送ります。投影に大きく出せます。</p>
      <div class="recv-qr-row">
        <div class="recv-qr">${qrSvg(url)}</div>
        <div class="recv-qr-side">
          <div class="btn-row">
            <button data-recv-show-qr class="primary">投影に QR を表示</button>
            <a class="file-btn ghost" href="${url}" target="_blank" rel="noopener">送信画面を開く</a>
          </div>
          <p class="recv-url"><code>${esc(url)}</code></p>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>送信状況</h2>
      <div class="grid-scroll">
        <table class="recv-table">
          <thead><tr><th>グループ</th><th>状況</th><th>送信された数字</th><th>取り込み</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="btn-row">
        <button data-recv-import-all class="primary">送信済みを全グループ取り込む</button>
      </div>
      <p class="muted">取り込むと「入力」タブの表に反映されます。取り込み後に手で訂正できます。</p>
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
            placement = "外れ(下)";
            break;
          case "above":
            placement = "外れ(上)";
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
      <thead><tr><th>グループ</th><th>出した数字</th><th>正解の位置</th><th>得点</th><th>賞</th><th>計</th></tr></thead>
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
        <button data-reveal-ladders>① 数字を一斉表示</button>
        <button data-reveal-answer>② 正解を表示</button>
        <button data-reveal-hide class="ghost">隠す(やり直し)</button>
      </div>
      <div class="btn-row">
        <button data-reveal-zoom>③ 正解付近を拡大(自動)</button>
        <button data-reveal-unzoom class="ghost">全体に戻す</button>
      </div>
      <label class="zoom-slider">
        <span>拡大率</span>
        <input type="range" min="1" max="${MAX_ZOOM}" step="0.1" value="${(p.zoomLevel || 1).toFixed(1)}" data-zoom-range ${p.answerRevealed ? "" : "disabled"} />
        <span class="zoom-value" data-zoom-value>${(p.zoomLevel || 1).toFixed(1)}×</span>
      </label>
      <p class="status">投影:${p.screen === "reveal" ? "結果画面" : p.screen} / 数字 ${p.laddersRevealed ? "表示" : "非表示"} / 正解 ${p.answerRevealed ? "表示" : "非表示"} / 表示 ${p.zoomed ? "拡大" : "全体"}</p>
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
      <aside class="proj-preview" data-preview>
        <div class="proj-preview-bar">
          <span class="proj-preview-title">投影プレビュー</span>
          <button data-preview-toggle class="ghost" title="プレビューの表示/非表示">隠す</button>
        </div>
        <div class="proj-preview-frame">
          <iframe data-preview-iframe title="投影プレビュー"></iframe>
        </div>
      </aside>
    </div>`;

  const tabsEl = root.querySelector<HTMLElement>("[data-tabs]")!;
  const main = root.querySelector<HTMLElement>("[data-main]")!;
  const roundLabel = root.querySelector<HTMLElement>("[data-round-label]")!;
  const projStatus = root.querySelector<HTMLElement>("[data-proj-status]")!;

  // 投影プレビュー:投影ビューを iframe で埋め込むだけ。state は
  // localStorage + BroadcastChannel で同期されるので、ここで再描画は不要。
  const previewPanel = root.querySelector<HTMLElement>("[data-preview]")!;
  const previewFrame = root.querySelector<HTMLIFrameElement>("[data-preview-iframe]")!;
  previewFrame.src = `${location.pathname}?view=projection`;
  root.querySelector("[data-preview-toggle]")?.addEventListener("click", (e) => {
    const collapsed = previewPanel.classList.toggle("is-collapsed");
    (e.currentTarget as HTMLButtonElement).textContent = collapsed ? "表示" : "隠す";
  });

  tabsEl.innerHTML = (Object.keys(TAB_LABELS) as Tab[])
    .map((t) => `<button data-tab="${t}">${TAB_LABELS[t]}</button>`)
    .join("");

  function refreshChrome(): void {
    const state = getState();
    roundLabel.textContent = `第 ${state.currentRound + 1} / ${state.rounds.length} ラウンド`;
    const screenName: Record<string, string> = {
      blank: "ブランク",
      howto: "ルール説明",
      question: "お題",
      reveal: "結果",
      ranking: "ランキング",
      submit: "回答送信QR",
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
      case "howto":
        main.innerHTML = renderHowtoTab(state);
        bindHowto();
        break;
      case "question":
        main.innerHTML = renderQuestionTab(state);
        bindQuestion();
        break;
      case "input":
        main.innerHTML = renderInput(state);
        bindInput();
        break;
      case "reception":
        main.innerHTML = renderReception(state);
        bindReception();
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
    main.querySelector<HTMLInputElement>("[data-handicap]")?.addEventListener("change", (e) => {
      update((s) => (s.settings.handicap = (e.target as HTMLInputElement).checked));
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

  function bindHowto(): void {
    const setStep = (next: number): void => {
      update((s) => {
        s.projection.screen = "howto";
        s.projection.howtoStep = Math.max(0, Math.min(HOWTO_STEP_COUNT - 1, next));
      });
      renderActive();
    };
    main.querySelector("[data-howto-open]")?.addEventListener("click", () => {
      update((s) => (s.projection.screen = "howto"));
      renderActive();
    });
    main.querySelector("[data-howto-restart]")?.addEventListener("click", () => setStep(0));
    main.querySelector("[data-howto-prev]")?.addEventListener("click", () =>
      setStep(getState().projection.howtoStep - 1),
    );
    main.querySelector("[data-howto-next]")?.addEventListener("click", () =>
      setStep(getState().projection.howtoStep + 1),
    );
    main.querySelectorAll<HTMLButtonElement>("[data-howto-go]").forEach((btn) => {
      btn.addEventListener("click", () => setStep(Number(btn.dataset.howtoGo)));
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
            zoomLevel: 1,
            howtoStep: s.projection.howtoStep,
          }),
      );
      refreshChrome();
    });
    main.querySelector("[data-blank]")?.addEventListener("click", () => {
      update((s) => (s.projection.screen = "blank"));
      refreshChrome();
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
      // 表計算からの一括ペースト。このセルを起点に、タブ=横/改行=縦で流し込む。
      input.addEventListener("paste", (e) => {
        const text = e.clipboardData?.getData("text/plain") ?? "";
        if (!/[\t\n\r]/.test(text)) return; // 単一セルは通常ペーストに任せる
        e.preventDefault();
        const startGi = Number(input.dataset.gi);
        const startRi = Number(input.dataset.ri);
        const grid = text
          .replace(/\r\n?/g, "\n")
          .replace(/\n+$/, "")
          .split("\n")
          .map((line) => line.split("\t"));
        update((s) => {
          const r = s.rounds[s.currentRound];
          if (!r) return;
          const counts = s.settings.runnerCounts;
          grid.forEach((row, dr) => {
            const gi = startGi + dr;
            const ladder = r.ladders[gi];
            if (!ladder) return; // グループ数を超えたら無視
            row.forEach((cellText, dc) => {
              const ri = startRi + dc;
              if (ri >= (counts[gi] ?? 0)) return; // 人数を超えたら無視
              const raw = cellText.replace(/[,\s]/g, ""); // 桁区切り・空白を除去
              if (raw === "") return; // 空欄は既存値を保持
              const v = Number(raw);
              if (Number.isFinite(v)) ladder[ri] = v;
            });
          });
        });
        renderActive(); // 値と警告を描き直す
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

  function bindReception(): void {
    const transport = getTransport();
    const publish = (open: boolean) => {
      transport.publishSession(buildSession(getState(), open));
      renderActive();
    };
    main.querySelector("[data-recv-open]")?.addEventListener("click", () => publish(true));
    main.querySelector("[data-recv-close]")?.addEventListener("click", () => publish(false));
    main.querySelector("[data-recv-republish]")?.addEventListener("click", () => publish(true));
    main.querySelector("[data-recv-show-qr]")?.addEventListener("click", () => {
      // 受付がまだなら、QR 表示と同時に受付も開始して公開しておく。
      if (!getTransport().getSnapshot().session?.open) {
        transport.publishSession(buildSession(getState(), true));
      }
      update((s) => (s.projection.screen = "submit"));
      renderActive();
    });

    const importGroup = (gi: number): boolean => {
      const snap = transport.getSnapshot();
      const sub = snap.submissions[submissionKey(getState().currentRound, gi)];
      if (!sub) return false;
      update((s) => {
        const ladder = s.rounds[s.currentRound]?.ladders[gi];
        if (!ladder) return;
        const m = s.settings.runnerCounts[gi] ?? 0;
        for (let ri = 0; ri < m; ri++) {
          const v = sub.numbers[ri];
          ladder[ri] = v != null && Number.isFinite(v) ? v : null;
        }
      });
      return true;
    };

    main.querySelectorAll<HTMLButtonElement>("[data-recv-import]").forEach((btn) => {
      btn.addEventListener("click", () => {
        importGroup(Number(btn.dataset.recvImport));
        renderActive();
      });
    });
    main.querySelector("[data-recv-import-all]")?.addEventListener("click", () => {
      let n = 0;
      getState().settings.groups.forEach((_, gi) => {
        if (importGroup(gi)) n++;
      });
      renderActive();
      if (n === 0) alert("取り込める送信がまだありません。");
    });
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
      const fit = autoFitZoom(getState());
      update((s) => {
        s.projection.screen = "reveal";
        s.projection.zoomed = true;
        s.projection.zoomLevel = fit;
      });
      renderActive(); // スライダーを自動フィット値に合わせる
    });
    main.querySelector("[data-reveal-unzoom]")?.addEventListener("click", () => {
      update((s) => {
        s.projection.zoomed = false;
        s.projection.zoomLevel = 1;
      });
      renderActive();
    });
    // 拡大率スライダー。ドラッグ中はフォーカスを守るため再描画せず、state と
    // 数値ラベルだけ更新する(投影・プレビューは同期で追従)。
    const zoomRange = main.querySelector<HTMLInputElement>("[data-zoom-range]");
    const zoomValue = main.querySelector<HTMLElement>("[data-zoom-value]");
    zoomRange?.addEventListener("input", () => {
      const v = Math.min(MAX_ZOOM, Math.max(1, Number(zoomRange.value) || 1));
      if (zoomValue) zoomValue.textContent = `${v.toFixed(1)}×`;
      update((s) => {
        s.projection.screen = "reveal";
        s.projection.zoomed = v > 1.0001;
        s.projection.zoomLevel = v;
      });
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
      s.projection = {
        screen: "blank",
        laddersRevealed: false,
        answerRevealed: false,
        zoomed: false,
        zoomLevel: 1,
        howtoStep: 0,
      };
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

  // 説明タブでは ←/→ キーで戻る/次へ(ボタンを押さなくても送れる)。
  // 入力欄にフォーカスがあるときは邪魔しない。
  window.addEventListener("keydown", (e) => {
    if (activeTab !== "howto" || e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    e.preventDefault();
    const sel = e.key === "ArrowRight" ? "[data-howto-next]" : "[data-howto-prev]";
    main.querySelector<HTMLButtonElement>(sel)?.click();
  });

  // スマホからの送信が届いたら、受付タブを開いているときだけ描き直す。
  // (受付タブは連続入力中のテキスト欄が無いので全描画でフォーカス問題は起きない)
  let firstSubmitSnapshot = true;
  getTransport().subscribe(() => {
    if (firstSubmitSnapshot) {
      firstSubmitSnapshot = false; // 購読時の即時コールバックでは再描画しない
      return;
    }
    if (activeTab === "reception") renderActive();
  });

  renderActive();
}
