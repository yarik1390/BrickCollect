import React from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { CollectionItem } from '../../types';
import CollectionItemCard from './CollectionItemCard';
import EmptyCollection from './EmptyCollection';
import { Spacing } from '../../constants/theme';

interface Props {
  items: CollectionItem[];
  onItemPress: (item: CollectionItem) => void;
}

export default function CollectionGrid({ items, onItemPress }: Props) {
  if (items.length === 0) {
    return <EmptyCollection />;
  }

  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <CollectionItemCard key={item.id} item={item} onPress={() => onItemPress(item)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
});
