import { useEffect, useRef } from "react";
import { listen, type Event, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * 订阅 Tauri 事件，处理"未挂载就到达"以及组件卸载时的清理。
 *
 * - `handler` 不进 deps，由内部 ref 保持最新引用，避免每次 render 重订阅。
 * - `enabled` 为 false 时不订阅；变 true 时订阅，变 false 时清理。
 * - 在非 Tauri shell 中 listen 会抛错，吞掉。
 */
export function useTauriListen<T>(
  event: string,
  handler: (e: Event<T>) => void,
  enabled: boolean,
) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    (async () => {
      try {
        const fn = await listen<T>(event, (e) => handlerRef.current(e));
        if (cancelled) fn();
        else unlisten = fn;
      } catch {
        // not running inside Tauri shell — ignore
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [event, enabled]);
}
