/**
 * 对话式建行程：PC 工作台内的 AI 对话抽屉。
 *
 * 设计要点：
 * - 模型只在「提建议」——它返回 OpenAI tool_calls，前端映射到你已有的 mutation 真正落库
 *   （addDay / addItem / updateItem / upsertExpense），复用乐观更新 + RLS 登录态。
 * - 模型从不直接读写数据库；落库逻辑全是你已审过的现有函数。
 * - 请求经 supabase client 的 functions.invoke 转发到 chat-proxy Edge Function，
 *   后者持有 DEEPSEEK_API_KEY（secret，绝不下发浏览器），并默认校验 JWT（仅登录用户可用）。
 */
import { useRef, useState } from 'react';
import { isSupabaseConfigured, supabase, useSession } from '../../data/supabase-client';
import { useTripBundle, useTripMutations } from './queries';
import { useWorldIndex } from '../world/queries';
import { todayStr } from '../../domain/date';
import type {
  AddItemInput,
  Expense,
  ItemKind,
  ItemStatus,
  TransportMode,
  TripBundle,
  TripItem,
  WorldIndex,
} from '../../data/types';
import s from './ChatPanel.module.css';

type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface DispMsg {
  id: string;
  role: 'user' | 'assistant' | 'note';
  text: string;
}

type ToolResult = { ok: boolean; summary: string };

// OpenAI 兼容的工具定义；模型据此产出结构化意图，前端映射成现有 mutation。
const TOOLS: unknown[] = [
  {
    type: 'function',
    function: {
      name: 'add_trip_item',
      description:
        '在指定日期添加一条行程条目（景点 POI / 交通 / 备注）。日期不存在会自动建当天。',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'ISO 日期，如 2026-09-23' },
          kind: { type: 'string', enum: ['poi', 'transport', 'note'] },
          poiId: { type: 'string', description: '景点 id，如 poi-colosseum；kind=poi 时优先用' },
          poiName: { type: 'string', description: '景点中文名兜底，匹配不到世界库时当自定义景点' },
          cityId: { type: 'string', description: '当天所在城市 id（建新天时设置），如 city-rome' },
          transportMode: {
            type: 'string',
            enum: ['train', 'flight', 'bus', 'ferry', 'car', 'walk', 'other'],
          },
          fromCityId: { type: 'string', description: '交通出发城市 id' },
          toCityId: { type: 'string', description: '交通到达城市 id' },
          startTime: { type: 'string', description: '开始时间 HH:MM' },
          endTime: { type: 'string', description: '结束时间 HH:MM' },
          status: {
            type: 'string',
            enum: ['wishlist', 'candidate', 'confirmed', 'visited', 'dropped'],
          },
          note: { type: 'string' },
          customTitle: { type: 'string', description: '交通/备注的标题；不填则自动生成' },
        },
        required: ['date', 'kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_expense',
      description: '记一笔账。splitMode=aa 共同分摊，personal 个人自付（不影响谁欠谁）。',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: '消费日期 ISO，如 2026-09-23' },
          category: {
            type: 'string',
            enum: ['ticket', 'transport', 'food', 'stay', 'shopping', 'other'],
          },
          title: { type: 'string' },
          amountCents: { type: 'integer', description: '金额，单位：分（如 45 欧 = 4500）' },
          currency: { type: 'string', description: '币种，如 EUR / CHF / CNY / USD' },
          payerMemberId: { type: 'string', description: '付款成员 id' },
          payerName: { type: 'string', description: '付款人名字兜底，按 members 匹配' },
          splitMode: { type: 'string', enum: ['aa', 'personal'] },
          note: { type: 'string' },
        },
        required: ['category', 'title', 'amountCents', 'currency', 'splitMode'],
      },
    },
  },
];

function norm(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '');
}

function uid(): string {
  return crypto.randomUUID();
}

// Supabase JS 在非 2xx 时只给笼统的 "Edge Function returned a non-2xx status code"，
// 真实原因（401/500 的具体 message）藏在 error.context(Response) 里，这里提取出来。
async function describeInvokeError(err: unknown): Promise<string> {
  const e = err as { message?: string; context?: Response };
  let detail = e?.message || String(err);
  const ctx = e?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const j = await ctx.json();
      if (j?.error) detail = typeof j.error === 'string' ? j.error : JSON.stringify(j.error);
      else if (j?.message) detail = String(j.message);
    } catch {
      /* 解析失败就保留原 message */
    }
  }
  return detail;
}

