/**
 * 打包助手（参考 TripProf 的 Packing Assistant）。
 *
 * 离线优先：清单存在 Trip.packing（随行程读写，不依赖任何后端）。
 * 智能生成依据行程天数 / 目的地货币 / POI 类型标签 / 同行成员给建议草稿；
 * 天气无法联网获取（零成本约束），衣物只按天数给通用数量，不臆测气候。
 *
 * 行李按「人」组织：个人行李每人一份（ownerId = 成员），公共物品只一份
 * （ownerId = null，由 assigneeId 指定谁带）。两端共用（PC 工作台与移动
 * 随身册都切到这个标签）；PC 端按人双列卡片铺满宽屏，窄屏回落单列。
 */
import { useMemo, useState } from 'react';
import type { PackingItem, TripMember } from '../../data/types';
import { useTripBundle, useTripMutations } from './queries';
import { useWorldIndex } from '../world/queries';
import { PACK_CATS, suggestPacking } from '../../domain/trip/packing';
import { climateFor } from '../../domain/trip/climate';
import { useMyMember } from './useMyMember';
import s from './PackingPanel.module.css';
import panel from '../../ui/panel.module.css';

const SHARED = '__shared';

function uid(): string {
  const r =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `pk-${r}`;
}

interface Section {
  key: string;
  title: string;
  isShared: boolean;
  items: PackingItem[];
}

