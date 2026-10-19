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
