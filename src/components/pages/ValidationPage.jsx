import { BookOpen, CheckCircle2, Telescope, TriangleAlert } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import {
  SOURCES,
  runValidation,
  runSkyChecks,
  MODEL_FACTS,
  VALIDATION_DAYS,
  VALIDATION_START_MS,
} from '../../lib/validation.js';
import { pct } from '../../lib/format.js';
import { MODEL_VERSION, LAST_UPDATED, TIER_OF } from '../../lib/model-meta.js';
import { TierChip } from '../ui/TierChip.jsx';

export default function ValidationPage() {
  const { t, date } = useI18n();
  const report = runValidation();
  const sky = runSkyChecks();
  const published = report.rows.filter((r) => r.confidence === 'published').length;
  const derived = report.total - published;
  const allPass = report.passed === report.total;
  // Rows that sit far from the published figure, in either direction. We show
  // them with their explanation rather than hiding them behind a tolerance.
  const differs = report.rows
    .filter((r) => r.confidence === 'published' && Math.abs(r.value - r.published) >= 5)
    .sort((a, b) => Math.abs(b.value - b.published) - Math.abs(a.value - a.published));

  const sunResidual = sky.sunMaxElevDeg - sky.sunMaxPublishedDeg;
  const [earthMin, earthMax] = MODEL_FACTS.earthDiskRangeDeg;
  const [moonMin, moonMax] = MODEL_FACTS.moonDiskRangeDeg;
  // Earth-from-the-Moon against the Moon-from-Earth: the classic 3.7× claim.
  const [ratioMin] = MODEL_FACTS.sizeRatioRange; // constant: radius ratio

  // Every row prints the model value first and the published figure next to it,
  // so the reader can see the difference rather than take the model's word.
  const facts = [
    {
      label: t('valElevationSwing'),
      value: `${sky.earthAltMin.toFixed(1)}° … +${sky.earthAltMax.toFixed(1)}°`,
      published: '±6.5° (Kaguya)',
    },
    {
      label: t('valAboveLimb'),
      value: pct(sky.earthAboveLimbShare),
      published: '≈ 50% (NASA)',
    },
    {
      label: t('skySunMax'),
      value: `${sky.sunMaxElevDeg.toFixed(2)}°`,
      published: `${sky.sunMaxPublishedDeg.toFixed(2)}° (IAU obliquity)`,
      note: Math.abs(sunResidual) >= 0.03 ? t('skySunMaxNote', { d: sunResidual.toFixed(2) }) : null,
    },
    {
      label: t('valEarthSize'),
      value: `${ratioMin.toFixed(1)}×`,
      published: `${earthMin.toFixed(2)}–${earthMax.toFixed(2)}° vs ${moonMin.toFixed(2)}–${moonMax.toFixed(2)}° (paper 1.8–2.1° vs 0.52–0.56°)`,
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="kicker">{t('navValidation')}</p>
          <h1 className="page-title">{t('valTitle')}</h1>
          <p className="page-sub">{t('valSub')}</p>
          <p className="page-note num">
            {t('valWindow', { days: VALIDATION_DAYS, date: date(VALIDATION_START_MS) })}
          </p>
        </div>
        <div className="status-card">
          <Badge tone={allPass ? 'success' : 'danger'} icon={allPass ? CheckCircle2 : TriangleAlert}>
            {t('checksPassing', { pass: report.passed, total: report.total })}
          </Badge>
          <dl className="status-meta">
            <div>
              <dt>{t('modelVersion')}</dt>
              <dd className="num">{MODEL_VERSION}</dd>
            </div>
            <div>
              <dt>{t('lastUpdate')}</dt>
              <dd className="num">{LAST_UPDATED}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="grid">
        <div className="col-8">
          <Card className="table-card">
            <CardHeader title={t('checksPassing', { pass: report.passed, total: report.total })} subtitle={t('publishedCount', { n: published, m: derived })} />
            <table className="data-table data-table--compact">
              <caption className="sr-only">{t('valTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('siteCol')}</th>
                  <th scope="col">{t('valModel')}</th>
                  <th scope="col" className="num">
                    {t('modelCol')} <TierChip tier={TIER_OF.sunPct} />
                  </th>
                  <th scope="col" className="num">
                    {t('publishedCol')} <TierChip tier="measured" />
                  </th>
                  <th scope="col">{t('statusCol')}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">
                      <span className="table-site">{row.site.name}</span>
                      <span className="table-region">{t(row.metricKey)}</span>
                    </th>
                    <td>
                      <Badge tone={row.confidence === 'published' ? 'accent' : 'neutral'}>
                        {row.confidence === 'published' ? t('published') : t('derived')}
                      </Badge>
                    </td>
                    <td className="num" data-metric={row.metric === 'sunPct' ? 'sun' : 'earth'}>
                      {pct(row.value)}
                    </td>
                    <td className="num" title={`${row.published} ± ${row.tol}`}>
                      {row.published}
                      <span className="cell-tol num"> ±{row.tol}</span>
                    </td>
                    <td>
                      {/* A tick that only survives because the tolerance was set
                          wide is not a match. Those rows say so out loud. */}
                      {row.pass && row.confidence === 'published' && Math.abs(row.value - row.published) >= 5 ? (
                        <Badge tone="warn" icon={TriangleAlert} title={t('passWideTitle')}>
                          {t('passWide', { tol: row.tol })}
                        </Badge>
                      ) : (
                        <Badge tone={row.pass ? 'success' : 'danger'} icon={row.pass ? CheckCircle2 : TriangleAlert}>
                          {row.pass ? t('pass') : t('fail')}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="chart-footnote">
              {t('valMethod')} {t('valNotCertification')}
            </p>
            <p className="chart-footnote">{t('valHonestNote')}</p>
            <p className="chart-footnote">{t('valHorizonBand')}</p>
            {differs.length > 0 && (
              <div className="honest-note">
                <p className="honest-title">
                  <TriangleAlert size={16} strokeWidth={2} aria-hidden="true" />
                  {t('honestTitle')}
                </p>
                <ul className="honest-list">
                  {differs.map((row) => (
                    <li key={row.id}>
                      <strong>
                        {row.site.name} · {t(row.metricKey)}: {pct(row.value)} vs {row.published}%
                      </strong>{' '}
                      — {row.why}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="col-4">
          <div className="stack">
            <Card>
              <CardHeader title={t('skyTitle')} icon={Telescope} />
              <dl className="facts facts--sky">
                {facts.map((f) => (
                  <div key={f.label}>
                    <dt>{f.label}</dt>
                    <dd>
                      <span className="num">{f.value}</span>
                    </dd>
                    <p className="fact-published num">{f.published}</p>
                    {f.note && <p className="fact-note">{f.note}</p>}
                  </div>
                ))}
              </dl>
              <p className="chart-footnote">
                {t('skyFormula', { lib: MODEL_FACTS.librationLatMaxDeg.toFixed(1) })}
              </p>
            </Card>

            <Card>
              <CardHeader title={t('sourcesTitle')} icon={BookOpen} />
              <ul className="source-list">
                {SOURCES.map((s) => (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="source-link">
                      {s.title}
                    </a>
                    <p className="source-note">{s.note}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