function cityName(index: WorldIndex | undefined, id?: string | null): string {
  if (!id) return '';
  return index?.cities.find((c) => c.id === id)?.name ?? id;
}

export function ChatPanel({ tripId }: { tripId: string }) {
  const { data: bundle } = useTripBundle(tripId);
  const { data: index } = useWorldIndex();
  const mut = useTripMutations(tripId);
  const { user } = useSession();

  const [open, setOpen] = useState(false);
  const [disp, setDisp] = useState<DispMsg[]>([]);
  const [history, setHistory] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ready = isSupabaseConfigured && Boolean(user) && Boolean(supabase);

  // —— 解析工具：城市 / POI / 成员 ——
  function resolvePoi(name: string, cityId?: string): string | undefined {
    const pois = index?.pois ?? [];
    const n = norm(name);
    let hit = pois.find((p) => norm(p.name) === n && (!cityId || p.city === cityId));
    if (!hit) hit = pois.find((p) => norm(p.name) === n);
    if (!hit) hit = pois.find((p) => norm(p.name).includes(n) || n.includes(norm(p.name)));
    return hit?.id;
  }

  function resolveMember(name: string): string | undefined {
    const members = bundle?.members ?? [];
    const n = norm(name);
    return (
      members.find((m) => norm(m.displayName) === n)?.id ??
      members.find((m) => norm(m.displayName).includes(n))?.id
    );
  }

  async function resolveDay(
    date: string,
    cityId: string | null,
    dayCache: Map<string, string>,
  ): Promise<string | null> {
    if (dayCache.has(date)) return dayCache.get(date)!;
    const existing = bundle?.days.find((d) => d.date === date);
    if (existing) {
      dayCache.set(date, existing.id);
      return existing.id;
    }
    const created = await mut.addDay.mutateAsync({ date, cityId });
    dayCache.set(date, created.id);
    return created.id;
  }

  function defaultTransportTitle(args: Record<string, unknown>): string {
    const from = cityName(index, args.fromCityId as string | undefined);
    const to = cityName(index, args.toCityId as string | undefined);
    const modeMap: Record<string, string> = {
      train: '高铁',
      flight: '航班',
      bus: '大巴',
      ferry: '轮渡',
      car: '自驾',
      walk: '步行',
      other: '交通',
    };
    const mode = modeMap[(args.transportMode as string) ?? 'other'] ?? '交通';
    const route = from && to ? `${from}→${to}` : from || to || '';
    return [mode, route].filter(Boolean).join(' ');
  }

  // —— 执行工具 ——
  async function doAddItem(
    args: Record<string, unknown>,
    dayCache: Map<string, string>,
  ): Promise<ToolResult> {
    const date = args.date as string | undefined;
    const kind = args.kind as string | undefined;
    if (!date || !kind) return { ok: false, summary: '缺少 date 或 kind' };

    const dayId = await resolveDay(date, (args.cityId as string) ?? null, dayCache);
    if (!dayId) return { ok: false, summary: `无法建/找 ${date} 这一天` };

    const input: Omit<AddItemInput, 'tripId'> = {
      dayId,
      kind: kind as ItemKind,
      status: (kind === 'transport' ? 'confirmed' : 'candidate') as ItemStatus,
    };

    if (kind === 'poi') {
      let poiId = args.poiId as string | undefined;
      if (!poiId && args.poiName) poiId = resolvePoi(args.poiName as string, args.cityId as string);
      if (poiId) input.poiId = poiId;
      else input.customTitle = (args.poiName as string) ?? (args.customTitle as string) ?? '自定义景点';
    } else if (kind === 'transport') {
      input.customTitle = (args.customTitle as string) || defaultTransportTitle(args);
      input.transportMode = (args.transportMode as TransportMode) ?? 'other';
      input.fromCityId = (args.fromCityId as string) ?? null;
      input.toCityId = (args.toCityId as string) ?? null;
    } else {
      input.customTitle = (args.customTitle as string) ?? (args.note as string) ?? '备注';
    }

    const created = await mut.addItem.mutateAsync(input);

    // addItem 不接时间/备注字段，单独用 updateItem 补
    const patch: Partial<TripItem> = {};
    if (args.startTime) patch.slotStart = args.startTime as string;
    if (args.endTime) patch.slotEnd = args.endTime as string;
    if (args.note && kind === 'note') patch.note = args.note as string;
    if (patch.slotStart || patch.slotEnd || patch.note) {
      await mut.updateItem.mutateAsync({ id: created.id, patch });
    }

    const label =
      input.customTitle ?? (created.poiId ? '景点' : '');
    return { ok: true, summary: `✓ 已添加（${date}）：${label}` };
  }

  async function doAddExpense(
    args: Record<string, unknown>,
    dayCache: Map<string, string>,
  ): Promise<ToolResult> {
    const category = args.category as string;
    const title = args.title as string;
    const amountCents = Number(args.amountCents);
    const currency = args.currency as string;
    const splitMode = args.splitMode === 'personal' ? 'personal' : 'aa';
    if (!category || !title || !Number.isFinite(amountCents) || !currency) {
      return { ok: false, summary: '记账缺少必要字段（category/title/amountCents/currency）' };
    }

    let payerId = args.payerMemberId as string | undefined;
    if (!payerId && args.payerName) payerId = resolveMember(args.payerName as string);
    if (!payerId) payerId = bundle?.members.find((m) => m.role === 'owner')?.id;
    if (!payerId) return { ok: false, summary: '找不到付款人' };

    const dayId = args.date ? await resolveDay(args.date as string, null, dayCache) : null;
    const members = bundle?.members ?? [];
    const shares =
      splitMode === 'personal'
        ? [{ memberId: payerId, weight: 1 }]
        : members.map((m) => ({ memberId: m.id, weight: 1 }));

    const exp: Omit<Expense, 'id'> & { id?: string } = {
      tripId,
      dayId,
      itemId: null,
      category: category as Expense['category'],
      title,
      amountCents,
      currency,
      fxRate: 1,
      payerMemberId: payerId,
      spentAt: (args.date as string) ?? todayStr(),
      note: (args.note as string) ?? null,
      splitMode: splitMode as Expense['splitMode'],
      shares,
    };
    await mut.upsertExpense.mutateAsync(exp);
    return {
      ok: true,
      summary: `✓ 记账：${title} ${(amountCents / 100).toFixed(2)} ${currency}（${
        splitMode === 'aa' ? 'AA 分摊' : '个人自付'
      }）`,
    };
  }

  async function runTool(tc: ToolCall, dayCache: Map<string, string>): Promise<ToolResult> {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || '{}');
    } catch {
      /* 忽略坏 JSON */
    }
    try {
      if (tc.function.name === 'add_trip_item') return await doAddItem(args, dayCache);
      if (tc.function.name === 'add_expense') return await doAddExpense(args, dayCache);
      return { ok: false, summary: `未知工具：${tc.function.name}` };
    } catch (e) {
      return { ok: false, summary: `执行失败：${e instanceof Error ? e.message : String(e)}` };
    }
  }

  function buildSystem(b: TripBundle, idx: WorldIndex | undefined): string {
    const trip = b.trip;
    const cities = (idx?.cities ?? []).map((c) => `- ${c.id} : ${c.name}`).join('\n') || '（无）';
    const pois =
      (idx?.pois ?? [])
        .map((p) => `- ${p.id} : ${p.name}（${cityName(idx, p.city)}）`)
        .join('\n') || '（无）';
    const days =
      (b.days ?? [])
        .map((d) => `- ${d.date}${d.cityId ? `（${cityName(idx, d.cityId)}）` : ''}`)
        .join('\n') || '（暂无）';
    const members =
      (b.members ?? [])
        .map((m) => `- ${m.id} : ${m.displayName}${m.role === 'owner' ? '（队长/本人）' : ''}`)
        .join('\n') || '（无）';

    return `你是「玩无一失」旅行行程助手的对话引擎。用户用自然语言描述想建的行程，你要调用工具把它落到数据库。

# 行程
标题：${trip.title}
起止：${trip.startDate ?? '未定'} ~ ${trip.endDate ?? '未定'}
基准币种：${trip.baseCurrency}

# 可用城市（cityId）
${cities}

# 候选 POI（加景点优先用 poiId）
${pois}

# 当前已建天数
${days}

# 成员（payerMemberId 用 id；"我/自己"=队长）
${members}

# 解析规则
- 日期写法 9.23 / 9月23日 / 9/23 → 转 ISO（如 2026-09-23），按行程起止年份补全年份；超出范围先问用户。
- transportMode：高铁/动车/火车→train；飞机/航班→flight；大巴/巴士→bus；船/轮渡→ferry；自驾/租车→car；步行→walk；其他→other。
- currency：欧/欧元→EUR，瑞郎→CHF，美元→USD，人民币→CNY。
- splitMode：AA/均摊→aa；个人/自付→personal。
- 加景点：优先用 poiId；只有世界库没有时才用 poiName 当自定义景点。
- 交通：必须填 transportMode 与 from/to 城市 id；customTitle 不填会自动生成"方式 起→终"。
- 每完成一批操作，用一句中文告诉用户你加了什么、在哪天。不要罗列原始 JSON。`;
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !ready || !supabase || !bundle || !index) return;
    setInput('');
    setBusy(true);
    setError(null);

    const userDisp: DispMsg = { id: uid(), role: 'user', text };
    const userT: ChatMsg = { role: 'user', content: text };
    const working: ChatMsg[] = [...history, userT];
    const dayCache = new Map<string, string>(
      (bundle.days ?? []).map((d) => [d.date, d.id] as [string, string]),
    );
    const newDisp: DispMsg[] = [userDisp];

    try {
      for (let guard = 0; guard < 6; guard++) {
        const sys: ChatMsg = { role: 'system', content: buildSystem(bundle, index) };
        const { data, error: invErr } = await supabase.functions.invoke('chat-proxy', {
          body: { messages: [sys, ...working], tools: TOOLS, model: 'deepseek-chat' },
        });
        if (invErr) throw new Error(await describeInvokeError(invErr));
        const msg: ChatMsg | undefined = data?.choices?.[0]?.message;
        if (!msg) break;

        working.push(msg);

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          if (msg.content) newDisp.push({ id: uid(), role: 'assistant', text: msg.content });
          break;
        }

        const toolMsgs: ChatMsg[] = [];
        for (const tc of msg.tool_calls) {
          const res = await runTool(tc, dayCache);
          newDisp.push({ id: uid(), role: 'note', text: res.summary });
          toolMsgs.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(res),
          });
        }
        working.push(...toolMsgs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDisp((prev) => [...prev, ...newDisp]);
      setHistory(working.slice(-24));
      setBusy(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9 }));
    }
  }

  if (!open) {
    return (
      <button className={s.fab} onClick={() => setOpen(true)} title="对话建行程" aria-label="对话建行程">
        对话建行程
      </button>
    );
  }

  return (
    <div className={s.drawer} role="dialog" aria-label="对话建行程">
      <div className={s.header}>
        <span className={s.title}>对话建行程</span>
        <button className={s.close} onClick={() => setOpen(false)} aria-label="关闭">
          ×
        </button>
      </div>

      <div className={s.body} ref={scrollRef}>
        {!ready && (
          <div className={s.warn}>请先在右上角登录云端账号，才能使用对话建行程（需调用 AI）。</div>
        )}
        {ready && disp.length === 0 && (
          <div className={s.hint}>
            用大白话告诉我想建什么，例如：
            <br />· 「9.23 罗马坐高铁去佛罗伦萨，下午逛斗兽场」
            <br />· 「记一笔：高铁票 45 欧我付的，AA」
          </div>
        )}
        {disp.map((m) => (
          <div
            key={m.id}
            className={m.role === 'user' ? s.user : m.role === 'note' ? s.note : s.assistant}
          >
            {m.text}
          </div>
        ))}
        {busy && <div className={s.busy}>思考中…</div>}
        {error && <div className={s.warn}>{error}</div>}
      </div>

      <form
        className={s.inputRow}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          className={s.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={ready ? '说点什么…（Enter 发送，Shift+Enter 换行）' : '请先登录云端'}
          disabled={!ready || busy}
          rows={2}
        />
        <button className={s.send} type="submit" disabled={!ready || busy || !input.trim()}>
          发送
        </button>
      </form>
    </div>
  );
}
