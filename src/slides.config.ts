// ============================================================================
// スライドの編集ファイル(ここだけ直せば見た目が変わる)
// ----------------------------------------------------------------------------
// 対象は「表紙」(COVER)と「ルール説明」(SLIDES)の 2 つ。
//
// ・キャンバスは横 CANVAS.w × 縦 CANVAS.h(既定 1600×900)。左上が (0,0)。
//   x は右へ、y は下へ増える。
// ・`pnpm dev` を起動したまま保存すると投影ウィンドウに即反映される。
// ・色は "ink"(黒)/ "accent"(朱)/ "muted"(灰)/ "paper"(白抜き)。
// ・weight は 700(太)/ 900(極太)。align は "start"(左)/ "middle"(中央)/ "end"(右)。
//
// ■ 1 スライドごとの編集(SLIDES の各ブロック)
//   name     … 一覧・ドットの名前
//   group    … 同じ文字列を付けた連続スライドを「1 枚」として扱う(ドット・一覧・
//              カウンタ上は 1 ページ分)。編集は 1 スライドずつのまま、進行は中で
//              1 人ずつ数字が増えていく。ページ名には group の文字列を使う
//   title    … 見出し。{ text } だけでも可。x/y/size/color/weight/align を足せば位置も変えられる
//   body     … 本文。{ lines: ["1行目","2行目"] }。x/y/gap/size も上書き可(1要素=1行、自動改行なし)
//   question … true でお題(富士山…)を表示。{ x, y, size, … } で位置・サイズも変えられる
//   numbers  … 数字の並びを出すとき。{ show: 何人目まで, answer: 正解線を出すか }
//              位置を変えたいスライドだけ railX / topY / numberX などを足して上書きできる
//   extras   … 自由配置の部品(吹き出し・注記・比較図など)。下の El を並べる
//
//   ※ title/body/numbers の位置を省略したときは、下の DEFAULT_* / LADDER が使われる。
//     「全スライドまとめて動かしたい」→ DEFAULT_* / LADDER を変える。
//     「このスライドだけ動かしたい」→ そのスライドの title/body/numbers に x/y 等を足す。
//   ※ 具体例の数字そのもの(6 人の数字・正解)は EXAMPLE に 1 か所でまとめてある。
// ============================================================================

export type Color = "ink" | "accent" | "muted" | "paper";
export type Align = "start" | "middle" | "end";

export interface Txt {
  text: string;
  x: number;
  y: number;
  size: number;
  align?: Align;
  color?: Color;
  weight?: 700 | 900;
  mono?: boolean; // 数字向けの等幅フォント
}

/** 自由に置ける部品。extras や COVER に並べる。 */
export type El =
  | ({ kind: "text" } & Txt)
  // 人のアイコン。x=中心、y=頭の上端、size=全体の高さ。active=朱で強調。
  | { kind: "person"; x: number; y: number; size: number; active?: boolean }
  // 横線。number=数字の線 / active=朱の太線 / answer=朱の破線(正解線)/ thin=細い灰線。
  | { kind: "hline"; x1: number; x2: number; y: number; style?: "number" | "active" | "answer" | "thin" }
  // 縦線(数字どうしをつなぐ線)。
  | { kind: "vline"; x: number; y1: number; y2: number }
  // 四角。fill="band"(朱の薄い帯)/ "accent"(朱ベタ)/ "none"。
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: "band" | "accent" | "none"; stroke?: boolean }
  // 朱のバッジ(四角＋白抜き文字)。
  | { kind: "badge"; x: number; y: number; w: number; h: number; text: string; size: number };

// ---- 1 スライドの形 --------------------------------------------------------

