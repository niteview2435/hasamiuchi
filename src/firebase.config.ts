// Firebase(ネット上のデータ置き場)への接続設定。
//
// この apiKey は「秘密鍵」ではなくプロジェクトの識別子で、公開前提の値。
// 実際のガードは Firestore のアクセスルール側で行う(正解は書き込まない等)。
// 参考: https://firebase.google.com/docs/projects/api-keys

export const firebaseConfig = {
  apiKey: "AIzaSyCgnqLsT1pPTF6VQwMD5MwAdDSir6313gM",
  authDomain: "hasamiuchi.firebaseapp.com",
  projectId: "hasamiuchi",
  storageBucket: "hasamiuchi.firebasestorage.app",
  messagingSenderId: "580230832067",
  appId: "1:580230832067:web:a960f170b72339bde82776",
};

/** apiKey が本物なら Firebase を使う。空ならローカル実装にフォールバックする。 */
export const firebaseEnabled = firebaseConfig.apiKey.length > 0;
