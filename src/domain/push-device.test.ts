import { describe, expect, it } from 'vitest';
import { applicationServerKeyOf, pushSupportOf, type DeviceCapabilities } from './push-device';

const CAPABLE: DeviceCapabilities = {
  serviceWorker: true,
  pushManager: true,
  notification: true,
  permission: 'default',
  appleDevice: false,
  installed: false,
};

describe('pushSupportOf', () => {
  it('active la case sur un navigateur qui sait tout faire', () => {
    expect(pushSupportOf(CAPABLE)).toBe('available');
  });

  it('dit « non supporté » quand une API manque', () => {
    expect(pushSupportOf({ ...CAPABLE, pushManager: false })).toBe('unsupported');
    expect(pushSupportOf({ ...CAPABLE, serviceWorker: false })).toBe('unsupported');
  });

  it('demande l’installation sur iPhone, avant de parler d’API absente', () => {
    expect(
      pushSupportOf({ ...CAPABLE, appleDevice: true, pushManager: false, notification: false }),
    ).toBe('needs-install');
    expect(pushSupportOf({ ...CAPABLE, appleDevice: true, installed: true })).toBe('available');
  });

  it('dit « refusé » quand la permission est bloquée', () => {
    expect(pushSupportOf({ ...CAPABLE, permission: 'denied' })).toBe('denied');
  });
});

describe('applicationServerKeyOf', () => {
  it('décode le base64 d’URL de la clé VAPID', () => {
    expect([...applicationServerKeyOf('AQID_w')]).toEqual([1, 2, 3, 255]);
  });
});
