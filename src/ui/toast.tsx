/**
 * 极简 toast —— 零依赖、零后端，满足「操作后给反馈」的基本诉求。
 * 全站共用一个 ToastProvider，任何组件用 useToast() 即可弹提示。
 *
 * 风格跟随设计 token：浅纸底卡片 + 语义色左边线 + 圆形图标。
 * 自动 3.2s 消失，点击可立即关闭。
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import s from './toast.module.css';

export type ToastKind = 'success' | 'error' | 'warn' | 'info';

interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}

type ToastFn = (msg: string, kind?: ToastKind) => void;

const ToastContext = createContext<ToastFn>(() => {});

/** 任意组件内调用以弹出一个提示 */
export function useToast(): ToastFn {
  return useContext(ToastContext);
}

const ICONS: Record<ToastKind, string> = {
  success: '✓',
  error: '✕',
  warn: '!',
  info: 'i',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const tm = timers.current[id];
    if (tm) clearTimeout(tm);
    delete timers.current[id];
  }, []);

  const toast = useCallback<ToastFn>(
    (msg, kind = 'info') => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, msg, kind }]);
      timers.current[id] = setTimeout(() => remove(id), 3200);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={s.root} role="status" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`${s.toast} ${s[t.kind]}`}
            onClick={() => remove(t.id)}
            title="点击关闭"
          >
            <span className={s.icon}>{ICONS[t.kind]}</span>
            <span className={s.msg}>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
