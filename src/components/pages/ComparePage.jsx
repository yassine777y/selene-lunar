import { ArrowRight, Trophy } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button, SegmentedControl } from '../ui/Controls.jsx';
import { DateField } from '../ui/DateField.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useMission } from '../../lib/store.jsx';
import { analyseWindow } from '../../lib/metrics.js';
import { hours, int, pct } from '../../lib/format.js';
import { TIER_OF } from '../../lib/model-meta.js';
import { TierChip } from '../ui/TierChip.jsx';
import { MS_DAY } from '../../lib/astro.js';

const SLIPS = [0, 14, 28, 42, 56, 70];

export default function ComparePage() {
  const { t, siteText, dateRange } = useI18n();
  const { sites, summaries, ranking, window: win, landingMs, days, setLanding, setDays, goToSite } = useMission();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">{t('navCompare')}</p>
          <h1 className="page-title">{t('compareTitle')}</h1>
          <p className="page-sub">{t('compareSub')}</p>
        </div>
        <div className="page-head-controls">
          <DateField id="landing-date" label={t('landingDate')} value={landingMs} onChange={setLanding} />
          <div className="field">
            <span className="field-label">{t('duration')}</span>
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
      </div>

      <p className="window-note num">{dateRange(win.startMs, win.endMs)}</p>

      <Card className="table-card">
        <table className="data-table">
          <caption className="sr-only">{t('compareTitle')}</caption>
          <thead>
            <tr>
              <th scope="col" className="col-rank">
                {t('rankCol')}
              </th>
              <th scope="col">{t('siteCol')}</th>
              <th scope="col" className="num">
                {t('sunCol')} <TierChip tier={TIER_OF.sunPct} />
              </th>
              <th scope="col" className="num">
                {t('earthCol')} <TierChip tier={TIER_OF.earthPct} />
              </th>
              <th scope="col" className="num">
                {t('scoreCol')} <TierChip tier={TIER_OF.score} />
              </th>
              <th scope="col" className="num">
                {t('nightCol')}
              </th>
              <th scope="col" className="num">
                {t('gapCol')}
              </th>
              <th scope="col">
                <span className="sr-only">{t('explore')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((s, i) => {
              const m = summaries[s.id];
              return (
                <tr key={s.id} className={i === 0 ? 'is-best' : ''}>
                  <td className="col-rank num">
                    {i === 0 ? <Trophy size={16} aria-label={t('bestMatch')} className="trophy" /> : <span>{i + 1}</span>}
                  </td>
                  <th scope="row">
                    <span className="table-site">{siteText(s).name}</span>
                    <span className="table-region">{siteText(s).region}</span>
                  </th>
                  <td className="num" data-metric="sun">
                    <span className="cell-value">{pct(m.sunPct)}</span>
                    <span className="cell-meter" aria-hidden="true">
                      <i style={{ width: `${m.sunPct}%` }} />
                    </span>
                  </td>
                  <td className="num" data-metric="earth">
                    <span className="cell-value">{pct(m.earthPct)}</span>
                    <span className="cell-meter" aria-hidden="true">
                      <i style={{ width: `${m.earthPct}%` }} />
                    </span>
                  </td>
                  <td className="num" data-metric="score">
                    <strong>{int(m.score * 100)}</strong>
                    <span className="cell-meter" aria-hidden="true">
                      <i style={{ width: `${m.score * 100}%` }} />
                    </span>
                  </td>
                  <td className="num">{hours(m.maxSunOutageH)}</td>
                  <td className="num">{hours(m.maxEarthOutageH)}</td>
                  <td className="col-action">
                    <Button variant="ghost" className="btn--forward" icon={ArrowRight} onClick={() => goToSite(s.id)}>
                      {t('explore')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* The definitions and the tier of each column, where the table is read
            rather than on another page: two columns called "%" can mean two
            different things if nobody says which. */}
        <div className="table-legend">
          <p className="table-legend-title">{t('compareLegendTitle')}</p>
          <p className="table-legend-row">
            <span className="table-legend-key">{t('sunCol')}</span>
            {t('defSun')}
          </p>
          <p className="table-legend-row">
            <span className="table-legend-key">{t('earthCol')}</span>
            {t('defEarth')} {t('limitEarth')}
          </p>
          <p className="table-legend-row">
            <span className="table-legend-key">{t('scoreCol')}</span>
            {t('scoreFormula')} — {t('limitScore')}
          </p>
          <p className="table-legend-row">
            <span className="table-legend-key">{t('comparePublishedKey')}</span>
            {t('comparePublished')}
          </p>
          <p className="table-legend-row">
            <span className="table-legend-key">{t('rankCol')}</span>
            {t('compareTies')}
          </p>
        </div>
      </Card>

      <Card className="slip-card">
        <CardHeader title={t('slipTitle')} subtitle={t('slipSub')} />
        <div className="slip-grid" role="table" aria-label={t('slipTitle')}>
          <div className="slip-row slip-head" role="row">
            <span role="columnheader">{t('siteCol')}</span>
            {SLIPS.map((d) => (
              <span key={d} role="columnheader" className="num">
                {d === 0 ? t('onSchedule') : `+${d} ${t('dayShort')}`}
              </span>
            ))}
          </div>
          {sites.map((s) => (
            <div className="slip-row" role="row" key={s.id}>
              <span role="rowheader" className="slip-site">
                {siteText(s).name}
              </span>
              {SLIPS.map((d) => {
                const m = analyseWindow(s, landingMs + d * MS_DAY, days, 3);
                const tone = m.sunPct >= 80 ? 'strong' : m.sunPct >= 65 ? 'workable' : 'poor';
                return (
                  <button
                    key={d}
                    type="button"
                    role="cell"
                    className={`slip-cell slip-cell--${tone}`}
                    onClick={() => {
                      setLanding(landingMs + d * MS_DAY);
                      goToSite(s.id);
                    }}
                    aria-label={`${siteText(s).name}, +${d} ${t('dayShort')}: ${pct(m.sunPct)}`}
                  >
                    <span className="num">{m.sunPct.toFixed(0)}</span>
                    <span className="slip-sub num">{m.earthPct.toFixed(0)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="chart-footnote">{t('slipNote')}</p>
      </Card>

      <div className="legend-row">
        <Badge tone="success">{t('strong')}</Badge>
        <Badge tone="warn">{t('workable')}</Badge>
        <Badge tone="danger">{t('poor')}</Badge>
      </div>
    </div>
  );
}
