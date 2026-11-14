import { ArrowRight, CalendarClock, MapPin, Moon, Pause, Play, Radio, Sparkles, Sun, TriangleAlert, Trophy } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Metric } from '../ui/Metric.jsx';
import { TierChip } from '../ui/TierChip.jsx';
import { Sparkline } from '../ui/Sparkline.jsx';
import { Button, SegmentedControl } from '../ui/Controls.jsx';
import { DateField } from '../ui/DateField.jsx';
import { ChartPanel } from '../ui/ChartPanel.jsx';
import { Tooltip } from '../ui/Tooltip.jsx';
import TimelineChart from '../charts/TimelineChart.jsx';
import Viewer from '../scene/Viewer.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useMission } from '../../lib/store.jsx';
import { int, pct, hoursValue } from '../../lib/format.js';
import { SCORE_WEIGHTS, scoreOf } from '../../lib/metrics.js';
import { TIER_OF } from '../../lib/model-meta.js';
import { MODEL_FACTS } from '../../lib/validation.js';

/** Earth's apparent diameter, straight from the model — never a literal. */
const [EARTH_DISK_MIN, EARTH_DISK_MAX] = MODEL_FACTS.earthDiskRangeDeg.map((d) => d.toFixed(2));
const EARTH_DISK_DEG = `${EARTH_DISK_MIN}–${EARTH_DISK_MAX}°`;

/**
 * Hero — a cinematic band across the top of the explorer.
 *
 * The photograph is a real scene geometry: the south pole with the Sun grazing
 * the horizon and the Earth low in the sky. It is atmosphere, not data — every
 * number lives in the panels below it.
 */
function Hero() {
  const { t, dateRange, siteText } = useI18n();
  const { site, window: win, metrics } = useMission();
  const translated = siteText(site);
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-media" aria-hidden="true">
        <img src="/assets/hero/south-pole-hero.webp" alt="" loading="eager" decoding="async" />
        <span className="hero-veil" />
      </div>

      <div className="hero-body">
        <p className="kicker">
          <span className="hero-dot" aria-hidden="true" />
          {t('heroKicker')}
        </p>
        <h1 className="hero-title" id="hero-title">
          {t('heroTitle')}{' '}
          <span className="hero-title-alt">{t('heroTitle2')}</span>
        </h1>
        <p className="hero-sub">{t('heroSubtitle')}</p>
      </div>

      <div className="hero-foot">
        <div className="hero-chips">
          <span className="hero-chip">
            <span className="hero-chip-label">{t('landingDate')}</span>
            <strong className="num">{dateRange(win.startMs, win.endMs)}</strong>
          </span>
          <span className="hero-chip">
            <span className="hero-chip-label">{t('selectedSite')}</span>
            <strong>{translated.name}</strong>
          </span>
          <span className="hero-chip hero-chip--live">
            <span className="hero-chip-label">{t('illumination')}</span>
            <strong className="num" data-metric="sun">{metrics.sunPct.toFixed(1)}%</strong>
          </span>
        </div>
      </div>

      <div className="mission-card" aria-label={t('mission')}>
        <span className="mission-emblem" aria-hidden="true">
          <Moon size={22} strokeWidth={1.6} />
        </span>
        <div>
          <span className="mission-card-label">{t('mission')}</span>
          <strong className="mission-card-title">{t('polar')}</strong>
          <span className="mission-card-sub">{t('missionSub')}</span>
        </div>
      </div>
    </section>
  );
}

/** The selected-site panel — the mission's primary controls. */
function SitePanel() {
  const { t, siteText, date } = useI18n();
  const { site, metrics, rank, sites, landingMs, setLanding, days, setDays, setTab, sky } = useMission();
  const translated = siteText(site);

  return (
    <Card className="site-panel" level="elevated">
      <p className="panel-label">
        <MapPin size={14} strokeWidth={2} aria-hidden="true" />
        {t('selectedSite')}
      </p>
      <div className="site-head">
        <h2 className="site-name">{translated.name}</h2>
        <Badge tone={sky.earth.visible ? 'success' : 'warn'}>{translated.tag}</Badge>
      </div>
      <p className="site-region">{translated.region}</p>
      <p className="site-coords num">
        {Math.abs(site.lat).toFixed(2)}°S · {site.lon.toFixed(2)}°E
      </p>

      <div className="site-metrics">
        <Metric
          metric="sun"
          label={t('daylight')}
          value={metrics.sunPct}
          tier={TIER_OF.sunPct}
          note={t('overWindow', { days })}
          limits={t('limitSun')}
          tip={{
            source: 'LOLA terrain horizon + real ephemeris (checked against Mazarico et al. 2011; Gläser et al. 2017)',
            formula: t('defSun'),
            window: `${date(landingMs)} + ${days} d`,
          }}
        />
        <Metric
          metric="earth"
          label={t('earthVisibility')}
          value={metrics.earthPct}
          tier={TIER_OF.earthPct}
          note={t('overWindow', { days })}
          limits={t('limitEarth')}
          tip={{
            source: 'Real Earth ephemeris + LOLA terrain horizon',
            formula: t('defEarth'),
            window: `${date(landingMs)} + ${days} d`,
          }}
        />
      </div>

      <p className="site-rank">
        <Trophy size={14} strokeWidth={2} aria-hidden="true" />
        {t('rankLabel')} <strong className="num">{rank}</strong> {t('ofSites', { n: sites.length })}
      </p>

      <div className="site-controls">
        <DateField id="landing-date" label={t('landingDate')} value={landingMs} onChange={setLanding} />
        <div className="field field--segmented">
          <span className="field-label" id="duration-label">
            {t('duration')}
          </span>
          <SegmentedControl
            label={t('duration')}
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: `7 ${t('dayShort')}` },
              { value: 30, label: `30 ${t('dayShort')}` },
              { value: 90, label: `90 ${t('dayShort')}` },
            ]}
          />
        </div>
      </div>

      <Button variant="primary" icon={ArrowRight} className="site-cta btn--forward" onClick={() => setTab('comparison')}>
        {t('compareSites')}
      </Button>
    </Card>
  );
}

