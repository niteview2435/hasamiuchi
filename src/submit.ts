// 第2段階:代表者スマホ用の送信画面(全グループ共通の URL ?view=submit)。
//
// グループはドロップダウンから選ぶ(選択は localStorage に覚える)。司会が公開した
// SessionBroadcast を購読し、現ラウンドのお題と自グループの人数ぶんの入力欄を出す。
// 受付中だけ送信でき、締め切りまでは再送信で修正可能。正解は一切受け取らない。

import { formatNumber } from "./format";
import { getTransport, submissionKey } from "./transport";
import type { SubmitSnapshot } from "./transport";

const GROUP_KEY = "hasamiuchi.submit.group";

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/** 第1段階と同じ入力チェック。違反セルは警告するが送信は許す。 */
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

export function mountSubmit(root: HTMLElement): void {
  const transport = getTransport();
  const params = new URLSearchParams(location.search);

  // 選択グループ:URL の ?group= を最優先、次に前回の localStorage。
  let selectedGroup: number | null = null;
  const fromUrl = Number(params.get("group"));
  if (params.has("group") && Number.isInteger(fromUrl) && fromUrl >= 0) {
    selectedGroup = fromUrl;
  } else {
    try {
      const saved = localStorage.getItem(GROUP_KEY);
      if (saved != null && saved !== "") selectedGroup = Number(saved);
    } catch {
      /* localStorage 不可でも続行 */
    }
  }

  // グループごとの下書き(送信前の入力値)をメモリに保持する。
  const drafts: Record<number, (number | null)[]> = {};

  // 無駄な全再描画を避けるため、セッションの同一性を署名で見張る。
  // 他グループの送信でフォーカスを奪われないよう、変化したときだけ描き直す。
  let lastSig = "";
  function sessionSig(snap: SubmitSnapshot): string {
    const s = snap.session;
    const base = s ? `${s.round}|${s.open}|${s.updatedAt}|${s.groups.length}` : "none";
    return `${base}|${selectedGroup}`;
  }

  function saveGroup(): void {
    try {
      localStorage.setItem(GROUP_KEY, selectedGroup == null ? "" : String(selectedGroup));
    } catch {
      /* 保存できなくても続行 */
    }
  }

  function groupSelectHtml(snap: SubmitSnapshot): string {
    const groups = snap.session?.groups ?? [];
    const options = [`<option value="">— グループを選択 —</option>`]
      .concat(
        groups.map(
          (g, i) =>
            `<option value="${i}" ${selectedGroup === i ? "selected" : ""}>${esc(g.name)}</option>`,
        ),
      )
      .join("");
    return `<label class="submit-pick"><span>グループ</span><select data-group>${options}</select></label>`;
  }

  function render(snap: SubmitSnapshot): void {
    const session = snap.session;
    document.title = "ハサミウチ 回答送信";

    if (!session) {
      root.innerHTML = `
        <div class="submit">
          <header class="submit-head"><h1 class="submit-group">回答送信</h1></header>
          <p class="submit-wait">司会が受付を開始すると、ここにグループ選択とお題が出ます。しばらくお待ちください。</p>
        </div>`;
      return;
    }

    const meta = selectedGroup != null ? session.groups[selectedGroup] : undefined;

    // グループ未選択:選択だけ出す。
    if (selectedGroup == null || !meta) {
      root.innerHTML = `
        <div class="submit">
          <header class="submit-head"><h1 class="submit-group">回答送信</h1><span class="submit-round">第 ${session.round + 1} ラウンド</span></header>
          ${groupSelectHtml(snap)}
          <p class="submit-wait">自分のグループを選んでください。</p>
        </div>`;
      bindGroupSelect();
      return;
    }

    const m = meta.runnerCount;
    const draft = (drafts[selectedGroup] = Array.from(
      { length: m },
      (_, i) => drafts[selectedGroup!]?.[i] ?? null,
    ));

    const q = session.question;
    const unit = q?.unit ?? 1;
    const already = snap.submissions[submissionKey(session.round, selectedGroup)];

    const qBlock = q
      ? `<div class="submit-q">
           <h2>${esc(q.title)}</h2>
           <p class="submit-hint">${esc(q.hint)}</p>
           <p class="submit-unit">単位:${formatNumber(q.unit)} ${esc(q.unitLabel)} の倍数で、前の人より大きい数字</p>
         </div>`
      : `<p class="submit-wait">お題がまだ選ばれていません。</p>`;

    const rows = Array.from({ length: m }, (_, ri) => {
      const warn = cellWarn(draft, ri, unit);
      return `<label class="submit-cell ${warn ? "is-warn" : ""}">
          <span>${ri + 1}人目</span>
          <input type="number" inputmode="numeric" data-ri="${ri}" value="${draft[ri] ?? ""}" ${session.open ? "" : "disabled"} />
        </label>`;
    }).join("");

    const sentNote = already
      ? `<p class="submit-sent">送信済み(${new Date(already.submittedAt).toLocaleTimeString("ja-JP")})。締め切りまでは直して再送信できます。</p>`
      : "";

    const statusLine = session.open
      ? `<p class="submit-open">受付中</p>`
      : `<p class="submit-closed">受付は締め切られました。</p>`;

    root.innerHTML = `
      <div class="submit">
        <header class="submit-head">
          <h1 class="submit-group">${esc(meta.name)}</h1>
          <span class="submit-round">第 ${session.round + 1} ラウンド</span>
        </header>
        ${groupSelectHtml(snap)}
        ${statusLine}
        ${qBlock}
        <div class="submit-grid">${rows}</div>
        ${sentNote}
        <button class="submit-send" data-send ${session.open ? "" : "disabled"}>
          ${already ? "再送信する" : "この数字を送信する"}
        </button>
      </div>`;

    bindGroupSelect();
    bindForm(session.round, unit);
  }

  function bindGroupSelect(): void {
    root.querySelector<HTMLSelectElement>("[data-group]")?.addEventListener("change", (e) => {
      const val = (e.target as HTMLSelectElement).value;
      selectedGroup = val === "" ? null : Number(val);
      saveGroup();
      lastSig = ""; // 選択変更は必ず描き直す
      render(transport.getSnapshot());
    });
  }

  function bindForm(round: number, unit: number): void {
    const draft = selectedGroup != null ? drafts[selectedGroup] : undefined;
    if (!draft) return;

    root.querySelectorAll<HTMLInputElement>("[data-ri]").forEach((input) => {
      input.addEventListener("input", () => {
        const ri = Number(input.dataset.ri);
        const raw = input.value.trim();
        const v = raw === "" ? null : Number(raw);
        draft[ri] = v != null && Number.isFinite(v) ? v : null;
        // 警告色だけ更新(フォーカスを失わないよう全再描画しない)。
        input.closest(".submit-cell")?.classList.toggle("is-warn", cellWarn(draft, ri, unit));
      });
    });

    root.querySelector<HTMLButtonElement>("[data-send]")?.addEventListener("click", () => {
      if (selectedGroup == null) return;
      const snap = transport.getSnapshot();
      if (!snap.session?.open) return;
      transport.sendSubmission({
        round,
        group: selectedGroup,
        numbers: draft.slice(),
        submittedAt: Date.now(),
      });
      const btn = root.querySelector<HTMLButtonElement>("[data-send]");
      if (btn) {
        btn.textContent = "送信しました ✓";
        btn.classList.add("is-done");
        setTimeout(() => {
          const b = root.querySelector<HTMLButtonElement>("[data-send]");
          if (b) {
            b.textContent = "再送信する";
            b.classList.remove("is-done");
          }
        }, 1500);
      }
    });
  }

  transport.subscribe((snap) => {
    const sig = sessionSig(snap);
    if (sig !== lastSig) {
      lastSig = sig;
      render(snap);
    }
  });
}
