import { Battery, Copy, Download, Gauge, Lightbulb, Trophy } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Controls.jsx';
import { Metric } from '../ui/Metric.jsx';
import { TierChip } from '../ui/TierChip.jsx';
import { ScoreRing } from '../ui/Sparkline.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useMission } from '../../lib/store.jsx';
import { downloadText, makeBrief, recommendation } from '../../lib/brief.js';
import { int, pct } from '../../lib/format.js';

/**
 * Idealised incidence in the last half percent is a truncation artefact, not a
 * measurement: with the Sun 1.5° above the horizon a vertical array faces it at
 * cos(1.5°) = 99.97 % of normal incidence. Printing "100.0 %" there would claim
 * precision the model does not have, so it is shown as "≈".
 */
const incidence = (v) => (v >= 99.5 ? `≈${Math.min(100, Math.round(v))}%` : pct(v));
import { LOAD_KW, DEPTH_OF_DISCHARGE, PACK_WH_PER_KG, batteryForNight } from '../../lib/power.js';
import { TIER_OF } from '../../lib/model-meta.js';

/** Battery survival estimate — the assumptions are printed from the same
 *  constants this calculation uses, so the text and the maths cannot drift. */
const battery = (metrics) => batteryForNight(metrics.maxSunOutageH);

export default function SummaryPage() {
  const i18n = useI18n();
  const { t, siteText, dateRange, date, hours: fmtHours } = i18n;
  const { site, metrics, rank, sites, window: win, landingMs, days, notify } = useMission();
  const translated = siteText(site);
  const rec = recommendation(metrics);
  const bat = battery(metrics);
  const hasNight = metrics.maxSunOutageH > 0;

  const onDownload = () => {
    const text = makeBrief({ ...i18n, site, metrics, startMs: landingMs, days, rank });
    downloadText(text, `SELENE-${site.id}-${i18n.lang}.txt`);
    notify(t('exported'));
  };

  const onCopy = async () => {
    const text = makeBrief({ ...i18n, site, metrics, startMs: landingMs, days, rank });
    try {
      await navigator.clipboard.writeText(text);
      notify(t('copied'));
    } catch {
      notify(t('copyFail'));
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">{t('navSummary')}</p>
          <h1 className="page-title">{t('summaryTitle')}</h1>
          <p className="page-sub">{t('summarySub')}</p>
        </div>
        <div className="page-head-actions">
          <Button icon={Copy} onClick={onCopy}>
            {t('copySummary')}
          </Button>
          <Button variant="primary" icon={Download} onClick={onDownload}>
            {t('downloadTxt')}
          </Button>
        </div>
      </div>

      <div className="grid">
        <div className="col-8">
          <Card className="brief-card" level="elevated">
            <p className="panel-label">{t('assessment')}</p>
            <div className="brief-head">
              <div>
                <h2 className="brief-site">{translated.name}</h2>
                <p className="site-region">{translated.region}</p>
                <p className="site-coords num">
                  {Math.abs(site.lat).toFixed(2)}°S · {site.lon.toFixed(2)}°E
                </p>
              </div>
              <div className="brief-score">
                <ScoreRing value={metrics.score * 100} label={t('missionScore')} />
                <p className="brief-score-value">
                  <span className="num">{int(metrics.score * 100)}</span>
                  <span>/ 100</span>
                </p>
              </div>
            </div>

            <div className="brief-metrics">
              <Metric
                metric="sun"
                size="sm"
                label={t('illumination')}
                value={metrics.sunPct}
                tier={TIER_OF.sunPct}
                note={t('overMission')}
              />
              <Metric
                metric="earth"
                size="sm"
                label={t('earthVisibility')}
                value={metrics.earthPct}
                tier={TIER_OF.earthPct}
                note={t('ofWindow')}
              />
            </div>

            <div className="brief-rec" data-tone={rec}>
              <p className="brief-rec-label">
                <Lightbulb size={15} strokeWidth={2} aria-hidden="true" />
                {t('recommendation')}
              </p>
              <h3 className="brief-rec-title">{t(rec)}</h3>
              <p className="brief-rec-body">{t(`${rec}Text`)}</p>
            </div>

            <p className="brief-blurb">{translated.blurb}</p>
            <p className="brief-window num">
              {t('landingDate')}: {date(landingMs)} · {t('duration')}: {days} {t('dayShort')} ·{' '}
              {dateRange(win.startMs, win.endMs)} · {t('rankOf', { rank })}
            </p>
          </Card>
        </div>

        <div className="col-4">
          <div className="stack">
            <Card>
              <CardHeader
                title={
                  <>
                    {t('batteryTitle')} <TierChip tier={TIER_OF.battery} />
                  </>
                }
                icon={Battery}
              />
              <dl className="facts">
                <div>
                  <dt>{t('energyToStore')}</dt>
                  <dd className="num">{hasNight ? `${(bat.wh / 1000).toFixed(1)} kWh` : '—'}</dd>
                </div>
                <div>
                  <dt>{t('batteryMass')}</dt>
                  <dd className="num">{hasNight ? `${bat.massKg.toFixed(0)} kg` : '—'}</dd>
                </div>
                <div>
                  <dt>{t('longestNight')}</dt>
                  <dd className="num">{fmtHours(metrics.maxSunOutageH)}</dd>
                </div>
                <div>
                  <dt>{t('assumedLoad')}</dt>
                  <dd className="num">{LOAD_KW.toFixed(1)} kW</dd>
                </div>
              </dl>
              <p className="chart-footnote">{t('limitBattery')}</p>
              <p className="chart-footnote">
                {hasNight
                  ? t('batteryNote', {
                      load: LOAD_KW.toFixed(1),
                      dod: Math.round(DEPTH_OF_DISCHARGE * 100),
                      whkg: PACK_WH_PER_KG,
                    })
                  : t('batteryNoNight')}
              </p>
            </Card>

            <Card>
              <CardHeader
                title={
                  <>
                    {t('arrayTitle')} <TierChip tier={TIER_OF.sunPct} />
                  </>
                }
                icon={Gauge}
              />
              <div className="array-bars">
                <div className="array-row" data-metric="sun">
                  <span className="array-label">{t('flatArray')}</span>
                  <span className="array-bar">
                    <span style={{ width: `${Math.min(100, metrics.arrayEff)}%` }} />
                  </span>
                  <span className="num">{incidence(metrics.arrayEff)}</span>
                </div>
                <div className="array-row" data-metric="earth">
                  <span className="array-label">{t('verticalArray')}</span>
                  <span className="array-bar">
                    <span style={{ width: `${Math.min(100, metrics.verticalEff)}%` }} />
                  </span>
                  <span className="num">{incidence(metrics.verticalEff)}</span>
                </div>
              </div>
              <p className="chart-footnote">{t('arrayNote')}</p>
            </Card>

            <Card>
              <CardHeader title={t('rankLabel')} icon={Trophy} />
              <p className="rank-big">
                <span className="num">{rank}</span>
                <span>{t('ofSites', { n: sites.length })}</span>
              </p>
              <div className="rank-badges">
                <Badge metric="sun">{pct(metrics.sunPct)}</Badge>
                <Badge metric="earth">{pct(metrics.earthPct)}</Badge>
                <Badge metric="score">{int(metrics.score * 100)}</Badge>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
