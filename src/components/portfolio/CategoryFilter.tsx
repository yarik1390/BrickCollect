import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ItemCategory } from '../../types';
import { Colors } from '../../constants/colors';
import { FontSize, Radius, Spacing } from '../../constants/theme';

interface Props {
  selected: ItemCategory;
  setCount: number;
  minifigCount: number;
  onChange: (cat: ItemCategory) => void;
}

export default function CategoryFilter({ selected, setCount, minifigCount, onChange }: Props) {
  const tabs: { key: ItemCategory; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'sets', label: `Sets ${setCount}` },
    { key: 'minifigs', label: `Minifigs ${minifigCount}` },
  ];

  return (
    <View style={styles.row}>
      {tabs.map(({ key, label }) => {
        const active = key === selected;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            activeOpacity={0.7}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tabActive: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accent,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  labelActive: {
    color: Colors.accent,
    fontWeight: '600',
  },
});
