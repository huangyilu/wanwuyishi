/**
 * 右栏条目编辑面板 —— 替代原先只能写备注的简易文本框。
 *
 * - poi 条目：只暴露共享备注（票务在导览卡里管）
 * - transport 条目：标题 / 方式 / 出发·到达城市 / 起止时间 / 备注，并能一键把当天城市设为到达地
 * - note 条目：可选标题 + 内容
 *
 * 所有改动走 mut.updateItem 乐观更新，松手即生效。
 */
import type { CitySummary, ItemStatus, TransportMode, TripBundle, TripItem } from '../../data/types';
import type { useTripMutations } from './queries';
import s from './ItemEditor.module.css';

type Mutations = ReturnType<typeof useTripMutations>;

const TRANSPORT_OPTIONS: Array<{ value: TransportMode; label: string }> = [
  { value: 'train', label: '🚄 火车' },
  { value: 'flight', label: '✈️ 飞机' },
  { value: 'bus', label: '🚌 大巴' },
  { value: 'ferry', label: '⛴️ 轮渡' },
  { value: 'car', label: '🚗 自驾/包车' },
  { value: 'walk', label: '🚶 步行' },
  { value: 'other', label: '🔁 其他' },
];

const STATUS_OPTIONS: Array<{ value: ItemStatus; label: string }> = [
  { value: 'wishlist', label: '想去' },
  { value: 'candidate', label: '候选' },
  { value: 'confirmed', label: '确定' },
  { value: 'visited', label: '去过' },
  { value: 'dropped', label: '放弃' },
];

export function ItemEditor({
  item,
  bundle,
  mut,
  cities,
}: {
  item: TripItem;
  bundle: TripBundle;
  mut: Mutations;
  cities: CitySummary[];
}) {
  const kind = item.kind ?? 'poi';

  function patch(p: Partial<TripItem>) {
    mut.updateItem.mutate({ id: item.id, patch: p });
  }

  const day = item.dayId ? bundle.days.find((d) => d.id === item.dayId) : undefined;
  const canSetDayCity = kind === 'transport' && item.toCityId && day && day.cityId !== item.toCityId;

  return (
    <div className={s.panel}>
      <div className={s.title}>
        {kind === 'transport' ? '🚄 交通转场' : kind === 'note' ? '📝 备注' : '条目'}
      </div>

      {kind === 'poi' && (
        <>
          <div className={s.row}>
            <div className={s.field}>
              <label className={s.label}>开始时间</label>
              <input
                className={s.input}
                type="time"
                value={item.slotStart ?? ''}
                onChange={(e) => patch({ slotStart: e.target.value || null })}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>结束时间</label>
              <input
                className={s.input}
                type="time"
                value={item.slotEnd ?? ''}
                onChange={(e) => patch({ slotEnd: e.target.value || null })}
              />
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label}>共享备注</label>
            <textarea
              className={s.textarea}
              defaultValue={item.note ?? ''}
              placeholder="备注：已买门票 / 预约号 / 注意事项…"
              onBlur={(e) => patch({ note: e.target.value || null })}
            />
          </div>
        </>
      )}

      {kind === 'note' && (
        <>
          <div className={s.field}>
            <label className={s.label}>标题（可选）</label>
            <input
              className={s.input}
              defaultValue={item.customTitle ?? ''}
              placeholder="例如：行前准备 / 住宿提醒"
              onBlur={(e) => patch({ customTitle: e.target.value.trim() || null })}
            />
          </div>
          <div className={s.field}>
            <label className={s.label}>内容</label>
            <textarea
              className={s.textarea}
              defaultValue={item.note ?? ''}
              placeholder="写点什么把这天串起来…"
              onBlur={(e) => patch({ note: e.target.value || null })}
            />
          </div>
        </>
      )}

      {kind === 'transport' && (
        <>
          <div className={s.field}>
            <label className={s.label}>标题</label>
            <input
              className={s.input}
              defaultValue={item.customTitle ?? ''}
              placeholder="例如：TGV 9234 / 法航 AF111"
              onBlur={(e) => patch({ customTitle: e.target.value.trim() || null })}
            />
          </div>

          <div className={s.field}>
            <label className={s.label}>方式</label>
            <select
              className={s.input}
              value={item.transportMode ?? 'train'}
              onChange={(e) => patch({ transportMode: e.target.value as TransportMode })}
            >
              {TRANSPORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className={s.row}>
            <div className={s.field}>
              <label className={s.label}>出发地</label>
              <select
                className={s.input}
                value={item.fromCityId ?? ''}
                onChange={(e) => patch({ fromCityId: e.target.value || null })}
              >
                <option value="">—</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label}>到达地</label>
              <select
                className={s.input}
                value={item.toCityId ?? ''}
                onChange={(e) => patch({ toCityId: e.target.value || null })}
              >
                <option value="">—</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={s.row}>
            <div className={s.field}>
              <label className={s.label}>出发时间</label>
              <input
                className={s.input}
                type="time"
                value={item.slotStart ?? ''}
                onChange={(e) => patch({ slotStart: e.target.value || null })}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>到达时间</label>
              <input
                className={s.input}
                type="time"
                value={item.slotEnd ?? ''}
                onChange={(e) => patch({ slotEnd: e.target.value || null })}
              />
            </div>
          </div>

          {canSetDayCity && (
            <button
              className={s.setDayBtn}
              onClick={() => day && mut.updateDay.mutate({ id: day.id, patch: { cityId: item.toCityId } })}
            >
              把当天城市设为「{cities.find((c) => c.id === item.toCityId)?.name}」
            </button>
          )}

          <div className={s.field}>
            <label className={s.label}>备注</label>
            <textarea
              className={s.textarea}
              defaultValue={item.note ?? ''}
              placeholder="航班号 / 车次 / 行李寄存 / 接机…"
              onBlur={(e) => patch({ note: e.target.value || null })}
            />
          </div>
        </>
      )}

      {kind !== 'note' && (
        <div className={s.field}>
          <label className={s.label}>状态</label>
          <select
            className={s.input}
            value={item.status}
            onChange={(e) => patch({ status: e.target.value as ItemStatus })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
