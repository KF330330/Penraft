// 跨窗口 tab 拖拽相关阈值，统一在此调优。
// （tab-bar 高度走 CSS 变量 --tab-bar-height，不在这里。）

// 拖到窗口外多少像素仍视为"还在窗内"（防止边缘抖动误触发撕扯）。物理像素。
export const TEAR_OUT_OUTSIDE_MARGIN_PHYS = 20;

// 拖在窗口内、但纵向离开 tab 栏多远视为撕扯（Chrome 风格）。CSS 像素。
export const TEAR_OUT_VERTICAL_THRESHOLD_CSS = 60;