export interface TitleSpec {
  text: string;
  x?: number;
  y?: number;
  size?: number;
  color?: Color;
  weight?: 700 | 900;
  align?: Align;
}
export interface BodySpec {
  lines: string[];
  x?: number;
  y?: number; // 1 行目の y
  gap?: number; // 行間
  size?: number;
  color?: Color;
  weight?: 700 | 900;
}
/** お題(富士山…)の表示。true で既定位置。位置・サイズを変えたいスライドは項目を足す。 */
export interface QuestionSpec {
  text?: string; // 省略時は「お題:(EXAMPLE.question)」
  x?: number;
  y?: number;
  size?: number;
  color?: Color;
  weight?: 700 | 900;
  align?: Align;
}
/** 数字の並び。show / answer に加えて、位置を変えたいスライドだけ下の項目を足す。 */
export interface NumbersSpec {
  show: number; // 何人目まで出すか(0〜人数)
  answer?: boolean; // 正解線と帯を出すか
  railX?: number;
  topY?: number; // 一番大きい数字の y(上)
  bottomY?: number; // 一番小さい数字の y(下)
  rungHalf?: number; // 横線の半分の長さ
  personX?: number;
  personSize?: number;
  personLabelSize?: number;
  personLabelDy?: number;
  numberX?: number;
  numberSize?: number;
  answerPadLeft?: number;
  answerPadRight?: number;
  answerLabelSize?: number;
  answerLabelDy?: number;
  answerLabelGap?: number; // 正解線の右端から「正解」ラベルまでの横の間
}
export interface Slide {
  name: string;
  group?: string; // 同じ値の連続スライドを 1 ページとしてまとめる(ドット・一覧用)
  title: TitleSpec;
  body: BodySpec;
  question?: boolean | QuestionSpec;
  numbers?: NumbersSpec;
  extras?: El[];
}

// ============================================================================
// 共通設定(省略時に使われる既定値)
// ============================================================================

export const CANVAS = { w: 1600, h: 900 };

/** 説明スライド左上の小見出し。 */
export const KICKER: Txt = { text: "ルール説明", x: 90, y: 86, size: 38, color: "accent", weight: 900 };

/** タイトルの既定位置。 */
export const DEFAULT_TITLE = { x: 90, y: 240, size: 70, weight: 900 as const, color: "ink" as const };
/** 本文の既定位置。 */
export const DEFAULT_BODY = { x: 90, y: 330, gap: 90, size: 50, weight: 700 as const, color: "ink" as const };
/** お題表示の既定位置。 */
export const DEFAULT_QUESTION: Txt = { text: "", x: 90, y: 760, size: 38, weight: 900 };

/**
 * 自動送り:「1人目」のスライドが出たら、そこから「最後の人」まで
 * この秒数ごとに勝手に次へ進む(クリック不要)。
 * sec を 0 にすると自動送りを止めて、手動(戻る/次へ)だけにする。
 */
export const AUTO_ADVANCE = { sec: 1.4 };

/** 数字の並び(右側)の既定レイアウト。 */
export const LADDER = {
  railX: 1150,
  topY: 150,
  bottomY: 780,
  rungHalf: 120,
  personX: 955,
  personSize: 92,
  personLabelSize: 23,
  personLabelDy: 69,
  numberX: 1300,
  numberSize: 40,
  answerPadLeft: 20, // 左は人に被らない程度に短く
  answerPadRight: 70,
  answerLabelSize: 40,
  answerLabelDy: 14, // 線に対して縦中央に揃える
  answerLabelGap: 20, // 線の右に「正解」を置く
};

/** 具体例の数字(1 か所で管理。全スライド共通)。 */
export const EXAMPLE = {
  question: "富士山の年間登山者数は?",
  answer: 200_000,
  answerText: "正解",
  people: [
    { label: "１人目", value: 100_000 },
    { label: "２人目", value: 150_000 },
    { label: "３人目", value: 180_000 },
    { label: "４人目", value: 190_000 },
    { label: "５人目", value: 210_000 },
    { label: "６人目(最後)", value: 400_000 },
  ],
  bracket: [3, 4] as [number, number], // 190,000 と 210,000 の間に 200,000
};

