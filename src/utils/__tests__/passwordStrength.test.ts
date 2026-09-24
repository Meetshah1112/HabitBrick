import { getPasswordStrength, MIN_PASSWORD_LENGTH } from '../passwordStrength';

describe('getPasswordStrength', () => {
  test('returns null for an empty password so no meter is shown', () => {
    expect(getPasswordStrength('')).toBeNull();
  });

  test('never rates a password below the server minimum as anything but too short', () => {
    // The old meter said "Good" at 6-7 characters while sign-up rejected them.
    for (let length = 1; length < MIN_PASSWORD_LENGTH; length++) {
      const strength = getPasswordStrength('Aa1!'.repeat(4).slice(0, length));
      expect(strength?.level).toBe('tooShort');
    }
  });

  test('shows progress toward the minimum', () => {
    expect(getPasswordStrength('abcdef')?.label).toBe('Too short (6/8)');
  });

  test('rates a minimum-length single-class password as ok', () => {
    expect(getPasswordStrength('abcdefgh')?.level).toBe('ok');
  });

  test('rewards length alone with good', () => {
    expect(getPasswordStrength('plainlowercase')?.level).toBe('good');
  });

  test('rewards character variety alone with good', () => {
    expect(getPasswordStrength('Abcdef12')?.level).toBe('good');
  });

  test('rates a long, varied password as strong', () => {
    expect(getPasswordStrength('Brick-Laying-42x')?.level).toBe('strong');
  });
});
