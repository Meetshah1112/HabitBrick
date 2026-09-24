/**
 * Inline status message for forms — replaces Alert.alert, which is effectively
 * a no-op on web and would make errors vanish silently there.
 *
 * accessibilityLiveRegion makes screen readers announce the message when it
 * appears, so the error is not only visual.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type Notice = { kind: 'error' | 'info'; text: string } | null;

export default function NoticeBanner({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const isError = notice.kind === 'error';

  return (
    <View
      style={[styles.banner, isError ? styles.error : styles.info]}
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.text, isError ? styles.textError : styles.textInfo]}>
        {notice.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  error: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  info: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  text: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  textError: {
    color: '#B91C1C',
  },
  textInfo: {
    color: '#15803D',
  },
});
