import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { FontSize, Radius, Spacing } from '../../constants/theme';

interface Props {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  color?: string;
  bg?: string;
  style?: ViewStyle;
}

export default function Badge({ label, icon, color = Colors.textSecondary, bg = Colors.surfaceElevated, style }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      {icon && <Ionicons name={icon} size={12} color={color} style={styles.icon} />}
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
});
