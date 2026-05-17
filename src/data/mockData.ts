import { CollectionItem, PricePoint } from '../types';

function generatePriceHistory(basePrice: number, months: number = 12): PricePoint[] {
  const points: PricePoint[] = [];
  const now = new Date();
  let price = basePrice * 0.72;
  for (let i = months; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    price = price * (1 + (Math.random() * 0.06 - 0.01));
    price = Math.max(price, basePrice * 0.5);
    points.push({
      date: date.toISOString().split('T')[0],
      value: Math.round(price * 100) / 100,
    });
  }
  return points;
}

export const MOCK_COLLECTION: CollectionItem[] = [
  {
    id: 'entry-1',
    category: 'set',
    set_num: '75192-1',
    name: 'Millennium Falcon',
    set_img_url: 'https://cdn.rebrickable.com/media/sets/75192-1/46213.jpg',
    market_value: 1240.0,
    retail_price: 849.99,
    quantity: 1,
    condition: 'New',
    date_added: '2024-08-15',
    theme_name: 'Star Wars',
    year: 2017,
    num_parts: 7541,
    num_minifigs: 9,
    price_history: generatePriceHistory(1240.0),
    forecast_2y: 1456.0,
    forecast_5y: 1820.0,
  },
  {
    id: 'entry-2',
    category: 'set',
    set_num: '10294-1',
    name: 'Titanic',
    set_img_url: 'https://cdn.rebrickable.com/media/sets/10294-1/63405.jpg',
    market_value: 820.0,
    retail_price: 679.99,
    quantity: 1,
    condition: 'Sealed',
    date_added: '2024-10-02',
    theme_name: 'Icons',
    year: 2021,
    num_parts: 9090,
    num_minifigs: 0,
    price_history: generatePriceHistory(820.0),
    forecast_2y: 940.0,
    forecast_5y: 1150.0,
  },
  {
    id: 'entry-3',
    category: 'set',
    set_num: '76240-1',
    name: 'Batmobile Tumbler',
    set_img_url: 'https://cdn.rebrickable.com/media/sets/76240-1/67757.jpg',
    market_value: 380.0,
    retail_price: 299.99,
    quantity: 2,
    condition: 'New',
    date_added: '2024-11-20',
    theme_name: 'DC',
    year: 2021,
    num_parts: 2049,
    num_minifigs: 2,
    price_history: generatePriceHistory(380.0),
    forecast_2y: 440.0,
    forecast_5y: 560.0,
  },
  {
    id: 'entry-4',
    category: 'set',
    set_num: '10316-1',
    name: 'Rivendell',
    set_img_url: 'https://cdn.rebrickable.com/media/sets/10316-1/89463.jpg',
    market_value: 560.0,
    retail_price: 499.99,
    quantity: 1,
    condition: 'New',
    date_added: '2025-01-08',
    theme_name: 'Lord of the Rings',
    year: 2023,
    num_parts: 6167,
    num_minifigs: 15,
    price_history: generatePriceHistory(560.0),
    forecast_2y: 640.0,
    forecast_5y: 790.0,
  },
  {
    id: 'entry-5',
    category: 'minifig',
    set_num: 'sw0001a',
    name: 'Darth Vader (ESB)',
    set_img_url: 'https://cdn.rebrickable.com/media/sets/sw0001a/2562.jpg',
    market_value: 42.0,
    retail_price: null,
    quantity: 3,
    condition: 'Used',
    date_added: '2024-07-30',
    theme_name: 'Star Wars',
    year: 2003,
    num_parts: 5,
    num_minifigs: 0,
    price_history: generatePriceHistory(42.0),
    forecast_2y: 51.0,
    forecast_5y: 68.0,
  },
  {
    id: 'entry-6',
    category: 'minifig',
    set_num: 'col001',
    name: 'Banana Guy',
    set_img_url: 'https://cdn.rebrickable.com/media/sets/col001/11534.jpg',
    market_value: 18.0,
    retail_price: null,
    quantity: 1,
    condition: 'Used',
    date_added: '2025-02-14',
    theme_name: 'Collectible Minifigures',
    year: 2013,
    num_parts: 4,
    num_minifigs: 0,
    price_history: generatePriceHistory(18.0),
    forecast_2y: 22.0,
    forecast_5y: 28.0,
  },
];

export function computePortfolioHistory(items: CollectionItem[]): PricePoint[] {
  if (items.length === 0) return [];
  const allDates = items[0].price_history.map((p) => p.date);
  return allDates.map((date, idx) => ({
    date,
    value: items.reduce((sum, item) => {
      const point = item.price_history[idx];
      return sum + (point ? point.value * item.quantity : 0);
    }, 0),
  }));
}

export function computeTotalValue(items: CollectionItem[]): number {
  return items.reduce((sum, item) => sum + item.market_value * item.quantity, 0);
}
