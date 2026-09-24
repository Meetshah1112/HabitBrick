/**
 * A person's initials on a colour derived from their username.
 *
 * Deliberately never loads `avatar_url`. That field is set by the other user,
 * so rendering it would let anyone make their friends' phones fetch an
 * arbitrary URL — a tracking pixel that leaks each viewer's IP address.
 * Uploaded avatars need a moderated, first-party storage bucket first.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const PALETTE = ['#E86E3C', '#059669', '#3B82F6', '#A855F7', '#D97706', '#0D9488', '#E11D48', '#4F46E5'];

function colourFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function initialsOf(name: string): string {
  const words = name.replace(/_/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

interface InitialsAvatarProps {
  name: string;
  /** Stable seed for the colour; the username, so renaming keeps the colour. */
  seed: string;
  size?: number;
}

export default function InitialsAvatar({ name, seed, size = 40 }: InitialsAvatarProps) {
  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colourFor(seed) }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.text, { fontSize: size * 0.38 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
