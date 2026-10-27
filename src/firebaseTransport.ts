// Firebase(Firestore)版のデータ運び役。src/transport.ts の SubmitTransport と
// 同じ5つ(kind / getSnapshot / subscribe / publishSession / sendSubmission)を
// 満たす。中身だけ Firestore に差し替わる。送信画面・受付画面のコードは変えない。
//
// Firestore の構成(1イベント固定・正解は一切書かない):
//   meta/session                      ← SessionBroadcast
//   submissions/{round}_{group}       ← GroupSubmission
//
// 本番で止めないため、書き込みは投げっぱなし(await しない)で失敗は握りつぶす。
// Firestore は接続中のオフラインでも書き込みを内部キューに溜めて自動再送する。

import { initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase.config";
import type {
  GroupSubmission,
  SessionBroadcast,
  SubmitListener,
  SubmitSnapshot,
  SubmitTransport,
} from "./transport";
import { submissionKey } from "./transport";

function submissionDocId(round: number, group: number): string {
  return `${round}_${group}`;
}

export function createFirebaseTransport(): SubmitTransport {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  let snapshot: SubmitSnapshot = { session: null, submissions: {} };
  const listeners = new Set<SubmitListener>();

  function notify(): void {
    for (const l of listeners) l(snapshot);
  }

  // 司会が公開するセッション(現ラウンド・受付の開閉・お題)を監視する。
  onSnapshot(
    doc(db, "meta", "session"),
    (snap) => {
      snapshot = {
        ...snapshot,
        session: snap.exists() ? (snap.data() as SessionBroadcast) : null,
      };
      notify();
    },
    (err) => console.warn("[hasamiuchi] session 監視に失敗", err),
  );

  // 各グループの送信を監視する。1件変わるたびに全体を作り直す(件数は十数件)。
  onSnapshot(
    collection(db, "submissions"),
    (snap) => {
      const submissions: Record<string, GroupSubmission> = {};
      snap.forEach((d) => {
        const sub = d.data() as GroupSubmission;
        submissions[submissionKey(sub.round, sub.group)] = sub;
      });
      snapshot = { ...snapshot, submissions };
      notify();
    },
    (err) => console.warn("[hasamiuchi] submissions 監視に失敗", err),
  );

  return {
    kind: "firebase",
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    publishSession(session: SessionBroadcast) {
      setDoc(doc(db, "meta", "session"), session).catch((err) =>
        console.warn("[hasamiuchi] セッション公開に失敗(手入力で続行可)", err),
      );
    },
    sendSubmission(sub: GroupSubmission) {
      setDoc(doc(db, "submissions", submissionDocId(sub.round, sub.group)), sub).catch((err) =>
        console.warn("[hasamiuchi] 送信に失敗(再送信してください)", err),
      );
    },
  };
}
