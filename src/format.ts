// 表示用の整形ヘルパー。

export function formatNumber(n: number): string {
  return n.toLocaleString("ja-JP");
}

export function formatScore(n: number): string {
  return n.toFixed(1);
}

/** 比 r を "×1.105" のように整形(末尾の余分な0は落とす)。 */
export function formatRatio(r: number): string {
  const s = r.toFixed(3).replace(/\.?0+$/, "");
  return `×${s}`;
}
