import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../../constants/theme';

interface Segment<K extends string> {
  key: K;
  label: string;
  /** Shows a dot, e.g. for pending friend requests. */
  dot?: boolean;
}

interface SegmentedControlProps<K extends string> {
  segments: readonly Segment<K>[];
  value: K;
  onChange: (key: K) => void;
}

export default function SegmentedControl<K extends string>({ segments, value, onChange }: SegmentedControlProps<K>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((segment) => {
        const selected = segment.key === value;
        return (
          <TouchableOpacity
            key={segment.key}
            style={[styles.segment, selected && styles.selected]}
            onPress={() => onChange(segment.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            activeOpacity={0.8}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{segment.label}</Text>
            {segment.dot && <View style={styles.dot} accessibilityLabel="new" />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: BORDER_RADIUS.full,
    padding: SPACING.xs,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },
  selected: {
    backgroundColor: COLORS.white,
  },
  label: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
  labelSelected: {
    color: COLORS.textPrimary,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accentRed,
  },
});
