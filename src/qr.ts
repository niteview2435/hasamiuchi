// QR コードを SVG 文字列で返す。CDN は使わず、純 JS の qrcode-generator を
// 自前バンドルする(オフラインでも確実に出す。グラフを手描きするのと同じ方針)。

import qrcode from "qrcode-generator";

/**
 * URL 等の文字列を QR コードの SVG にする。viewBox でスケールするので、
 * 投影でも手元でも CSS 側のサイズ指定だけで自由に拡大できる。
 */
export function qrSvg(data: string, opts: { margin?: number } = {}): string {
  const margin = opts.margin ?? 2;
  const qr = qrcode(0, "M"); // 0 = 型番自動 / M = 誤り訂正レベル中
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  const size = count + margin * 2;

  // 暗モジュールを 1 本の path にまとめる(rect を量産するより軽い)。
  let d = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }
  }

  return (
    `<svg class="qr-svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" ` +
    `role="img" aria-label="QRコード" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    `<path d="${d}" fill="#000"/></svg>`
  );
}
