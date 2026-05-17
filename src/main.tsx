import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// tauri.conf.json 关掉了 dragDropEnabled 以放行 webview 内部 HTML5 drag（tab reorder 用）。
// 副作用：外部文件 drop 到非 React 处理区域会让 WKWebView 导航到 file:// URL 把 SPA 洗掉。
// 这里在 window 级 swallow 兜底，React 内部的 onDrop 仍然先消费、不受影响。
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
