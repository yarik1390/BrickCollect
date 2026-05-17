import Constants from 'expo-constants';
import { RebrickableSet, RebrickableTheme, RebrickableMinifig, CollectionItem, Condition } from '../types';
import { generateId } from '../utils/id';

const BASE_URL = 'https://rebrickable.com/api/v3';

function getApiKey(): string {
  return Constants.expoConfig?.extra?.rebrickableApiKey ?? '';
}

function headers(): HeadersInit {
  return { Authorization: `key ${getApiKey()}` };
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Rebrickable API error ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSet(setNum: string): Promise<RebrickableSet> {
  const normalized = setNum.includes('-') ? setNum : `${setNum}-1`;
  return apiFetch<RebrickableSet>(`/lego/sets/${normalized}/`);
}

export async function fetchTheme(themeId: number): Promise<RebrickableTheme> {
  return apiFetch<RebrickableTheme>(`/lego/themes/${themeId}/`);
}

export async function fetchMinifigCount(setNum: string): Promise<number> {
  const normalized = setNum.includes('-') ? setNum : `${setNum}-1`;
  const data = await apiFetch<{ count: number; results: RebrickableMinifig[] }>(
    `/lego/sets/${normalized}/minifigs/`
  );
  return data.count;
}

export async function searchSets(query: string): Promise<RebrickableSet[]> {
  const data = await apiFetch<{ results: RebrickableSet[] }>(
    `/lego/sets/?search=${encodeURIComponent(query)}&page_size=20`
  );
  return data.results;
}

export async function buildCollectionItem(
  setNum: string,
  condition: Condition = 'New'
): Promise<CollectionItem> {
  const [setData, minifigCount] = await Promise.all([
    fetchSet(setNum),
    fetchMinifigCount(setNum),
  ]);
  const themeData = await fetchTheme(setData.theme_id);

  const retailPrice = null;
  const estimatedValue = retailPrice ?? setData.num_parts * 0.1;

  return {
    id: generateId(),
    category: 'set',
    set_num: setData.set_num,
    name: setData.name,
    set_img_url: setData.set_img_url,
    market_value: estimatedValue,
    retail_price: retailPrice,
    quantity: 1,
    condition,
    date_added: new Date().toISOString().split('T')[0],
    theme_name: themeData.name,
    year: setData.year,
    num_parts: setData.num_parts,
    num_minifigs: minifigCount,
    price_history: [],
    forecast_2y: estimatedValue * 1.07,
    forecast_5y: estimatedValue * 1.18,
  };
}
