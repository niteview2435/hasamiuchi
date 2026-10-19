// 状態ストア。localStorage への永続化と、BroadcastChannel による
// 司会ウィンドウ↔投影ウィンドウの同期を担う。
//
// 本番で止めないため、localStorage の読み書きは必ず try/catch で囲む。
// どちらかが失敗してもアプリは動き続ける(メモリ上の state は保つ)。

import type { AppState } from "./types";
import { createDefaultState, STATE_VERSION } from "./types";

const STORAGE_KEY = "hasamiuchi.state.v1";
const CHANNEL_NAME = "hasamiuchi";

type Listener = (state: AppState) => void;

let state: AppState = loadState();
const listeners = new Set<Listener>();

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

if (channel) {
  channel.addEventListener("message", (event) => {
    const data = event.data as { type?: string; state?: AppState };
    if (data?.type === "state" && data.state) {
      state = data.state;
      notify();
    }
  });
}

// BroadcastChannel が無い環境向けの保険(storage イベントは別タブにのみ届く)。
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY && event.newValue) {
    try {
      state = migrate(JSON.parse(event.newValue));
      notify();
    } catch {
      /* 壊れた値は無視 */
    }
  }
});

function migrate(raw: unknown): AppState {
  const parsed = raw as (Partial<AppState> & { settings?: Record<string, unknown> }) | null;
  if (!parsed || parsed.version !== STATE_VERSION || !parsed.settings) {
    return createDefaultState();
  }
  // 旧形式(走者数が全グループ共通の runnerCount)をグループごとの runnerCounts へ移行。
  const s = parsed.settings;
  if (!Array.isArray(s.runnerCounts)) {
    const n = Array.isArray(s.groups) ? s.groups.length : 4;
    const rc = typeof s.runnerCount === "number" && s.runnerCount > 0 ? s.runnerCount : 8;
    s.runnerCounts = Array.from({ length: n }, () => rc);
  }
  delete s.runnerCount;
  return parsed as AppState;
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (error) {
    console.warn("[hasamiuchi] 状態の読み込みに失敗。初期状態で続行します。", error);
  }
  return createDefaultState();
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[hasamiuchi] 状態の保存に失敗。メモリ上では保持しています。", error);
  }
}

function notify(): void {
  for (const listener of listeners) listener(state);
}

export function getState(): AppState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

/** state を書き換える。永続化し、他ウィンドウへブロードキャストし、購読者へ通知する。 */
export function update(mutator: (draft: AppState) => void): void {
  mutator(state);
  persist();
  channel?.postMessage({ type: "state", state });
  notify();
}

/** インポートなどで state を丸ごと差し替える。 */
export function replaceState(next: AppState): void {
  state = next;
  persist();
  channel?.postMessage({ type: "state", state });
  notify();
}

export function exportStateJson(): string {
  return JSON.stringify(state, null, 2);
}

/** JSON 文字列から state を復元する。成功なら true。 */
export function importStateJson(json: string): boolean {
  try {
    const next = migrate(JSON.parse(json));
    replaceState(next);
    return true;
  } catch (error) {
    console.warn("[hasamiuchi] インポートに失敗しました。", error);
    return false;
  }
}
