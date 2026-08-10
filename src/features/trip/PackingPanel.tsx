/**
 * 打包助手（参考 TripProf 的 Packing Assistant）。
 *
 * 离线优先：清单存在 Trip.packing（随行程读写，不依赖任何后端）。
 * 智能生成依据行程天数 / 目的地货币 / POI 类型标签 / 同行人数给建议草稿；
 * 天气无法联网获取（零成本约束），衣物只按天数给通用数量，不臆测气候。
 *
 * 两端共用（PC 工作台与移动随身册都切到这个标签），单列布局。
 */
import { useMemo, useState } from 'react';
import type { PackingItem } from '../../data/types';
import { useTripBundle, useTripMutations } from './queries';
import { useWorldIndex } from '../world/queries';
import { PACK_CATS, suggestPacking } from '../../domain/trip/packing';
import { climateFor } from '../../domain/trip/climate';
import s from './PackingPanel.module.css';
import panel from '../../ui/panel.module.css';

function uid(): string {
  const r =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `pk-${r}`;
}

export function PackingPanel({ tripId }: { tripId: string }) {
  const { data: bundle, isLoading } = useTripBundle(tripId);
  const { data: index } = useWorldIndex();
  const mut = useTripMutations(tripId);

  const [draftText, setDraftText] = useState('');
  const [draftCat, setDraftCat] = useState<string>(PACK_CATS[0]);

  const items = bundle?.trip.packing ?? [];
  const members = bundle?.members ?? [];

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
      memberCount: bundle.members.length,
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
  function addItem(text: string, cat: string) {
    const t = text.trim();
    if (!t) return;
    setList([
      ...items,
      { id: uid(), category: cat, text: t, done: false, assigneeId: null, note: null },
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
        assigneeId: null,
        note: sg.note ?? null,
      })),
    );
  }

  const doneCount = items.filter((i) => i.done).length;
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  const byCat = PACK_CATS.filter((cat) => items.some((i) => i.category === cat));

  return (
    <div className={panel.page}>
      <div className={panel.card}>
        <div className={panel.head}>
          <div>
            <div className={panel.title}>打包清单</div>
            <div className={panel.sub}>离线清单 · 随行程保存，行前逐项勾选</div>
          </div>
          <button className={`${panel.headAction} btn btn-primary btn-sm`} onClick={generate} disabled={!ctx}>
            智能生成
          </button>
        </div>

        <div className={panel.body}>
        <div className={s.topBar}>
          <div className={s.addRow}>
            <input
              className={s.text}
              placeholder="添加一项，如「充电线」"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addItem(draftText, draftCat);
              }}
            />
            <select className={s.assignee} value={draftCat} onChange={(e) => setDraftCat(e.target.value)}>
              {PACK_CATS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => addItem(draftText, draftCat)}>
              添加
            </button>
          </div>

          <div className={s.progress}>
            <div className={s.bar}>
              <div className={s.barFill} style={{ width: `${progress}%` }} />
            </div>
            <span className={s.progressText}>
              {doneCount}/{items.length} 已装（{progress}%）
            </span>
          </div>

          <div className={s.note}>
        {climateLabel ? (
          <>
            气候参考（按行程月份推导，非实时）：<b>{climateLabel}</b>。衣物据此 + 天数给建议；活动项依据你排的景点类型自动推导。生成会覆盖当前清单。
          </>
        ) : (
          <>
            未设出发日期，衣物按天数给通用数量；在行程里填好出发日可启用按月气候推导。活动项依据你排的景点类型自动推导。生成会覆盖当前清单。
          </>
        )}
          </div>
        </div>

      <div className={s.catGrid}>
        {byCat.length === 0 && (
          <div className={panel.empty}>还没有清单。点右上「智能生成」，或在顶部输入框添加一项。</div>
        )}

        {byCat.map((cat) => (
          <div key={cat} className={s.cat}>
            <div className={s.catHead}>{cat}</div>
            {items
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
                  <select
                    className={s.assignee}
                    value={it.assigneeId ?? ''}
                    title="负责人"
                    onChange={(e) => patchItem(it.id, { assigneeId: e.target.value || null })}
                  >
                    <option value="">未指定</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                  <button className={s.del} onClick={() => removeItem(it.id)} title="删除">
                    ×
                  </button>
                </div>
              ))}
          </div>
        ))}

      </div>
        </div>
      </div>
    </div>
  );
}
