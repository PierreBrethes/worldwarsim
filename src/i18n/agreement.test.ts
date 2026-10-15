import { describe, expect, it } from 'vitest';
import { CLASSIC_MAPPING } from '@/domain/mouse-mapping';
import { fr, ofName, theBuilding } from './fr';

describe('de before a free-form name', () => {
  it.each([
    ['Paris', 'de Paris'],
    ['essai-nuit-a', 'd’essai-nuit-a'],
    ['Étienne', 'd’Étienne'],
    ['Ödön', 'd’Ödön'],
    ['Ysée', 'd’Ysée'],
    ['Œdipe', 'd’Œdipe'],
    ['Sør-Trøndelag', 'de Sør-Trøndelag'],
    ['', ''],
  ])('writes %s as %s', (name, expected) => {
    expect(ofName(name)).toBe(expected);
  });

  it('elides in the home edition, the table and the waiting line', () => {
    expect(fr.home.edition('essai-nuit-a')).toContain('édition d’essai-nuit-a');
    expect(fr.table.waitNationOf('essai-nuit-b', true)).toBe('le drapeau d’essai-nuit-b');
    expect(fr.table.waitNationOf('Pierre', false)).toBe('la nation de Pierre');
  });
});

describe('the invitation counts places in the feminine', () => {
  const lines = (taken: number) =>
    fr.table.telegram.blitzLines({
      from: 'Pierre',
      theatre: 'Europe',
      when: null,
      seats: { taken, cap: 2 },
    });

  it('says une place prise, not un', () => {
    expect(lines(1)).toContain('une place prise sur deux');
    expect(lines(2)).toContain('deux places prises sur deux');
  });
});

describe('a captured site is named with its article', () => {
  it('starts the sentence with a capital and elides the region', () => {
    const site = `${theBuilding('airfield')} ${ofName('Sør-Trøndelag')}`;
    expect(fr.journal.notices.captured(site)).toBe(
      'L’aérodrome de Sør-Trøndelag est à nous : capture achevée.',
    );
    expect(`${theBuilding('barracks')} ${ofName('Île-de-France')}`).toBe(
      'la caserne d’Île-de-France',
    );
  });
});

describe('the Mondiale texts a Blitz does not show', () => {
  const hand = { finger: false, phone: false, mapping: CLASSIC_MAPPING };
  const text = (blitz: boolean, phone = false) =>
    fr.briefing
      .columns(60, 25, 120, { ...hand, phone }, blitz)
      .flatMap((column) => column.lines)
      .join(' ');

  it('drops outposts, deposits, building and the economy desk from the briefing', () => {
    for (const phone of [false, true]) {
      const blitz = text(true, phone);
      expect(blitz).not.toMatch(/avant-poste|gisement|bâtit|chantier|Économie|mobilisation|rail/);
    }
    expect(text(false)).toMatch(/avant-poste/);
    expect(text(false)).toContain('chantier');
  });

  it('keeps the protractor label from naming a desk that is not there', () => {
    expect(fr.protractor.open(0, true)).not.toContain('chantiers');
    expect(fr.protractor.open(0)).toContain('chantiers');
  });
});

describe('a capture notice declines the site', () => {
  const said = fr.journal.notices;
  it('contracts de + le, keeps la and l’', () => {
    expect(said.captureLifted('le port de Bergen')).toBe('La capture du port de Bergen est levée.');
    expect(said.captureAbandoned('le quartier général de X')).toContain(
      'Capture du quartier général de X abandonnée',
    );
    expect(said.captureVoid('la caserne d’Oslo')).toContain(
      'Capture de la caserne d’Oslo sans objet',
    );
    expect(said.captureLifted('l’aérodrome de Y')).toBe(
      'La capture de l’aérodrome de Y est levée.',
    );
  });
  it('elides the region in the capture label and drops an empty one', () => {
    expect(fr.capture.buildingSite('Caserne', 'Île-de-France')).toBe('Caserne d’Île-de-France');
    expect(fr.capture.buildingSite('Port', '')).toBe('Port');
  });
});

describe('a nickname after "de" elides before a vowel', () => {
  it('elides in the account dossier, the invitation and the full table', () => {
    expect(fr.auth.signedIn('essai-md-a')).toBe('dossier d’essai-md-a');
    expect(fr.auth.signedIn('Paul')).toBe('dossier de Paul');
    expect(fr.invitation.signedIn('Élodie')).toBe('Vous entrez sous le nom d’Élodie.');
  });
});
