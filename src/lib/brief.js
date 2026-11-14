import { SCORE_WEIGHTS } from './metrics.js';

export function recommendation(metrics) {
  if (metrics.sunPct >= 75 && metrics.earthPct >= 65 && metrics.maxSunOutageH <= 120) return 'go';
  if (metrics.earthPct >= 80 && (metrics.sunPct < 75 || metrics.maxSunOutageH > 120)) return 'power';
  if (metrics.sunPct >= 70 || metrics.earthPct >= 80) return 'conditional';
  return 'risk';
}
export function makeBrief({ t, siteText, date, hours, site, metrics, startMs, days, rank }) {
  const s = siteText(site), rec = recommendation(metrics);
  return `SELENE — ${t('assessment')}\n${'═'.repeat(45)}\n\n${s.name}\n${s.region}\n${Math.abs(site.lat).toFixed(2)}°S · ${site.lon.toFixed(2)}°E\n\n${t('landingDate')}: ${date(startMs)}\n${t('duration')}: ${days} ${t('days')}\n${t('rankOf', { rank })}\n\n${t('illumination')}: ${metrics.sunPct.toFixed(1)}%\n${t('earthLink')}: ${metrics.earthPct.toFixed(1)}%\n${t('missionScore')}: ${Math.round(metrics.score * 100)} / 100\n${t('longestNight')}: ${hours(metrics.maxSunOutageH)}\n${t('commsGap')}: ${hours(metrics.maxEarthOutageH)}\n${t('peakSun')}: ${metrics.sunAltMax.toFixed(1)}°\n${t('peakEarth')}: ${metrics.earthAltMax.toFixed(1)}°\n\n${t('recommendation')}: ${t(rec)}\n${t(`${rec}Text`)}\n\n${s.blurb}\n\n${t('modelIntro')}\n${t('modelScore', { sun: Math.round(SCORE_WEIGHTS.sun * 100), earth: Math.round(SCORE_WEIGHTS.earth * 100), night: Math.round(SCORE_WEIGHTS.night * 100) })}`;
}
export function downloadText(text, filename) {
  const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
