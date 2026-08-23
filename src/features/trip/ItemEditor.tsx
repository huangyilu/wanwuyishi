/**
 * 右栏条目编辑面板 —— 替代原先只能写备注的简易文本框。
 *
 * - poi 条目：只暴露共享备注（票务在导览卡里管）
 * - transport 条目：标题 / 方式 / 出发·到达城市 / 起止时间 / 备注，并能一键把当天城市设为到达地
 * - note 条目：可选标题 + 内容
 *
 * 所有改动走 mut.updateItem 乐观更新，松手即生效。
 */
import { useState, useEffect, useRef, type ChangeEvent, type FocusEvent } from 'react';
import { useTripRepo } from '../../data';
import type { CitySummary, ItemStatus, TransportMode, TripBundle, TripItem } from '../../data/types';
import type { useTripMutations } from './queries';
import { deleteAttachment, uploadAttachment } from './uploadAttachment';
import { CopyButton } from '../../components/CopyButton';
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
  const isCloud = useTripRepo().kind === 'supabase';

  function patch(p: Partial<TripItem>) {
    mut.updateItem.mutate({ id: item.id, patch: p });
  }

  const day = item.dayId ? bundle.days.find((d) => d.id === item.dayId) : undefined;
  // 「把当天城市设为此处」按钮：当 item 有到达城市（预设或自定义）且与当天城市不一致时显示
  const itemToCityName = item.toCityId ? cities.find((c) => c.id === item.toCityId)?.name : item.customToCity;
  const dayCityName = day?.cityId ? cities.find((c) => c.id === day.cityId)?.name : day?.customCity;
  const canSetDayCity =
    (kind === 'transport' || kind === 'accommodation') &&
    Boolean(itemToCityName) &&
    itemToCityName !== dayCityName;

  return (
    <div className={s.panel}>
      <div className={s.title}>
        {kind === 'transport' ? '🚄 交通' : kind === 'accommodation' ? '🏨 住宿' : kind === 'note' ? '📝 备注' : '条目'}
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
            <AutoTextarea
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
            <AutoTextarea
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
              <CityCombo
                cities={cities}
                cityId={item.fromCityId}
                customCity={item.customFromCity}
                placeholder="选择或输入城市"
                onCommit={(cityId, customCity) => patch({ fromCityId: cityId, customFromCity: customCity })}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>到达地</label>
              <CityCombo
                cities={cities}
                cityId={item.toCityId}
                customCity={item.customToCity}
                placeholder="选择或输入城市"
                onCommit={(cityId, customCity) => patch({ toCityId: cityId, customToCity: customCity })}
              />
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
              onClick={() =>
                day &&
                mut.updateDay.mutate({
                  id: day.id,
                  patch: { cityId: item.toCityId ?? null, customCity: item.toCityId ? null : item.customToCity ?? null },
                })
              }
            >
              把当天城市设为「{cities.find((c) => c.id === item.toCityId)?.name ?? item.customToCity ?? ''}」
            </button>
          )}

          <div className={s.field}>
            <label className={s.label}>备注</label>
            <AutoTextarea
              className={s.textarea}
              defaultValue={item.note ?? ''}
              placeholder="航班号 / 车次 / 行李寄存 / 接机…"
              onBlur={(e) => patch({ note: e.target.value || null })}
            />
          </div>
        </>
      )}

      {kind === 'accommodation' && (
        <>
          <div className={s.field}>
            <label className={s.label}>酒店 / 住宿名称</label>
            <input
              className={s.input}
              defaultValue={item.customTitle ?? ''}
              placeholder="例如：希尔顿 / Airbnb 巴黎歌剧院公寓"
              onBlur={(e) => patch({ customTitle: e.target.value.trim() || null })}
            />
          </div>

          <div className={s.field}>
            <label className={s.label}>所在城市</label>
            <CityCombo
              cities={cities}
              cityId={item.toCityId}
              customCity={item.customToCity}
              placeholder="选择或输入城市"
              onCommit={(cityId, customCity) => patch({ toCityId: cityId, customToCity: customCity })}
            />
          </div>

          <div className={s.row}>
            <div className={s.field}>
              <label className={s.label}>入住时间</label>
              <input
                className={s.input}
                type="time"
                value={item.slotStart ?? ''}
                onChange={(e) => patch({ slotStart: e.target.value || null })}
              />
            </div>
            <div className={s.field}>
              <label className={s.label}>退房时间</label>
              <input
                className={s.input}
                type="time"
                value={item.slotEnd ?? ''}
                onChange={(e) => patch({ slotEnd: e.target.value || null })}
              />
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label}>地址</label>
            <AddressField value={item.address} onSave={(v) => patch({ address: v })} />
          </div>

          <div className={s.field}>
            <label className={s.label}>预订信息</label>
            <AutoTextarea
              className={s.textarea}
              defaultValue={item.note ?? ''}
              placeholder="预订确认号 / 入住人 / 注意事项…"
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

      <ImageSection isCloud={isCloud} tripId={bundle.trip.id} item={item} patch={patch} />
    </div>
  );
}

