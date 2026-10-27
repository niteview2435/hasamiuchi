// 見出し用の太ゴシックを self-host(オフラインでも確実に出る)。本文はシステムフォント。
import "@fontsource/zen-kaku-gothic-new/700.css";
import "@fontsource/zen-kaku-gothic-new/900.css";
// 補足スライドの数式用(KaTeX をフォントごと self-host。CDN は使わない)。
import "katex/dist/katex.min.css";
import "./style.css";
import { mountControl } from "./control";
import { mountProjection } from "./projection";
import { mountSubmit } from "./submit";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  const view = new URLSearchParams(location.search).get("view");
  if (view === "projection") {
    document.body.classList.add("view-projection");
    document.title = "ハサミウチ(投影)";
    mountProjection(app);
  } else if (view === "submit") {
    document.body.classList.add("view-submit");
    mountSubmit(app);
  } else {
    document.body.classList.add("view-control");
    mountControl(app);
  }
}
