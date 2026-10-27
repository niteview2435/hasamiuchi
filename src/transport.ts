// 第2段階:代表者スマホからの回答送信を運ぶトランスポート層。
//
// 本番で止めないため、通信部分は interface で抽象化し、まずは外部依存の無い
// ローカル実装(BroadcastChannel + localStorage)で動かす。将来 Firebase 実装へ
// 差し替えても、司会画面・送信画面のコードは変えなくて済むようにする。
//
// 運ぶデータは2方向:
//   司会 → 代表者 : SessionBroadcast(現ラウンド・受付の開閉・お題メタ・グループ一覧)
//   代表者 → 司会 : GroupSubmission(そのグループが出した数字)
// 正解は決して載せない。SessionBroadcast のお題は正解を含まない公開サブセット。

import { firebaseEnabled } from "./firebase.config";
import { createFirebaseTransport } from "./firebaseTransport";

/** 送信画面に見せてよいお題情報(正解は含めない)。 */
export interface PublicQuestion {
  title: string;
  hint: string;
  unit: number;
  unitLabel: string;
}

/** 司会が公開する現在の受付状況。 */
export interface SessionBroadcast {
  /** 現在のラウンド(0 始まり)。 */
  round: number;
  /** 受付中なら true。false なら送信画面は送信不可。 */
  open: boolean;
  /** グループ一覧(index = グループ番号)。 */
  groups: { name: string; runnerCount: number }[];
  /** 現ラウンドのお題(正解抜き)。未選択なら null。 */
  question: PublicQuestion | null;
  updatedAt: number;
}

/** 代表者が送信した1グループぶんの数字。 */
export interface GroupSubmission {
  round: number;
  group: number;
  numbers: (number | null)[];
  submittedAt: number;
}

export interface SubmitSnapshot {
  session: SessionBroadcast | null;
  /** key = `${round}:${group}`。同じグループの再送信は上書きする。 */
  submissions: Record<string, GroupSubmission>;
}

export type SubmitListener = (snapshot: SubmitSnapshot) => void;

export interface SubmitTransport {
  readonly kind: "local" | "firebase";
  getSnapshot(): SubmitSnapshot;
  subscribe(listener: SubmitListener): () => void;
  /** 司会が受付状況を公開する。 */
  publishSession(session: SessionBroadcast): void;
  /** 代表者が自グループの数字を送る。 */
  sendSubmission(sub: GroupSubmission): void;
}

export function submissionKey(round: number, group: number): string {
  return `${round}:${group}`;
}

// ---- ローカル実装(BroadcastChannel + localStorage)-----------------------
//
// 同一ブラウザの別タブ・別ウィンドウ間で同期する(state.ts と同じ仕組み)。
// 別端末(本物のスマホ)へは届かないため、これはあくまで動作確認・リハーサル用。
// 本番のクロス端末同期は Firebase 実装で置き換える。

const STORAGE_KEY = "hasamiuchi.submit.v1";
const CHANNEL_NAME = "hasamiuchi.submit";

function emptySnapshot(): SubmitSnapshot {
  return { session: null, submissions: {} };
}

function loadSnapshot(): SubmitSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SubmitSnapshot>;
      return {
        session: parsed.session ?? null,
        submissions: parsed.submissions ?? {},
      };
    }
  } catch (error) {
    console.warn("[hasamiuchi] 受付状態の読み込みに失敗。空で続行します。", error);
  }
  return emptySnapshot();
}

export function createLocalTransport(): SubmitTransport {
  let snapshot = loadSnapshot();
  const listeners = new Set<SubmitListener>();

  const channel: BroadcastChannel | null =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn("[hasamiuchi] 受付状態の保存に失敗。メモリ上では保持しています。", error);
    }
  }

  function notify(): void {
    for (const l of listeners) l(snapshot);
  }

  function broadcast(): void {
    channel?.postMessage({ type: "submit", snapshot });
  }

  if (channel) {
    channel.addEventListener("message", (event) => {
      const data = event.data as { type?: string; snapshot?: SubmitSnapshot };
      if (data?.type === "submit" && data.snapshot) {
        snapshot = data.snapshot;
        notify();
      }
    });
  }

  // BroadcastChannel の無い環境向けの保険(別タブにのみ届く)。
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        snapshot = JSON.parse(event.newValue) as SubmitSnapshot;
        notify();
      } catch {
        /* 壊れた値は無視 */
      }
    }
  });

  return {
    kind: "local",
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    publishSession(session) {
      snapshot = { ...snapshot, session };
      persist();
      broadcast();
      notify();
    },
    sendSubmission(sub) {
      snapshot = {
        ...snapshot,
        submissions: {
          ...snapshot.submissions,
          [submissionKey(sub.round, sub.group)]: sub,
        },
      };
      persist();
      broadcast();
      notify();
    },
  };
}

// ---- ファクトリ -----------------------------------------------------------
//
// 設定(firebase.config.ts)に apiKey があれば Firebase 版を使い、別端末間で
// 同期する。無ければ、または初期化に失敗したら、同一ブラウザ内だけのローカル版へ
// フォールバックする(本番で止めないため)。

let instance: SubmitTransport | null = null;

export function getTransport(): SubmitTransport {
  if (instance) return instance;
  if (firebaseEnabled) {
    try {
      instance = createFirebaseTransport();
      return instance;
    } catch (error) {
      console.warn("[hasamiuchi] Firebase 初期化に失敗。ローカル版で続行します。", error);
    }
  }
  instance = createLocalTransport();
  return instance;
}
