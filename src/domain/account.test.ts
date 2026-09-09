import { describe, expect, it } from 'vitest';
import { nicknameKey, nicknameRefusal, normalizeNickname, passwordRefusal } from './account';

describe('account nicknames', () => {
  it('trims the display nickname and normalizes it to NFC', () => {
    expect(normalizeNickname('  Le\u0301a  ')).toBe('Léa');
  });

  it('builds a lowercase accent-insensitive uniqueness key', () => {
    expect(nicknameKey('  Pièrre  ')).toBe('pierre');
    expect(nicknameKey('Le\u0301a')).toBe(nicknameKey('Léa'));
  });

  it('enforces the nickname bounds after normalization', () => {
    expect(nicknameRefusal('Pi')).toBe('NICKNAME_INVALID');
    expect(nicknameRefusal('P'.repeat(16))).toBeNull();
    expect(nicknameRefusal('P'.repeat(17))).toBe('NICKNAME_INVALID');
    expect(nicknameRefusal('   ')).toBe('NICKNAME_INVALID');
  });

  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(nicknameRefusal('😀😀😀')).toBeNull();
    expect(nicknameRefusal('😀'.repeat(16))).toBeNull();
    expect(nicknameRefusal('😀'.repeat(17))).toBe('NICKNAME_INVALID');
  });

  it('rejects control and format characters before trimming', () => {
    expect(nicknameRefusal('\tPierre\t')).toBe('NICKNAME_INVALID');
    expect(nicknameRefusal('Pierre\u200b')).toBe('NICKNAME_INVALID');
    expect(nicknameRefusal('\u200b\u200b\u200b')).toBe('NICKNAME_INVALID');
  });

  it('rejects a nickname made only of combining marks', () => {
    expect(nicknameRefusal('\u0301\u0301\u0301')).toBe('NICKNAME_INVALID');
  });

  it('accepts ordinary edge and internal spaces', () => {
    expect(nicknameRefusal('  Léa  ')).toBeNull();
    expect(nicknameRefusal('Jean Pierre')).toBeNull();
  });
});

describe('account passwords', () => {
  it('enforces the byte bounds without trimming', () => {
    expect(passwordRefusal('1234567')).toBe('PASSWORD_TOO_SHORT');
    expect(passwordRefusal('12345678')).toBeNull();
    expect(passwordRefusal('        ')).toBeNull();
  });

  it('measures Unicode passwords in UTF-8 bytes', () => {
    expect(passwordRefusal('é'.repeat(4))).toBeNull();
    expect(passwordRefusal('é'.repeat(36))).toBeNull();
    expect(passwordRefusal('é'.repeat(36) + 'a')).toBe('PASSWORD_TOO_LONG');
  });
});
