/**
 * Password strength — pure, no React Native imports, so it is unit-testable.
 *
 * The meter must never praise a password the server will reject. The old one
 * said "Good" at 6-7 characters while sign-up requires 8, so anything below
 * the minimum now reads as "Too short" and nothing else.
 */

export const MIN_PASSWORD_LENGTH = 8;

const STRONG_LENGTH = 12;
const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];

export type StrengthLevel = 'tooShort' | 'ok' | 'good' | 'strong';

export interface PasswordStrength {
  level: StrengthLevel;
  label: string;
  color: string;
  /** Bar fill, 0-100. */
  percent: number;
}

export function getPasswordStrength(password: string): PasswordStrength | null {
  if (!password) return null;

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      level: 'tooShort',
      label: `Too short (${password.length}/${MIN_PASSWORD_LENGTH})`,
      color: '#EF4444',
      percent: 20,
    };
  }

  const classCount = CHARACTER_CLASSES.filter((re) => re.test(password)).length;
  const score = (password.length >= STRONG_LENGTH ? 1 : 0) + (classCount >= 3 ? 1 : 0);

  if (score === 0) return { level: 'ok', label: 'OK', color: '#F59E0B', percent: 50 };
  if (score === 1) return { level: 'good', label: 'Good', color: '#3B82F6', percent: 75 };
  return { level: 'strong', label: 'Strong', color: '#10B981', percent: 100 };
}