// ============================================================================
// 表紙スライド(投影が「ブランク」のときに出る)
// すべて自由配置。文字・位置・サイズを好きに変えてよい。
// ============================================================================

export const COVER: { elements: El[] } = {
  elements: [
    { kind: "text", text: "チーム対抗・数字当て", x: 120, y: 300, size: 46, color: "muted", weight: 700 },
    { kind: "text", text: "ハサミウチ", x: 115, y: 540, size: 190, weight: 900 },
    { kind: "text", text: "― 刻むか、跳ぶか ―", x: 130, y: 680, size: 72, color: "accent", weight: 900 },
  ],
};

// ============================================================================
// ルール説明スライド(1 ブロック = 1 スライド)
// ============================================================================

export const SLIDES: Slide[] = [
  // 0 --------------------------------------------------------------------
  {
    name: "ゲームの流れ",
    title: { text: "ゲームの流れ" },
    body: {
      x: 90,
      y: 400,
      lines: [
        "1人ずつ順番に数字を言って、正解を2つの数字ではさみます。",
        "ルールは「前の人より大きい数字を出すこと」",
      ],
    },
    question: { x: 90, y: 700, size: 50 },
    numbers: { show: 0 },
  },
  // 1 --------------------------------------------------------------------
  {
    name: "1人目",
    group: "1人ずつ数字を出す",
    title: { text: "１人目" },
    body: { x: 90, y: 420, lines: ["前の人より大きい数字を出す。"] },
    question: { x: 90, y: 700, size: 43 },
    numbers: { show: 1 },
  },
  // 2 --------------------------------------------------------------------
  {
    name: "2人目",
    group: "1人ずつ数字を出す",
    title: { text: "２人目" },
    body: { x: 90, y: 420, lines: ["前の人より大きい数字を出す。"] },
    question: { x: 90, y: 700, size: 43 },
    numbers: { show: 2 },
  },
  // 3 --------------------------------------------------------------------
  {
    name: "3人目",
    group: "1人ずつ数字を出す",
    title: { text: "３人目" },
    body: { x: 90, y: 420, lines: ["前の人より大きい数字を出す。"] },
    question: { x: 90, y: 700, size: 43 },
    numbers: { show: 3 },
  },
  // 4 --------------------------------------------------------------------
  {
    name: "4人目",
    group: "1人ずつ数字を出す",
    title: { text: "４人目" },
    body: { x: 90, y: 420, lines: ["前の人より大きい数字を出す。"] },
    question: { x: 90, y: 700, size: 43 },
    numbers: { show: 4 },
  },
  // 5 --------------------------------------------------------------------
  {
    name: "5人目",
    group: "1人ずつ数字を出す",
    title: { text: "５人目" },
    body: { x: 90, y: 420, lines: ["前の人より大きい数字を出す。"] },
    question: { x: 90, y: 700, size: 43 },
    numbers: { show: 5 },
  },
  // 6 --------------------------------------------------------------------
  {
    name: "6人目(最後)",
    group: "1人ずつ数字を出す",
    title: { text: "６人目(最後)" },
    body: { x: 90, y: 420, lines: ["最後の人。", "これで数字がそろった!"] },
    question: { x: 90, y: 700, size: 43 },
    numbers: { show: 6 },
  },
  // 7 --------------------------------------------------------------------
  {
    name: "正解発表",
    title: { text: "正解発表" },
    body: { x: 90, y: 420, lines: ["正解は 200,000 人！", "４人目と５人目の間！", "お見事！"] },
    numbers: { show: 6, answer: true },
  },
  // 8 せまい/ひろい 比較 --------------------------------------------------
  {
    name: "せまく挟むほど高得点",
    title: { text: "せまくはさむほど高得点" },
    body: { x: 90, y: 450, lines: ["はさんだ幅がせまいほど点は高い。", "大きく開いていると、低くなる。"] },
    extras: [
      // せまい
      { kind: "rect", x: 1040, y: 360, w: 120, h: 80, fill: "band" },
      { kind: "vline", x: 1100, y1: 360, y2: 440 },
      { kind: "hline", x1: 1040, x2: 1160, y: 360, style: "number" },
      { kind: "hline", x1: 1040, x2: 1160, y: 440, style: "number" },
      { kind: "hline", x1: 1016, x2: 1184, y: 400, style: "answer" },
      { kind: "text", text: "せまい", x: 1100, y: 620, size: 46, align: "middle", color: "accent", weight: 900 },
      { kind: "text", text: "高得点", x: 1100, y: 682, size: 32, align: "middle", color: "muted" },
      // ひろい
      { kind: "rect", x: 1340, y: 250, w: 120, h: 300, fill: "band" },
      { kind: "vline", x: 1400, y1: 250, y2: 550 },
      { kind: "hline", x1: 1340, x2: 1460, y: 250, style: "number" },
      { kind: "hline", x1: 1340, x2: 1460, y: 550, style: "number" },
      { kind: "hline", x1: 1316, x2: 1484, y: 400, style: "answer" },
      { kind: "text", text: "ひろい", x: 1400, y: 620, size: 40, align: "middle", weight: 900 },
      { kind: "text", text: "低得点", x: 1400, y: 682, size: 32, align: "middle", color: "muted" },
    ],
  },
  // 9 はさめた/外れ -------------------------------------------------------
  {
    name: "はさめないと0点",
    title: { text: "はさめないと０点" },
    body: { x: 90, y: 440, lines: ["2つの数字の間に正解が", "入っていれば点になる。", "でも全部が下や上だと0点。"] },
    extras: [
      // とどかない(全部、正解線より下)
      { kind: "text", text: "0点", x: 1000, y: 300, size: 44, align: "middle", color: "accent", weight: 900 },
      { kind: "hline", x1: 920, x2: 1080, y: 360, style: "answer" },
      { kind: "vline", x: 1000, y1: 440, y2: 580 },
      { kind: "hline", x1: 940, x2: 1060, y: 440, style: "number" },
      { kind: "hline", x1: 940, x2: 1060, y: 510, style: "number" },
      { kind: "hline", x1: 940, x2: 1060, y: 580, style: "number" },
      { kind: "text", text: "とどかない", x: 1000, y: 690, size: 30, align: "middle", color: "muted" },
      // はさめた(中央)
      { kind: "rect", x: 1140, y: 320, w: 120, h: 120, fill: "band" },
      { kind: "vline", x: 1200, y1: 320, y2: 440 },
      { kind: "hline", x1: 1140, x2: 1260, y: 320, style: "number" },
      { kind: "hline", x1: 1140, x2: 1260, y: 440, style: "number" },
      { kind: "hline", x1: 1116, x2: 1284, y: 380, style: "answer" },
      { kind: "text", text: "はさめた", x: 1200, y: 610, size: 40, align: "middle", color: "accent", weight: 900 },
      { kind: "text", text: "点が入る", x: 1200, y: 690, size: 30, align: "middle", color: "muted" },
      // とびこえ(全部、正解線より上)
      { kind: "vline", x: 1400, y1: 180, y2: 320 },
      { kind: "hline", x1: 1340, x2: 1460, y: 180, style: "number" },
      { kind: "hline", x1: 1340, x2: 1460, y: 250, style: "number" },
      { kind: "hline", x1: 1340, x2: 1460, y: 320, style: "number" },
      { kind: "hline", x1: 1320, x2: 1480, y: 380, style: "answer" },
      { kind: "text", text: "0点", x: 1400, y: 440, size: 44, align: "middle", color: "accent", weight: 900 },
      { kind: "text", text: "とびこえ", x: 1400, y: 690, size: 30, align: "middle", color: "muted" },
    ],
  },
  // 10 ピタリ賞 -----------------------------------------------------------
  {
    name: "ピタリ賞",
    title: { text: "ピタリ賞" },
    body: { x: 90, y: 440, lines: ["正解ピッタリの数字を", "出せた人がいれば、", "ボーナス点！"] },
    extras: [
      { kind: "hline", x1: 905, x2: 1405, y: 490, style: "answer" },
      { kind: "text", text: "正解", x: 905, y: 460, size: 38, color: "accent", weight: 900 },
      { kind: "person", x: 1155, y: 270, size: 130, active: true },
      { kind: "hline", x1: 1065, x2: 1245, y: 490, style: "active" },
      { kind: "badge", x: 1030, y: 650, w: 250, h: 100, text: "ピタリ賞！", size: 44 },
    ],
  },
  // 11 相談のルール -------------------------------------------------------
  {
    name: "相談のルール",
    title: { text: "相談してOK" },
    body: {
      x: 90,
      y: 440,
      lines: ["チーム内で相談しながら", "数字を決めてOK。", "ただし話すのは「作戦」だけ。"],
    },
    extras: [
      // 相談する2人(赤い帯の中央 x=1190 にそろえる)
      { kind: "person", x: 1120, y: 150, size: 130 },
      { kind: "person", x: 1260, y: 150, size: 130 },
      { kind: "text", text: "チームで相談", x: 1190, y: 350, size: 40, align: "middle", color: "muted" },
      // ○ 作戦の相談はOK
      { kind: "text", text: "○ 作戦の相談はOK", x: 900, y: 430, size: 42, color: "accent", weight: 900 },
      { kind: "rect", x: 900, y: 455, w: 580, h: 85, fill: "band" },
      { kind: "text", text: "「刻む? 跳ぶ?」", x: 925, y: 512, size: 36, weight: 700 },
      // × 数字そのものはナシ
      { kind: "text", text: "× 数字そのものはナシ", x: 900, y: 650, size: 42, color: "muted", weight: 900 },
      { kind: "rect", x: 900, y: 675, w: 580, h: 85, fill: "none", stroke: true },
      { kind: "text", text: "「190,000にしよう」", x: 925, y: 732, size: 36, color: "muted", weight: 700 },
    ],
  },
  // 12 単位に注意 ---------------------------------------------------------
  {
    name: "単位に注意",
    title: { text: "単位に注意" },
    body: {
      x: 90,
      y: 440,
      lines: ["答えは「回答単位」の", "きざみで書く。"],
    },
    extras: [
      // お題の「回答単位」カードと、のぞき込む人
      { kind: "person", x: 860, y: 175, size: 110, active: true },
      { kind: "rect", x: 970, y: 150, w: 440, h: 150, fill: "none", stroke: true },
      { kind: "text", text: "回答単位", x: 995, y: 205, size: 32, color: "accent", weight: 900 },
      { kind: "text", text: "10 店", x: 1190, y: 268, size: 64, align: "middle", weight: 900 },
      // ○ 10店きざみ
      { kind: "text", text: "○ 10店ずつで答える", x: 810, y: 440, size: 42, color: "accent", weight: 900 },
      { kind: "rect", x: 810, y: 465, w: 600, h: 85, fill: "band" },
      { kind: "text", text: "20店・30店・1,900店", x: 835, y: 522, size: 40, weight: 700 },
      // × 中途半端な数はダメ
      { kind: "text", text: "× 中途半端な数はダメ", x: 810, y: 650, size: 42, color: "muted", weight: 900 },
      { kind: "rect", x: 810, y: 675, w: 600, h: 85, fill: "none", stroke: true },
      { kind: "text", text: "21店・195店 はナシ", x: 835, y: 732, size: 40, color: "muted", weight: 700 },
    ],
  },
  // 13 まとめ -------------------------------------------------------------
  {
    name: "まとめ",
    title: { text: "刻むか、跳ぶか。" },
    body: { x: 90, y: 330, lines: ["安全にきざむ?", "それとも思いきって跳ぶ?", "チームの作戦しだい。", "さあ、はじめよう。"] },
    numbers: { show: 6, answer: true },
  },
];
