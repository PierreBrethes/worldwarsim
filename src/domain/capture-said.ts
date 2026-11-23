import { fr } from '@/i18n/fr';
import { isHqSite, progressAt } from './capture';
import { asClockTime } from './duration';
import { captureSiteName } from './labels';
import type { CaptureView } from './player-view';

/** Ce qu'un lecteur de capture a besoin de savoir : l'anneau n'a pas l'objet entier de la vue. */
type Said = Pick<CaptureView, 'side' | 'site' | 'clock' | 'completesAt' | 'suspended'> &
  Partial<Pick<CaptureView, 'regionName'>>;

/**
 * **Une capture se dit à tous ses lecteurs d'une seule voix** (ADR 0044, #622) : l'anneau et
 * l'affiche (`gauge`), la feuille du site (`why`), la ligne « à faire » (`todo`). Gelée, elle dit
 * la faim ; passé son heure, elle se conclut — jamais « perdu vers » une heure déjà passée, que le
 * défenseur ne saurait pas expliquer ; sinon, l'heure de fin.
 */
export function captureSaid(capture: Said, now: number, form: 'gauge' | 'why' | 'todo'): string {
  if (capture.suspended === true) return fr.capture.suspended;
  const due = capture.completesAt <= now;
  const hour = asClockTime(capture.completesAt);
  if (form === 'why') return due ? fr.capture.concludingWhy : fr.capture.underCaptureWhy(hour);
  if (form === 'todo') {
    const site = captureSiteName({ site: capture.site, regionName: capture.regionName ?? null });
    return due ? fr.nextActions.siteConcluding(site) : fr.nextActions.siteUnderCapture(site, hour);
  }
  const percent = Math.floor(progressAt(capture.clock, now) * 100);
  if (due) return fr.capture.concluding(percent);
  return capture.side === 'capturer'
    ? fr.capture.endsAt(percent, hour)
    : fr.capture.lostAt(percent, hour, isHqSite(capture.site));
}
