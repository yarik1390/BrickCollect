export type TimeRange = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
export type ItemCategory = 'all' | 'sets' | 'minifigs';
export type Condition = 'New' | 'Used' | 'Sealed';

export interface PricePoint {
  date: string;
  value: number;
}

export interface LegoSet {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  theme_name: string;
  num_parts: number;
  set_img_url: string;
  num_minifigs: number;
  retail_price: number | null;
}

export interface Minifig {
  id: string;
  set_num: string;
  name: string;
  fig_num: string;
  num_parts: number;
  set_img_url: string;
  market_value: number;
  theme_name: string;
  year: number;
}

export interface CollectionItem {
  id: string;
  category: 'set' | 'minifig';
  set_num: string;
  name: string;
  set_img_url: string;
  market_value: number;
  retail_price: number | null;
  quantity: number;
  condition: Condition;
  date_added: string;
  theme_name: string;
  year: number;
  num_parts: number;
  num_minifigs: number;
  price_history: PricePoint[];
  forecast_2y: number;
  forecast_5y: number;
}

export interface RebrickableSet {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  set_img_url: string;
  set_url: string;
  last_modified_dt: string;
}

export interface RebrickableTheme {
  id: number;
  parent_id: number | null;
  name: string;
}

export interface RebrickableMinifig {
  id: number;
  set_num: string;
  set_name: string;
  quantity: number;
  set_img_url: string | null;
}
