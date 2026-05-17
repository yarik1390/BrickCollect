import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { TimeRange } from '../../types';
import { Colors } from '../../constants/colors';
import { FontSize, Radius, Spacing } from '../../constants/theme';

const RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

interface Props {
  selected: TimeRange;
  onChange: (r: TimeRange) => void;
}

export default function TimeRangeFilter({ selected, onChange }: Props) {
  return (
    <View style={styles.row}>
      {RANGES.map((r) => {
        const active = r === selected;
        return (
          <TouchableOpacity
            key={r}
            onPress={() => onChange(r)}
            activeOpacity={0.7}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{r}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  pill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    minWidth: 38,
    alignItems: 'center',
  },
  pillActive: {
    backgroundColor: Colors.accent,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },
  labelActive: {
    color: Colors.textInverse,
  },
});
