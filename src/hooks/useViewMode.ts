import { useSyncExternalStore } from 'react';

export type ViewMode = 'desktop' | 'mobile';

const QUERY = '(min-width: 1024px) and (pointer: fine)';
const OVERRIDE_KEY = 'wwys:viewMode';

/**
 * 双端分流：不是响应式，是两套布局各自渲染。
 * 允许手动覆盖，方便在 PC 上预览移动端形态，且 PC/移动壳之间可自由切换。
 *
 * 关键：必须是「单一真相源」——AppShell 依据它决定渲染哪个外壳，
 * 而 DesktopShell / MobileShell 里点的切换按钮也走同一个 setMode，
 * 否则只有子壳自己的 state 变、AppShell 不变，就会「切不回去」。
 * 用模块级 store + useSyncExternalStore 保证所有消费者共享同一份 state。
 */
function readOverride(): ViewMode | null {
  const o = localStorage.getItem(OVERRIDE_KEY);
  return o === 'desktop' || o === 'mobile' ? o : null;
}

function mediaMode(): ViewMode {
  return window.matchMedia(QUERY).matches ? 'desktop' : 'mobile';
}

let current: ViewMode = readOverride() ?? mediaMode();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

// 媒体查询变化：仅在用户没有手动覆盖时跟随系统（宽屏/窄屏）
function onMediaChange() {
  if (readOverride() === null) current = mediaMode();
  emit();
}

export function useViewMode(): [ViewMode, (m: ViewMode | null) => void] {
  const mode = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      const mq = window.matchMedia(QUERY);
      mq.addEventListener('change', onMediaChange);
      return () => {
        listeners.delete(cb);
        mq.removeEventListener('change', onMediaChange);
      };
    },
    () => current,
    () => current,
  );

  const setMode = (m: ViewMode | null) => {
    if (m === null) localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, m);
    current = m === null ? mediaMode() : m;
    emit();
  };

  return [mode, setMode];
}
