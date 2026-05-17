import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

const STORAGE_KEY = 'penraft_updater_state_v1';
const SECOND_REMINDER_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 10 * 1000;

export interface UpdaterState {
  lastSeenVersion: string | null;
  firstNoticeAt: string | null;       // ISO8601
  secondNoticeAt: string | null;
  dismissedVersion: string | null;    // 已完成 2 次提醒后写入
}

export interface PendingUpdate {
  version: string;
  notes?: string;
  date?: string;
  update: Update;
}

function readState(): UpdaterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as UpdaterState;
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

function writeState(s: UpdaterState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* silent */ }
}

function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* silent */ }
}

function emptyState(): UpdaterState {
  return { lastSeenVersion: null, firstNoticeAt: null, secondNoticeAt: null, dismissedVersion: null };
}

/**
 * 检查是否应该提醒用户。
 * 返回 PendingUpdate 表示需要展示 banner；返回 null 表示无需提示。
 *
 * 提醒规则（plan §4 决策）：
 *  1. 已被 dismiss 的版本 → 不再提醒
 *  2. 当前已经是该版本（manifest 版本 === appVersion）→ 清空 state
 *  3. 首次发现新版 → 立即提醒，记录 firstNoticeAt
 *  4. 第二次提醒：距 firstNoticeAt >= 7d 且 secondNoticeAt 未设 → 提醒并写 secondNoticeAt + dismissedVersion
 *  5. 用户点"稍后"在第一次时不写 dismissed（保留 firstNoticeAt 等 7 天）；
 *     在第二次时由 caller 调用 markDismissed()。
 */
export async function checkForUpdate(): Promise<PendingUpdate | null> {
  let update: Update | null = null;
  try {
    update = await check();
  } catch {
    return null;
  }
  if (!update || !update.available) {
    // 没新版本：清掉旧 state（说明用户已升级或撤回了 release）
    const cur = readState();
    if (cur.lastSeenVersion || cur.firstNoticeAt) clearState();
    return null;
  }

  // manifest 给的目标版本
  const v = update.version;
  let appVersion = '';
  try { appVersion = await getVersion(); } catch { /* ignore */ }
  if (appVersion && appVersion === v) {
    clearState();
    return null;
  }

  const state = readState();

  if (state.dismissedVersion === v) {
    // 已经完成 2 次提醒，本版本永不再提
    return null;
  }

  const now = Date.now();
  const payload: PendingUpdate = {
    version: v,
    notes: update.body,
    date: update.date,
    update,
  };

  if (state.lastSeenVersion !== v || !state.firstNoticeAt) {
    // 第 1 次提醒
    writeState({ ...emptyState(), lastSeenVersion: v, firstNoticeAt: new Date(now).toISOString() });
    return payload;
  }

  const firstAt = Date.parse(state.firstNoticeAt);
  if (!Number.isFinite(firstAt)) {
    // state 损坏，重新算第 1 次
    writeState({ ...emptyState(), lastSeenVersion: v, firstNoticeAt: new Date(now).toISOString() });
    return payload;
  }

  if (state.secondNoticeAt) {
    // 第 2 次也已经提过；理论上 dismissedVersion 应该已写。容错：补写并不再提
    writeState({ ...state, dismissedVersion: v });
    return null;
  }

  if (now - firstAt >= SECOND_REMINDER_DELAY_MS) {
    // 第 2 次提醒 → 本次后即标记 dismissed，避免再骚扰
    writeState({ ...state, secondNoticeAt: new Date(now).toISOString(), dismissedVersion: v });
    return payload;
  }

  // 距第 1 次还不到 7 天，本次不提
  return null;
}

/**
 * 用户主动点了"稍后"。
 * 若当前 state 已记录第 1 次（firstNoticeAt）但还没到第 2 次：什么都不做，等 7 天后下次 check。
 * 若已经写了 secondNoticeAt：再点稍后即彻底 dismiss。
 */
export function snooze() {
  const s = readState();
  if (s.secondNoticeAt && s.lastSeenVersion) {
    writeState({ ...s, dismissedVersion: s.lastSeenVersion });
  }
  // 第一次的"稍后"已经在 checkForUpdate 中写好了 firstNoticeAt，无需额外操作。
}

/**
 * 用户主动点了"立即更新"。
 * 下载并安装；完成后重启。任何阶段失败都抛错给 caller 显示。
 */
export async function applyUpdate(
  pending: PendingUpdate,
  onProgress?: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;
  await pending.update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = (event.data as { contentLength?: number }).contentLength ?? null;
        if (onProgress) onProgress(0, total);
        break;
      case 'Progress':
        downloaded += (event.data as { chunkLength: number }).chunkLength;
        if (onProgress) onProgress(downloaded, total);
        break;
      case 'Finished':
        if (onProgress) onProgress(total ?? downloaded, total);
        break;
    }
  });
  // 成功安装：清 state（下次启动 manifest === appVersion 时也会自清，这里只是 best effort）
  clearState();
  await relaunch();
}

/**
 * 在 React 组件中调度：app 启动 10s 后首次 check，之后每 24h 一次。
 * 返回 cleanup 函数。
 */
export function scheduleChecks(callback: (pending: PendingUpdate | null) => void): () => void {
  let cancelled = false;
  let intervalId: number | null = null;
  const run = async () => {
    if (cancelled) return;
    const r = await checkForUpdate();
    if (!cancelled) callback(r);
  };
  const firstTimer = window.setTimeout(() => {
    run();
    intervalId = window.setInterval(run, CHECK_INTERVAL_MS);
  }, FIRST_CHECK_DELAY_MS);
  return () => {
    cancelled = true;
    window.clearTimeout(firstTimer);
    if (intervalId !== null) window.clearInterval(intervalId);
  };
}

// 暴露给 devtools 调试：window.__penraft_updater__.{readState,clearState,checkForUpdate}
declare global {
  interface Window {
    __penraft_updater__?: {
      readState: () => UpdaterState;
      clearState: () => void;
      checkForUpdate: () => Promise<PendingUpdate | null>;
    };
  }
}
if (typeof window !== 'undefined') {
  window.__penraft_updater__ = { readState, clearState, checkForUpdate };
}
