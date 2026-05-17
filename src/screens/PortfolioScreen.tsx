import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCollectionStore } from '../store/collectionStore';
import { RootStackParamList } from '../navigation/types';
import ValueCard from '../components/portfolio/ValueCard';
import CategoryFilter from '../components/portfolio/CategoryFilter';
import CollectionGrid from '../components/portfolio/CollectionGrid';
import IconButton from '../components/ui/IconButton';
import { Colors } from '../constants/colors';
import { FontSize, FontWeight, Spacing } from '../constants/theme';
import { CollectionItem } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function PortfolioScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const store = useCollectionStore();

  useEffect(() => {
    store.hydrate();
  }, []);

  if (!store.isLoaded) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  const filteredItems = store.getFilteredItems();
  const totalValue = store.getTotalValue();
  const history = store.getPortfolioHistory();
  const setCount = store.getSetCount();
  const minifigCount = store.getMinifigCount();

  function handleItemPress(item: CollectionItem) {
    navigation.navigate('ItemDetail', { itemId: item.id });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.category}>COLLECTION</Text>
          <Text style={styles.title}>Portfolio</Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton name="search-outline" size={18} />
          <IconButton name="checkmark-circle-outline" size={18} color={Colors.accent} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ValueCard
          totalValue={totalValue}
          history={history}
          selectedRange={store.selectedTimeRange}
          onRangeChange={store.setTimeRange}
        />

        <View style={styles.filterRow}>
          <IconButton name="options-outline" size={16} style={styles.filterIcon} />
          <IconButton name="pricetag-outline" size={16} style={styles.filterIcon} />
          <View style={styles.separator} />
          <CategoryFilter
            selected={store.selectedCategory}
            setCount={setCount}
            minifigCount={minifigCount}
            onChange={store.setCategory}
          />
        </View>

        <CollectionGrid items={filteredItems} onItemPress={handleItemPress} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.base,
  },
  category: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.accent,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  scroll: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  filterIcon: {
    width: 36,
    height: 36,
  },
  separator: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
});
