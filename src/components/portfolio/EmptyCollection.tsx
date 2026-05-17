import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { FontSize, Radius, Spacing } from '../../constants/theme';

export default function EmptyCollection() {
  const { width } = useWindowDimensions();
  const cardWidth = (width - Spacing.base * 2 - Spacing.md) / 2;

  return (
    <View style={styles.row}>
      <PlaceholderCard
        width={cardWidth}
        icon="barcode-outline"
        text="Scan a set to add it to your collection"
      />
      <PlaceholderCard
        width={cardWidth}
        icon="person-outline"
        text="Scan a minifigure to add it to your collection"
      />
    </View>
  );
}

function PlaceholderCard({ width, icon, text }: { width: number; icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={Colors.textTertiary} />
      </View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    padding: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 160,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 17,
  },
});
