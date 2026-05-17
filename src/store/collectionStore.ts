import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CollectionItem, ItemCategory, TimeRange, PricePoint } from '../types';
import { MOCK_COLLECTION, computePortfolioHistory, computeTotalValue } from '../data/mockData';

const STORAGE_KEY = 'brick_collect_items';

interface CollectionState {
  items: CollectionItem[];
  selectedCategory: ItemCategory;
  selectedTimeRange: TimeRange;
  isLoaded: boolean;

  addItem: (item: CollectionItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  setCategory: (cat: ItemCategory) => void;
  setTimeRange: (range: TimeRange) => void;
  hydrate: () => Promise<void>;

  // Derived helpers (called in selectors)
  getFilteredItems: () => CollectionItem[];
  getTotalValue: () => number;
  getSetCount: () => number;
  getMinifigCount: () => number;
  getPortfolioHistory: () => PricePoint[];
}

async function saveItems(items: CollectionItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage errors are non-fatal
  }
}

export const useCollectionStore = create<CollectionState>((set, get) => ({
  items: [],
  selectedCategory: 'all',
  selectedTimeRange: '1W',
  isLoaded: false,

  addItem: (item) => {
    set((state) => {
      const existing = state.items.find((i) => i.set_num === item.set_num && i.category === item.category);
      if (existing) {
        const updated = state.items.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + item.quantity } : i
        );
        saveItems(updated);
        return { items: updated };
      }
      const updated = [...state.items, item];
      saveItems(updated);
      return { items: updated };
    });
  },

  removeItem: (id) => {
    set((state) => {
      const updated = state.items.filter((i) => i.id !== id);
      saveItems(updated);
      return { items: updated };
    });
  },

  updateQuantity: (id, delta) => {
    set((state) => {
      const updated = state.items
        .map((i) => (i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
        .filter((i) => i.quantity > 0);
      saveItems(updated);
      return { items: updated };
    });
  },

  setCategory: (selectedCategory) => set({ selectedCategory }),
  setTimeRange: (selectedTimeRange) => set({ selectedTimeRange }),

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const items = JSON.parse(stored) as CollectionItem[];
        set({ items, isLoaded: true });
      } else {
        set({ items: MOCK_COLLECTION, isLoaded: true });
        await saveItems(MOCK_COLLECTION);
      }
    } catch {
      set({ items: MOCK_COLLECTION, isLoaded: true });
    }
  },

  getFilteredItems: () => {
    const { items, selectedCategory } = get();
    if (selectedCategory === 'all') return items;
    if (selectedCategory === 'sets') return items.filter((i) => i.category === 'set');
    return items.filter((i) => i.category === 'minifig');
  },

  getTotalValue: () => computeTotalValue(get().items),

  getSetCount: () => get().items.filter((i) => i.category === 'set').length,

  getMinifigCount: () => get().items.filter((i) => i.category === 'minifig').length,

  getPortfolioHistory: () => computePortfolioHistory(get().items),
}));
