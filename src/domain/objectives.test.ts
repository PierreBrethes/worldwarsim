import { describe, expect, it } from 'vitest';
import { carriesSurveyedInstallation } from './objectives';

/**
 * **Une attaque vise ce qu'on a relevé** (ADR 0024 §4). La question se pose par région, parce que
 * c'est la seule clé qu'un relevé d'installation porte — et les deux bouts du fil la posent à
 * cette fonction-ci, jamais à deux tables (ADR 0015).
 */
describe('what makes a place worth attacking', () => {
  const surveyed = [{ regionId: 'ITA-1' }, { regionId: 'ESP-2' }];

  it('accepts a region carrying an installation the observer has surveyed', () => {
    expect(carriesSurveyedInstallation('ITA-1', surveyed)).toBe(true);
  });

  it('refuses a region the observer has surveyed nothing in', () => {
    expect(carriesSurveyedInstallation('FRA-9', surveyed)).toBe(false);
  });

  /** Au dézoom la carte ne dessine aucune région : `null` est la réponse honnête, et elle ne
   *  fabrique pas une cible. */
  it('refuses ground the map draws no region under', () => {
    expect(carriesSurveyedInstallation(null, surveyed)).toBe(false);
  });

  it('refuses everything when nothing has been surveyed', () => {
    expect(carriesSurveyedInstallation('ITA-1', [])).toBe(false);
  });
});
