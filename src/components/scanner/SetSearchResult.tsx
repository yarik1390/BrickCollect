import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CollectionItem } from '../../types';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';
import { formatCurrency } from '../../utils/format';

interface Props {
  item: CollectionItem | null;
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onDismiss: () => void;
}

export default function SetSearchResult({ item, loading, error, onAdd, onDismiss }: Props) {
  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Looking up set...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.center}>
          <Ionicons name="warning-outline" size={32} color={Colors.negative} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {item && !loading && !error && (
        <View style={styles.result}>
          <Image source={{ uri: item.set_img_url }} style={styles.image} resizeMode="contain" />
          <View style={styles.details}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>#{item.set_num} · {item.theme_name} · {item.year}</Text>
            <Text style={styles.pieces}>{item.num_parts.toLocaleString()} pieces · {item.num_minifigs} minifigs</Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity onPress={onAdd} style={styles.addBtn} activeOpacity={0.8}>
              <Ionicons name="add" size={20} color={Colors.textInverse} />
              <Text style={styles.addText}>Add to Collection</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDismiss} style={styles.skipBtn} activeOpacity={0.8}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingBottom: 32,
    minHeight: 220,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.base,
  },
  center: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  dismissBtn: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dismissText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  result: {
    paddingHorizontal: Spacing.base,
  },
  image: {
    width: '100%',
    height: 140,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
  },
  details: {
    marginBottom: Spacing.base,
  },
  name: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  meta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  pieces: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
  actions: {
    gap: Spacing.sm,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.base,
  },
  addText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  skipText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
});