export function PackingPanel({ tripId }: { tripId: string }) {
  const { data: bundle, isLoading } = useTripBundle(tripId);
  const { data: index } = useWorldIndex();
  const mut = useTripMutations(tripId);

  const [draftText, setDraftText] = useState('');
  const [draftCat, setDraftCat] = useState<string>(PACK_CATS[0]);
  /** 新增项的归属：某成员 id 或 '公共' */
  const [draftOwner, setDraftOwner] = useState<string>('me');
  /** 视角：全部（按人分区）/ 我的 */
  const [view, setView] = useState<'all' | 'mine'>('mine');
  /** 顶部工具栏（添加 / 进度 / 气候参考）是否收起，收起后释放下方清单空间 */
  const [collapsed, setCollapsed] = useState(false);

  const items = bundle?.trip.packing ?? [];
  const members = bundle?.members ?? [];
  const me = useMyMember(members);
  const meId = me?.id ?? null;

  /** 智能生成的上下文：从行程与世界库索引推导 */
  const ctx = useMemo(() => {
    if (!bundle || !index) return null;
    const countrySet = new Set<string>();
    for (const d of bundle.days) {
      if (!d.cityId) continue;
      const c = index.cities.find((x) => x.id === d.cityId);
      if (c) countrySet.add(c.country);
    }
    const currencies = new Set<string>();
    for (const code of countrySet) {
      const co = index.countries.find((x) => x.id === code);
      if (co) currencies.add(co.currency);
    }
    const poiSet = new Set(bundle.items.map((i) => i.poiId).filter(Boolean) as string[]);
    const poiTypes = new Set<string>();
    const tags = new Set<string>();
    for (const p of index.pois) {
      if (!poiSet.has(p.id)) continue;
      poiTypes.add(p.type);
      for (const t of p.tags) tags.add(t);
    }
    const month = bundle.trip.startDate
      ? new Date(bundle.trip.startDate).getUTCMonth() + 1
      : undefined;
    return {
      days: Math.max(1, bundle.days.length),
      countries: [...countrySet],
      currencies: [...currencies],
      poiTypes: [...poiTypes],
      tags: [...tags],
      // 个人行李按成员拆分；空数组时生成函数兜底为单人（ownerId=null）
      ownerIds: bundle.members.map((m: TripMember) => m.id),
      month,
    };
  }, [bundle, index]);

  /** 顶部气候参考（按行程月份 + 主要目的地推导，非实时天气） */
  const climateLabel = useMemo(() => {
    if (!ctx || !ctx.month) return null;
    return climateFor(ctx.countries[0] ?? 'fr', ctx.month).label;
  }, [ctx]);

  if (isLoading) return <div className={s.loading}>读取行程…</div>;
  if (!bundle) return <div className={s.loading}>这份行程不在本机，换一份或新建一个</div>;

  function setList(next: PackingItem[]) {
    mut.setPacking.mutate(next);
  }
  function patchItem(id: string, patch: Partial<PackingItem>) {
    setList(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function removeItem(id: string) {
    setList(items.filter((i) => i.id !== id));
  }
  function resolveOwner(sel: string): string | null {
    if (sel === SHARED) return null;
    if (sel === 'me') return meId;
    return sel;
  }
  function addItem(text: string, cat: string, ownerSel: string) {
    const t = text.trim();
    if (!t) return;
    setList([
      ...items,
      {
        id: uid(),
        category: cat,
        text: t,
        done: false,
        ownerId: resolveOwner(ownerSel),
        assigneeId: null,
        note: null,
      },
    ]);
    setDraftText('');
  }
  function generate() {
    if (!ctx) return;
    const suggestions = suggestPacking(ctx);
    setList(
      suggestions.map((sg) => ({
        id: uid(),
        category: sg.category,
        text: sg.text,
        done: false,
        ownerId: sg.ownerId,
        assigneeId: null,
        note: sg.note ?? null,
      })),
    );
  }

  /** 分区：全部=按人 + 公共；我的=我 + 公共 */
  const sections: Section[] = useMemo(() => {
    const shared = items.filter((i) => i.ownerId === null);
    if (view === 'mine') {
      const mine = items.filter((i) => i.ownerId === meId);
      const out: Section[] = [];
      if (mine.length)
        out.push({ key: '__mine', title: me ? `${me.displayName}（我）` : '我的', isShared: false, items: mine });
      if (shared.length) out.push({ key: SHARED, title: '公共物品', isShared: true, items: shared });
      return out;
    }
    const out: Section[] = members.map((m) => ({
      key: m.id,
      title: m.id === meId ? `${m.displayName}（我）` : m.displayName,
      isShared: false,
      items: items.filter((i) => i.ownerId === m.id),
    }));
    if (shared.length) out.push({ key: SHARED, title: '公共物品', isShared: true, items: shared });
    return out;
  }, [items, members, view, meId, me]);

  const doneCount = items.filter((i) => i.done).length;
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <div className={panel.page}>
      <div className={panel.card}>
        <div className={panel.head}>
          <div>
            <div className={panel.title}>打包清单</div>
            <div className={panel.sub}>按人分清单 · 公共物只备一份，离线保存</div>
          </div>
          <div className={s.headTools}>
            <div className={s.viewSwitch}>
              <button
                className={`${s.viewBtn} ${view === 'mine' ? s.viewOn : ''}`}
                onClick={() => setView('mine')}
              >
                我的
              </button>
              <button
                className={`${s.viewBtn} ${view === 'all' ? s.viewOn : ''}`}
                onClick={() => setView('all')}
              >
                全部
              </button>
            </div>
            <span className={s.toolDivider} aria-hidden="true" />
            <button className="btn btn-primary btn-sm" onClick={generate} disabled={!ctx}>
              智能生成
            </button>
          </div>
          <div className={s.climateNote}>
            {climateLabel ? (
              <>
                气候参考（按行程月份推导，非实时）：<b>{climateLabel}</b>
              </>
            ) : (
              <>未设出发日期，衣物按天数给通用数量</>
            )}
          </div>
        </div>

        <div className={panel.body}>
          <div className={`${s.topBar} ${collapsed ? s.collapsed : ''}`}>
            <div className={s.topHead}>
              {!collapsed ? (
                <>
                  <div className={s.topRow}>
                    <input
                      className={s.text}
                      placeholder="添加一项，如「充电线」"
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addItem(draftText, draftCat, draftOwner);
                      }}
                    />
                    <div className={s.progress}>
                      <div className={s.bar}>
                        <div className={s.barFill} style={{ width: `${progress}%` }} />
                      </div>
                      <span className={s.progressText}>
                        {doneCount}/{items.length} 已装（{progress}%）
                      </span>
                    </div>
                  </div>
                  <div className={s.topRow2}>
                    <select
                      className={s.assignee}
                      value={draftCat}
                      onChange={(e) => setDraftCat(e.target.value)}
                      title="分类"
                    >
                      {PACK_CATS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <select
                      className={s.assignee}
                      value={draftOwner}
                      onChange={(e) => setDraftOwner(e.target.value)}
                      title="归属"
                    >
                      <option value="me">我</option>
                      {members
                        .filter((m) => m.id !== meId)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName}
                          </option>
                        ))}
                      <option value={SHARED}>公共</option>
                    </select>
                    <button className="btn btn-sm" onClick={() => addItem(draftText, draftCat, draftOwner)}>
                      添加
                    </button>
                  </div>
                </>
              ) : (
                <div className={s.topRow}>
                  <div className={s.progress}>
                    <div className={s.bar}>
                      <div className={s.barFill} style={{ width: `${progress}%` }} />
                    </div>
                    <span className={s.progressText}>
                      {doneCount}/{items.length} 已装（{progress}%）
                    </span>
                  </div>
                </div>
              )}
            </div>
            <button
              className={s.collapseBtn}
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? '展开工具栏' : '收起工具栏'}
              title={collapsed ? '展开工具栏' : '收起工具栏'}
            >
              {collapsed ? '▾' : '▴'}
            </button>
          </div>

          {sections.length === 0 && (
            <div className={panel.empty}>还没有清单。点右上「智能生成」，或在顶部输入框添加一项。</div>
          )}

          <div className={s.personGrid}>
            {sections.map((sec) => {
              const cats = PACK_CATS.filter((c) => sec.items.some((i) => i.category === c));
              const dN = sec.items.filter((i) => i.done).length;
              return (
                <div key={sec.key} className={s.personBlock}>
                  <div className={s.blockHead}>
                    <span className={sec.isShared ? s.blockShared : ''}>{sec.title}</span>
                    <span className={s.blockProg}>
                      {dN}/{sec.items.length}
                    </span>
                  </div>
                  {sec.items.length === 0 && <div className={s.blockEmpty}>空空如也</div>}
                  {cats.map((cat) => (
                    <div key={cat} className={s.cat}>
                      <div className={s.catHead}>{cat}</div>
                      {sec.items
                        .filter((i) => i.category === cat)
                        .map((it) => (
                          <div key={it.id} className={`${s.row} ${it.done ? s.rowDone : ''}`}>
                            <input
                              type="checkbox"
                              className={s.check}
                              checked={it.done}
                              onChange={() => patchItem(it.id, { done: !it.done })}
                            />
                            <input
                              className={s.text}
                              defaultValue={it.text}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== it.text) patchItem(it.id, { text: v });
                                else if (!v) e.target.value = it.text;
                              }}
                            />
                            {/* 公共项显示「谁带」，个人项隐藏（自己的东西自己负责） */}
                            {it.ownerId === null && (
                              <select
                                className={s.assignee}
                                value={it.assigneeId ?? ''}
                                title="谁带"
                                onChange={(e) => patchItem(it.id, { assigneeId: e.target.value || null })}
                              >
                                <option value="">未指定</option>
                                {members.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.displayName}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button className={s.del} onClick={() => removeItem(it.id)} title="删除">
                              ×
                            </button>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
