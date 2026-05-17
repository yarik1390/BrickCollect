import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import SparklineChart from '../charts/SparklineChart';
import TimeRangeFilter from './TimeRangeFilter';
import { PricePoint, TimeRange } from '../../types';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Radius, Shadows, Spacing } from '../../constants/theme';
import { formatCurrency, formatPercent } from '../../utils/format';

interface Props {
  totalValue: number;
  history: PricePoint[];
  selectedRange: TimeRange;
  onRangeChange: (r: TimeRange) => void;
}

function sliceHistory(history: PricePoint[], range: TimeRange): PricePoint[] {
  if (!history.length) return [];
  const now = new Date();
  const cutoffs: Record<TimeRange, number> = {
    '1D': 1,
    '1W': 7,
    '1M': 30,
    '3M': 90,
    '1Y': 365,
    ALL: 99999,
  };
  const days = cutoffs[range];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const filtered = history.filter((p) => new Date(p.date) >= cutoff);
  return filtered.length >= 2 ? filtered : history.slice(-Math.min(5, history.length));
}

export default function ValueCard({ totalValue, history, selectedRange, onRangeChange }: Props) {
  const { width } = useWindowDimensions();
  const chartWidth = width - Spacing.base * 2 - Spacing.xl * 2;
  const chartHeight = 80;

  const sliced = useMemo(() => sliceHistory(history, selectedRange), [history, selectedRange]);
  const sparkData = sliced.map((p) => p.value);

  const changePercent = useMemo(() => {
    if (sliced.length < 2) return 0;
    const first = sliced[0].value;
    const last = sliced[sliced.length - 1].value;
    return first === 0 ? 0 : ((last - first) / first) * 100;
  }, [sliced]);

  const isPositive = changePercent >= 0;
  const changeColor = isPositive ? Colors.positive : Colors.negative;

  return (
    <View style={[styles.container, Shadows.card]}>
      <LinearGradient
        colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.header}>
          <Text style={styles.label}>Total collection value</Text>
          <View style={styles.changeRow}>
            <Ionicons
              name={isPositive ? 'trending-up' : 'trending-down'}
              size={14}
              color={changeColor}
            />
            <Text style={[styles.changeText, { color: changeColor }]}>
              {' '}{formatPercent(changePercent)}
            </Text>
          </View>
        </View>

        <Text style={styles.value}>{formatCurrency(totalValue)}</Text>

        <View style={styles.chartWrap}>
          {sparkData.length >= 2 ? (
            <SparklineChart
              data={sparkData}
              width={chartWidth}
              height={chartHeight}
              color={Colors.accent}
              gradientId="valueGrad"
            />
          ) : (
            <View style={[styles.emptyChart, { width: chartWidth, height: chartHeight }]}>
              <Ionicons name="trending-up-outline" size={32} color={Colors.textTertiary} />
              <Text style={styles.emptyChartText}>Add items to track value</Text>
            </View>
          )}
        </View>

        <TimeRangeFilter selected={selectedRange} onChange={onRangeChange} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gradient: {
    padding: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  value: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -1,
    marginBottom: Spacing.lg,
  },
  chartWrap: {
    marginBottom: Spacing.sm,
  },
  emptyChart: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  emptyChartText: {
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
});
