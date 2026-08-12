import { weekdayLabel } from '../../domain/date';
import { formatDuration } from '../../domain/world/duration';
import { freshnessOf, oldestVerification } from '../../domain/world/staleness';
import type { Poi } from '../../domain/world/schema';
import { usePoi } from './queries';
import { poiImage } from './poiImages';
import s from './PoiGuideCard.module.css';

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function VolatileRow({
  label,
  field,
}: {
  label: string;
  field: { value: string; source: string; verifiedAt: string } | undefined;
}) {
  if (!field) return null;
  const f = freshnessOf(field.verifiedAt);
  return (
    <div className={s.vRow}>
      <div className={s.vKey}>{label}</div>
      <div>
        <div className={s.vValue}>{field.value}</div>
        <div className={s.vFoot}>
          <span className={f.warn ? s.stale : undefined}>{f.label}</span>
          <a href={field.source} target="_blank" rel="noreferrer">
            查看官方最新 ↗
          </a>
        </div>
      </div>
    </div>
  );
}

export function PoiGuideCardView({
  poi,
  onAddToTrip,
  addLabel = '加入行程',
}: {
  poi: Poi;
  onAddToTrip?: (poiId: string) => void;
  addLabel?: string;
}) {
  const fresh = oldestVerification([poi.volatile.price, poi.volatile.hours, poi.volatile.booking]);
  const closed = poi.openness.closedWeekdays.map((d) => WEEK[d]).filter(Boolean);
  const img = poiImage(poi.id);

  return (
    <div className={s.card}>
      <div className={s.hero}>
        {img?.src && <img className={s.heroImg} src={img.src} alt={poi.name} loading="lazy" />}
        <div className={s.heroShade} />
        <div className={s.heroText}>
          <h2 className={s.name}>{poi.name}</h2>
          <div className={s.localName}>{poi.localName}</div>
          {img && (
            <a
              className={s.heroCredit}
              href={img.page}
              target="_blank"
              rel="noopener noreferrer"
              title={`作者：${img.author} · 许可：${img.license}`}
            >
              © {img.author} / {img.license}
            </a>
          )}
        </div>
        {poi.officialUrl && (
          <a className={`btn btn-sm ${s.heroLink}`} href={poi.officialUrl} target="_blank" rel="noreferrer">
            官网 ↗
          </a>
        )}
      </div>

      <div className={s.tags}>
        {poi.tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>

      {onAddToTrip && (
        <div className={s.actions}>
          <button className="btn btn-primary btn-sm" onClick={() => onAddToTrip(poi.id)}>
            + {addLabel}
          </button>
        </div>
      )}

      <div className={s.meta}>
        <div className={s.metaKey}>建议时长</div>
        <div>
          {poi.visit.durationNote ?? formatDuration(poi.visit.durationMinutes)}
        </div>
        <div className={s.metaKey}>闭馆日</div>
        <div>
          {closed.length > 0 ? closed.join('、') : '无固定闭馆日'}
          {poi.openness.closedDates.length > 0 && `；另有 ${poi.openness.closedDates.length} 个特定日期`}
        </div>
        {poi.visit.bestTime && (
          <>
            <div className={s.metaKey}>最佳时段</div>
            <div>{poi.visit.bestTime}</div>
          </>
        )}
        {poi.booking?.required && (
          <>
            <div className={s.metaKey}>预约</div>
            <div>
              需预约，建议提前 <b className="num">{poi.booking.leadDays}</b> 天
              {poi.booking.url && (
                <>
                  {' · '}
                  <a href={poi.booking.url} target="_blank" rel="noreferrer">
                    订票 ↗
                  </a>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {fresh?.warn && (
        <div className={s.staleBanner}>
          ⚠ 票价与开放时间已 {fresh.days} 天未核实，出发前请点开官方源确认
        </div>
      )}

      <section className={s.section}>
        <div className={s.sectionTitle}>门票与开放</div>
        <div className={s.volatile}>
          <VolatileRow label="票价" field={poi.volatile.price} />
          <VolatileRow label="开放" field={poi.volatile.hours} />
          <VolatileRow label="预约" field={poi.volatile.booking} />
        </div>
      </section>

      {poi.guide?.entrances && (
        <section className={s.section}>
          <div className={s.sectionTitle}>入口</div>
          <div className={s.text}>{poi.guide.entrances}</div>
        </section>
      )}

      {poi.guide && poi.guide.routes.length > 0 && (
        <section className={s.section}>
          <div className={s.sectionTitle}>推荐路线</div>
          {poi.guide.routes.map((r) => (
            <div key={r.name} className={s.route}>
              <div className={s.routeName}>
                {r.name}
                {r.durationMinutes && (
                  <span className="muted num"> · 约 {r.durationMinutes} 分钟</span>
                )}
              </div>
              <ol className={s.stops}>
                {r.stops.map((stop, i) => (
                  <li key={i}>{stop}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      {poi.guide && poi.guide.highlights.length > 0 && (
        <section className={s.section}>
          <div className={s.sectionTitle}>必看亮点</div>
          <div>
            {poi.guide.highlights.map((h) => (
              <div key={h.name} className={s.highlight}>
                <div>
                  <span className={s.hName}>{h.name}</span>
                  <span className={s.hLoc}>{h.location}</span>
                </div>
                {h.why && <div className={s.hWhy}>{h.why}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {poi.guide?.collections && (
        <section className={s.section}>
          <div className={s.sectionTitle}>展陈结构</div>
          <div className={s.text}>{poi.guide.collections}</div>
        </section>
      )}

      {poi.guide && poi.guide.tips.length > 0 && (
        <section className={s.section}>
          <div className={s.sectionTitle}>实用贴士</div>
          <ul className={s.tips}>
            {poi.guide.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {poi.facilities && (
        <section className={s.section}>
          <div className={s.sectionTitle}>设施</div>
          <div className={s.meta} style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            {poi.facilities.toilet && (
              <>
                <div className={s.metaKey}>厕所</div>
                <div>{poi.facilities.toilet}</div>
              </>
            )}
            {poi.facilities.wifi && (
              <>
                <div className={s.metaKey}>Wi-Fi</div>
                <div>{poi.facilities.wifi}</div>
              </>
            )}
            {poi.facilities.locker && (
              <>
                <div className={s.metaKey}>寄存</div>
                <div>{poi.facilities.locker}</div>
              </>
            )}
            {poi.facilities.water && (
              <>
                <div className={s.metaKey}>饮水</div>
                <div>{poi.facilities.water}</div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** 按 id 拉取并渲染，右栏与独立页面共用 */
export function PoiGuideCard({
  poiId,
  onAddToTrip,
  scheduledDate,
}: {
  poiId: string;
  onAddToTrip?: (poiId: string) => void;
  scheduledDate?: string | null;
}) {
  const { data: poi, isLoading } = usePoi(poiId);

  if (isLoading) return <div className={s.empty}>加载中…</div>;
  if (!poi) return <div className={s.empty}>这张卡片打不开（数据缺失或结构异常）</div>;

  const closedToday =
    scheduledDate && poi.openness.closedWeekdays.includes(new Date(scheduledDate).getUTCDay());

  return (
    <>
      {closedToday && (
        <div className={s.staleBanner} style={{ margin: '12px 16px 0' }}>
          ⚠ {poi.name} 在 {scheduledDate}（{weekdayLabel(scheduledDate)}）闭馆
        </div>
      )}
      <PoiGuideCardView
        poi={poi}
        {...(onAddToTrip ? { onAddToTrip } : {})}
        addLabel={scheduledDate ? `加入 ${scheduledDate}` : '加入行程'}
      />
    </>
  );
}
