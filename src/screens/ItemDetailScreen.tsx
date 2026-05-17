import React from 'react';
import {
  View, Text, ScrollView, Image, StyleSheet,
  TouchableOpacity, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useCollectionStore } from '../store/collectionStore';
import { RootStackParamList } from '../navigation/types';
import QuantityControl from '../components/ui/QuantityControl';
import Badge from '../components/ui/Badge';
import { Colors } from '../constants/colors';
import { FontSize, FontWeight, Radius, Shadows, Spacing } from '../constants/theme';
import { formatCurrency, formatPercent } from '../utils/format';

type Route = RouteProp<RootStackParamList, 'ItemDetail'>;

export default function ItemDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { itemId } = route.params;
  const store = useCollectionStore();

  const item = store.items.find((i) => i.id === itemId);

  if (!item) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={{ color: Colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
          Item not found
        </Text>
      </View>
    );
  }

  const { width } = useWindowDimensions();
  const imageHeight = width * 0.65;

  const change2y = ((item.forecast_2y - item.market_value) / item.market_value) * 100;
  const change5y = ((item.forecast_5y - item.market_value) / item.market_value) * 100;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero image */}
        <View style={[styles.imageContainer, { height: imageHeight }]}>
          <Image
            source={{ uri: item.set_img_url }}
            style={styles.heroImage}
            resizeMode="contain"
          />
          <View style={styles.gradientOverlay} />

          {/* Close button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.closeBtn, { top: insets.top + 12 }]}
            activeOpacity={0.8}
          >
            <BlurView intensity={40} tint="dark" style={styles.blurBtn}>
              <Ionicons name="close" size={18} color={Colors.textPrimary} />
            </BlurView>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.name}>{item.name}</Text>

          <View style={styles.badgeRow}>
            <Badge label={item.set_num} icon="pricetag-outline" />
            {item.num_minifigs > 0 && (
              <Badge label="Includes minifigs" icon="person-outline" />
            )}
          </View>

          {/* Quantity */}
          <View style={styles.card}>
            <View style={styles.qtyRow}>
              <View style={styles.qtyLabel}>
                <Ionicons name="layers-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.qtyLabelText}>Quantity Owned</Text>
              </View>
              <QuantityControl
                quantity={item.quantity}
                onIncrement={() => store.updateQuantity(item.id, 1)}
                onDecrement={() => store.updateQuantity(item.id, -1)}
              />
            </View>
          </View>

          {/* Market value */}
          <View style={[styles.card, styles.valueCard]}>
            <View>
              <Text style={styles.valueLabel}>Market Value</Text>
              <Text style={styles.valuePrice}>{formatCurrency(item.market_value)}</Text>
            </View>
            <View style={styles.valueIcon}>
              <Ionicons name="trending-up" size={22} color={Colors.accentDim} />
            </View>
          </View>

          {/* Details grid */}
          <View style={styles.detailGrid}>
            <DetailCell label="Theme" value={item.theme_name} />
            <DetailCell label="Year" value={String(item.year)} />
            <DetailCell label="Condition" value={item.condition} />
            <DetailCell label="Pieces" value={item.num_parts.toLocaleString()} />
          </View>

          {/* Stats rows */}
          {item.num_minifigs > 0 && (
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Minifigures</Text>
              <Text style={styles.statValue}>{item.num_minifigs}</Text>
            </View>
          )}

          {item.retail_price !== null && (
            <View style={[styles.statRow, styles.statRowBorder]}>
              <Text style={styles.statLabel}>Retail Price</Text>
              <Text style={styles.statValue}>{formatCurrency(item.retail_price)}</Text>
            </View>
          )}

          {/* Price forecast */}
          <View style={styles.forecastSection}>
            <Text style={styles.forecastTitle}>Price Forecast</Text>
            <View style={styles.forecastRow}>
              <ForecastCard label="2 Years" value={item.forecast_2y} change={change2y} />
              <ForecastCard label="5 Years" value={item.forecast_5y} change={change5y} />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={cellStyles.cell}>
      <Text style={cellStyles.label}>{label}</Text>
      <Text style={cellStyles.value}>{value}</Text>
    </View>
  );
}

const cellStyles = StyleSheet.create({
  cell: {
    width: '50%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginBottom: 6,
  },
  value: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
});

function ForecastCard({ label, value, change }: { label: string; value: number; change: number }) {
  const isPos = change >= 0;
  return (
    <View style={forecastStyles.card}>
      <Text style={forecastStyles.label}>{label}</Text>
      <Text style={forecastStyles.value}>{formatCurrency(value)}</Text>
      <View style={forecastStyles.changeRow}>
        <Ionicons name={isPos ? 'arrow-up' : 'arrow-down'} size={12} color={isPos ? Colors.positive : Colors.negative} />
        <Text style={[forecastStyles.change, { color: isPos ? Colors.positive : Colors.negative }]}>
          {formatPercent(change)}
        </Text>
      </View>
    </View>
  );
}

const forecastStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.accentMuted,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.2)',
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  value: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.accent,
    marginBottom: 4,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  change: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  imageContainer: {
    backgroundColor: Colors.surfaceElevated,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: 'transparent',
  },
  closeBtn: {
    position: 'absolute',
    left: Spacing.base,
    zIndex: 10,
  },
  blurBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  content: {
    padding: Spacing.base,
  },
  name: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: Spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.md,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  qtyLabelText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  valueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  valueLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  valuePrice: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    color: Colors.accent,
    letterSpacing: -0.5,
  },
  valueIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    gap: 1,
    backgroundColor: Colors.border,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  statRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statLabel: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  statValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  forecastSection: {
    marginTop: Spacing.md,
  },
  forecastTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  forecastRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
});
