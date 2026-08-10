import { create } from 'zustand';

/** 右栏详情面板是多态的：选中什么就展开什么 */
export type Inspector =
  | { type: 'none' }
  | { type: 'poi'; id: string }
  | { type: 'item'; id: string }
  | { type: 'day'; id: string };

interface WorkbenchState {
  selectedDate: string | null;
  inspector: Inspector;
  cityFilter: string | null;
  keyword: string;
  excludeTags: string[];
  showSanity: boolean;

  setSelectedDate: (d: string | null) => void;
  inspect: (i: Inspector) => void;
  closeInspector: () => void;
  setCityFilter: (c: string | null) => void;
  setKeyword: (k: string) => void;
  toggleExcludeTag: (t: string) => void;
  toggleSanity: () => void;
}

const SESSION_KEY = 'wwys:workbench';

function restore(): Partial<WorkbenchState> {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}') as Partial<WorkbenchState>;
  } catch {
    return {};
  }
}

const saved = restore();

/** 做攻略经常刷新页面，选中日期与筛选条件持久化到 sessionStorage，刷新不丢上下文 */
function persist(s: WorkbenchState): void {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      selectedDate: s.selectedDate,
      cityFilter: s.cityFilter,
      excludeTags: s.excludeTags,
    }),
  );
}

export const useWorkbench = create<WorkbenchState>((set, get) => ({
  selectedDate: saved.selectedDate ?? null,
  inspector: { type: 'none' },
  cityFilter: saved.cityFilter ?? null,
  keyword: '',
  excludeTags: saved.excludeTags ?? [],
  showSanity: true,

  setSelectedDate: (d) => {
    set({ selectedDate: d });
    persist(get());
  },
  inspect: (i) => set({ inspector: i }),
  closeInspector: () => set({ inspector: { type: 'none' } }),
  setCityFilter: (c) => {
    set({ cityFilter: c });
    persist(get());
  },
  setKeyword: (k) => set({ keyword: k }),
  toggleExcludeTag: (t) => {
    const cur = get().excludeTags;
    set({ excludeTags: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] });
    persist(get());
  },
  toggleSanity: () => set({ showSanity: !get().showSanity }),
}));
