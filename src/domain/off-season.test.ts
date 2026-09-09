import { describe, expect, it } from 'vitest';
import { canJoinRegistration, registrationDeadline } from './off-season';

describe('registration window', () => {
  it('keeps a pre-launch season open regardless of its creation age', () => {
    expect(canJoinRegistration('lobby', null, 99 * 3_600_000)).toBe(true);
  });

  it('uses an exact two-hour deadline, including a zero launch timestamp', () => {
    const deadline = 7_200_000;
    expect(registrationDeadline(0)).toBe(deadline);
    expect(canJoinRegistration('launched', 0, deadline - 1)).toBe(true);
    expect(canJoinRegistration('launched', 0, deadline)).toBe(false);
    expect(canJoinRegistration('launched', 0, deadline + 1)).toBe(false);
  });

  it('closes an inconsistent launched season without a launch timestamp', () => {
    expect(canJoinRegistration('launched', null, 0)).toBe(false);
  });

  it('keeps concluded seasons closed', () => {
    expect(canJoinRegistration('concluded', null, 0)).toBe(false);
  });
});
