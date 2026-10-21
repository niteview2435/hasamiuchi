// 見出し用の太ゴシックを self-host(オフラインでも確実に出る)。本文はシステムフォント。
import "@fontsource/zen-kaku-gothic-new/700.css";
import "@fontsource/zen-kaku-gothic-new/900.css";
import "./style.css";
import { mountControl } from "./control";
import { mountProjection } from "./projection";

const app = document.querySelector<HTMLDivElement>("#app");
if (app) {
  const isProjection = new URLSearchParams(location.search).get("view") === "projection";
  document.body.classList.add(isProjection ? "view-projection" : "view-control");
  if (isProjection) {
    document.title = "ハサミウチ(投影)";
    mountProjection(app);
  } else {
    mountControl(app);
  }
}
