import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  purgeLegacyCredentials,
  getLegacyEmailHint,
  LEGACY_EMAIL_HINT_KEY,
} from '../legacyCredentialPurge';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('purgeLegacyCredentials', () => {
  test('removes plaintext passwords from both legacy key namespaces', async () => {
    await AsyncStorage.multiSet([
      ['@atomicstep/password', 'hunter2'],
      ['@habitflow/password', 'older-secret'],
    ]);

    await purgeLegacyCredentials();

    expect(await AsyncStorage.getItem('@atomicstep/password')).toBeNull();
    expect(await AsyncStorage.getItem('@habitflow/password')).toBeNull();
  });

  test('keeps the current-namespace email as a hint and removes the originals', async () => {
    await AsyncStorage.multiSet([
      ['@atomicstep/email', 'current@example.com'],
      ['@habitflow/email', 'older@example.com'],
    ]);

    await purgeLegacyCredentials();

    expect(await getLegacyEmailHint()).toBe('current@example.com');
    expect(await AsyncStorage.getItem('@atomicstep/email')).toBeNull();
    expect(await AsyncStorage.getItem('@habitflow/email')).toBeNull();
  });

  test('falls back to the older namespace email when that is all there is', async () => {
    await AsyncStorage.setItem('@habitflow/email', 'older@example.com');

    await purgeLegacyCredentials();

    expect(await getLegacyEmailHint()).toBe('older@example.com');
  });

  test('leaves habits, badges and the display name untouched', async () => {
    await AsyncStorage.multiSet([
      ['@atomicstep/password', 'hunter2'],
      ['@atomicstep/habits', '[{"id":"h1"}]'],
      ['@atomicstep/badges', '[]'],
      ['@atomicstep/username', 'Meet'],
    ]);

    await purgeLegacyCredentials();

    expect(await AsyncStorage.getItem('@atomicstep/habits')).toBe('[{"id":"h1"}]');
    expect(await AsyncStorage.getItem('@atomicstep/badges')).toBe('[]');
    expect(await AsyncStorage.getItem('@atomicstep/username')).toBe('Meet');
  });

  test('writes nothing when there is nothing to purge', async () => {
    await purgeLegacyCredentials();

    expect(await AsyncStorage.getItem(LEGACY_EMAIL_HINT_KEY)).toBeNull();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  test('purges again if a restored backup brings the keys back', async () => {
    // No "already done" flag by design: this is the case it protects.
    await AsyncStorage.setItem('@atomicstep/password', 'hunter2');
    await purgeLegacyCredentials();
    await AsyncStorage.setItem('@atomicstep/password', 'hunter2'); // backup restored

    await purgeLegacyCredentials();

    expect(await AsyncStorage.getItem('@atomicstep/password')).toBeNull();
  });
});
