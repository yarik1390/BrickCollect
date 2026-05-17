import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { CollectionItem } from '../../types';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Radius, Shadows, Spacing } from '../../constants/theme';
import { formatCurrency } from '../../utils/format';

interface Props {
  item: CollectionItem;
  onPress: () => void;
}

export default function CollectionItemCard({ item, onPress }: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - Spacing.base * 2 - Spacing.md) / 2;
  const imageHeight = cardWidth * 0.75;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.card, { width: cardWidth }, Shadows.subtle]}
    >
      <View style={[styles.imageWrap, { height: imageHeight }]}>
        <Image
          source={{ uri: item.set_img_url }}
          style={styles.image}
          resizeMode="contain"
        />
        {item.quantity > 1 && (
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyText}>×{item.quantity}</Text>
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.price}>{formatCurrency(item.market_value * item.quantity)}</Text>
        <View style={styles.meta}>
          <Text style={styles.setNum}>#{item.set_num}</Text>
          <View style={[styles.condDot, { backgroundColor: conditionColor(item.condition) }]} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function conditionColor(c: CollectionItem['condition']): string {
  if (c === 'New') return Colors.positive;
  if (c === 'Sealed') return Colors.warning;
  return Colors.textTertiary;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  imageWrap: {
    backgroundColor: Colors.surfaceElevated,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  qtyBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  qtyText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
  },
  info: {
    padding: Spacing.md,
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 4,
    lineHeight: 18,
  },
  price: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
    marginBottom: 6,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  setNum: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  condDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