/* ------------------------------ 住宿地址（可单独复制） ------------------------------ */

function AddressField({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [val, setVal] = useState(value ?? '');
  useEffect(() => setVal(value ?? ''), [value]);
  return (
    <div className={s.copyRow}>
      <textarea
        className={s.textarea}
        rows={3}
        value={val}
        placeholder="酒店详细地址 / 街道门牌 / 楼层房间…"
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => onSave(val.trim() || null)}
      />
      <CopyButton text={val} label="复制地址" className={s.copyBtn} />
    </div>
  );
}

/* ------------------------- 自适应高度 textarea ------------------------- */
function AutoTextarea({
  className,
  defaultValue,
  placeholder,
  onBlur,
  rows = 4,
}: {
  className?: string;
  defaultValue: string;
  placeholder?: string;
  onBlur: (e: FocusEvent<HTMLTextAreaElement>) => void;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    grow();
  }, [defaultValue]);
  return (
    <textarea
      ref={ref}
      className={className}
      defaultValue={defaultValue}
      placeholder={placeholder}
      rows={rows}
      onInput={grow}
      onBlur={onBlur}
    />
  );
}

/* ------------------------------ 图片附件 ------------------------------ */

function ImageSection({
  isCloud,
  tripId,
  item,
  patch,
}: {
  isCloud: boolean;
  tripId: string;
  item: TripItem;
  patch: (p: Partial<TripItem>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const images = item.images ?? [];

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const url = await uploadAttachment(tripId, item.id, file);
      patch({ images: [...images, url] });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '上传失败');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(url: string) {
    setErr(null);
    try {
      await deleteAttachment(url);
      patch({ images: images.filter((u) => u !== url) });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '删除失败');
    }
  }

  if (!isCloud) {
    return (
      <div className={s.field}>
        <label className={s.label}>图片</label>
        <div className={s.cloudOnly}>登录云端后可上传图片（本地档容量太小，不支持存图）</div>
      </div>
    );
  }

  return (
    <div className={s.field}>
      <label className={s.label}>图片{images.length > 0 ? `（${images.length}）` : ''}</label>
      <div className={s.thumbGrid}>
        {images.map((u) => (
          <div key={u} className={s.thumb}>
            <img src={u} alt="附件" />
            <button className={s.thumbDel} onClick={() => onRemove(u)} title="删除">
              ×
            </button>
          </div>
        ))}
        <label className={`${s.uploadBtn} ${busy ? s.uploadBusy : ''}`}>
          {busy ? '上传中…' : '+ 上传'}
          <input type="file" accept="image/*" hidden onChange={onPick} disabled={busy} />
        </label>
      </div>
      {err && <div className={s.cloudErr}>{err}</div>}
    </div>
  );
}

/* ------------------------------ 城市选择 combobox ------------------------------ */

/**
 * 既可以从世界库预设城市里选，也能自由输入自定义城市名的 combobox。
 * 输入匹配某个预设城市 → 关联到该城市的完整数据；否则当作自定义文本存着。
 * 用本地 state 缓冲输入过程，失焦时再提交，避免每次按键打一次 mutation。
 */
function CityCombo({
  cities,
  cityId,
  customCity,
  placeholder,
  onCommit,
}: {
  cities: CitySummary[];
  cityId?: string | null;
  customCity?: string | null;
  placeholder?: string;
  onCommit: (cityId: string | null, customCity: string | null) => void;
}) {
  const [val, setVal] = useState('');
  const matched = cityId ? cities.find((c) => c.id === cityId) : undefined;
  const display = val || matched?.name || customCity || '';
  function commit(text: string) {
    const trimmed = text.trim();
    const hit = cities.find((c) => c.name === trimmed || c.localName === trimmed);
    if (trimmed === '') onCommit(null, null);
    else if (hit) onCommit(hit.id, null);
    else onCommit(null, trimmed);
    setVal('');
  }
  return (
    <>
      <input
        className={s.input}
        list="item-city-options"
        value={display}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
      />
      <datalist id="item-city-options">
        {cities.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </>
  );
}