/** One KPI card: label, number, sparkline with min/max, one-line explanation. */
function Kpi({ metric, icon: Icon, label, value, unit, max = 100, decimals = 1, values, note, tip, tier, limits, empty }) {
  const { t } = useI18n();
  const lo = values?.length ? Math.min(...values) : 0;
  const hi = values?.length ? Math.max(...values) : 0;
  return (
    <Card className="kpi" metric={metric}>
      <div className="kpi-head">
        <span className="kpi-icon" aria-hidden="true">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <span className="kpi-label">{label}</span>
        <TierChip tier={tier} />
        {tip && <Tooltip label={label} {...tip} />}
      </div>
      <p className="kpi-value">
        <span className="num">{value}</span>
        <span className="kpi-unit">{unit}</span>
        {max !== 100 && <span className="kpi-max num">/ {max}</span>}
      </p>
      {!empty && max === 100 && (
        <div className="kpi-bar" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, Number(value) || 0))}%` }} />
        </div>
      )}
      {empty ? (
        <div className="kpi-empty">
          <span className="kpi-empty-tag">{empty}</span>
          <Sparkline values={[]} metric={metric} height={40} label={empty} />
        </div>
      ) : (
        <>
          <Sparkline values={values} metric={metric} label={`${label}: ${pct(lo)} – ${pct(hi)}`} min={0} max={100} />
          <p className="kpi-range num">{t('minMax', { min: lo.toFixed(1), max: hi.toFixed(1) })}</p>
        </>
      )}
      <p className="kpi-note">{note}</p>
      {limits && (
        <p className="kpi-limit">
          <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" />
          <span>{limits}</span>
        </p>
      )}
    </Card>
  );
}

function KpiRow() {
  const { t } = useI18n();
  const { metrics, series, annual, days } = useMission();
  const night = hoursValue(metrics.maxSunOutageH);
  const sunSeries = series.map((d) => d.sunFraction * 100);
  const earthSeries = series.map((d) => d.earthFraction * 100);
  // Per-sample score using the SAME weights as the window score, so the
  // sparkline can never disagree with the headline formula.
  const scoreSeries = series.map((d) => scoreOf(d.sunFraction, d.earthFraction, d.sunVisible ? 0 : 1) * 100);

  return (
    <div className="kpi-grid">
      <Kpi
        metric="sun"
        icon={Sun}
        label={t('illumination')}
        value={metrics.sunPct.toFixed(1)}
        values={sunSeries}
        note={t('overMission')}
        tier={TIER_OF.sunPct}
        limits={t('limitSun')}
        tip={{
          source: 'Real ephemeris + LOLA terrain horizon, sampled every 2 h',
          formula: t('defSun'),
          window: `${days} d · ${t('annualRef')} ${annual.sunPct.toFixed(1)}% (${t('defAnnual')})`,
        }}
      />
      <Kpi
        metric="earth"
        icon={Radio}
        label={t('earthVisibility')}
        value={metrics.earthPct.toFixed(1)}
        values={earthSeries}
        note={t('ofWindow')}
        tier={TIER_OF.earthPct}
        limits={t('limitEarth')}
        tip={{
          source: 'Real Earth ephemeris + LOLA terrain horizon (cross-checked with Sverdrup–Henson 2023; Mazarico 2011)',
          formula: `${t('defEarth')} (disk ${EARTH_DISK_DEG})`,
          window: `${days} d · ${t('annualRef')} ${annual.earthPct.toFixed(1)}% (${t('defAnnual')})`,
        }}
      />
      <Kpi
        metric="score"
        icon={Sparkles}
        label={t('missionScore')}
        value={int(metrics.score * 100)}
        unit=""
        max={100}
        values={scoreSeries}
        note={t('scoreFormula')}
        tier={TIER_OF.score}
        limits={t('limitScore')}
        tip={{
          formula: `score = ${SCORE_WEIGHTS.sun}·sun + ${SCORE_WEIGHTS.earth}·earth + ${SCORE_WEIGHTS.night}·(1 − blackout)`,
          window: `${days} d`,
        }}
      />
      <Kpi
        metric="night"
        icon={Moon}
        label={t('longestNight')}
        value={metrics.maxSunOutageH < 1 ? '0.0' : night.value}
        unit={metrics.maxSunOutageH < 1 ? 'h' : night.unit}
        values={metrics.maxSunOutageH > 0 ? series.map((d) => (d.sunVisible ? 100 : 0)) : undefined}
        note={metrics.maxSunOutageH < 1 ? t('noNightBody', { days }) : t('longestNightNote')}
        tier={TIER_OF.night}
        limits={t('limitNight')}
        empty={metrics.maxSunOutageH < 1 ? t('noNight') : undefined}
        tip={{
          source: 'Model: longest contiguous run with zero solar-disk fraction',
          formula: 'max run of samples with sun.fraction = 0 × step',
          window: `${days} d`,
        }}
      />
    </div>
  );
}

function Candidates() {
  const { t, siteText } = useI18n();
  const { sites, summaries, site, selectSite, ranking } = useMission();
  const bestId = ranking[0].id;
  // The grid reads like a leaderboard: best site first, then the rest.
  const ranked = ranking.map((r) => sites.find((s) => s.id === r.id)).filter(Boolean);
  return (
    <Card className="candidates">
      <CardHeader title={t('candidatesTitle')} subtitle={t('candidatesSub')} />
      <div className="candidate-grid">
        {ranked.map((s) => {
          const m = summaries[s.id];
          const active = s.id === site.id;
          const rank = ranking.findIndex((r) => r.id === s.id) + 1;
          return (
            <button
              key={s.id}
              type="button"
              className={`candidate ${active ? 'is-active' : ''} ${s.id === bestId ? 'is-best' : ''}`}
              onClick={() => selectSite(s.id)}
              aria-pressed={active}
            >
              <span className="candidate-top">
                <span className="candidate-rank num">{String(rank).padStart(2, '0')}</span>
                <span className="candidate-name">{siteText(s).name}</span>
              </span>
              <span className="candidate-metrics num">
                <span data-metric="sun">
                  <i className="candidate-bar" aria-hidden="true">
                    <b style={{ width: `${m.sunPct}%` }} />
                  </i>
                  {m.sunPct.toFixed(1)}%
                </span>
                <span data-metric="earth">
                  <i className="candidate-bar" aria-hidden="true">
                    <b style={{ width: `${m.earthPct}%` }} />
                  </i>
                  {m.earthPct.toFixed(1)}%
                </span>
              </span>
              <span className="candidate-score" data-metric="score">
                <strong className="num">{int(m.score * 100)}</strong>
                <span>{t('score')}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export default function ExplorerPage() {
  const { t } = useI18n();
  const { series, window: win, cursorMs, setCursor, playing, setPlaying } = useMission();
  const hasNight = series.some((d) => !d.sunVisible);
  const sunMin = Math.min(...series.map((d) => d.sunAlt));
  const sunMax = Math.max(...series.map((d) => d.sunAlt));

  return (
    <div className="page">
      <div className="grid">
        <div className="col-12">
          <Hero />
        </div>

        <div className="col-8 viewer-col">
          <Viewer />
        </div>
        <div className="col-4">
          <SitePanel />
        </div>

        <div className="col-12">
          <KpiRow />
        </div>

        <div className="col-12">
          <ChartPanel
            title={t('timelineTitle')}
            subtitle={t('timelineSub')}
            icon={CalendarClock}
            actions={
              <Button variant="secondary" size="sm" icon={playing ? Pause : Play} onClick={() => setPlaying(!playing)}>
                {playing ? t('pauseMission') : t('playMission')}
              </Button>
            }
            legend={
              <>
                <span className="legend-item" data-metric="sun">
                  <span className="legend-dot" aria-hidden="true" />
                  {t('sunAltitude')}
                </span>
                <span className="legend-item" data-metric="earth">
                  <span className="legend-dot" aria-hidden="true" />
                  {t('earthAltitude')}
                </span>
                <span className="legend-item" data-metric="neutral">
                  <span className="legend-line" aria-hidden="true" />
                  {t('terrainHorizon')}
                </span>
                <span className="legend-hint">{t('scrubHint')}</span>
              </>
            }
            empty={!hasNight ? null : null}
            height={230}
            footer={
              <p className="chart-footnote">
                {t('sunGraze', { min: sunMin.toFixed(1), max: sunMax.toFixed(1) })}{' '}
                {t('selectedDate')}: <strong className="num">{new Date(cursorMs).toISOString().slice(0, 10)}</strong> · {t('keyboardHint')}
              </p>
            }
          >
            <TimelineChart data={series} startMs={win.startMs} endMs={win.endMs} cursorMs={cursorMs} onCursor={setCursor} />
          </ChartPanel>
        </div>

        <div className="col-12">
          <Candidates />
        </div>
      </div>
    </div>
  );
}
