import React, { useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Colors } from '../../constants/colors';
import { FontSize, Radius, Spacing } from '../../constants/theme';

interface Props {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
}

function AnimatedButton({ onPress, disabled, children }: { onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.82, useNativeDriver: true, speed: 50, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
    ]).start();
    onPress();
  }, [onPress, scale]);

  return (
    <TouchableOpacity onPress={handlePress} disabled={disabled} activeOpacity={1}>
      <Animated.View style={[styles.btn, disabled && styles.btnDisabled, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function QuantityControl({ quantity, onIncrement, onDecrement }: Props) {
  return (
    <View style={styles.row}>
      <AnimatedButton onPress={onDecrement} disabled={quantity <= 1}>
        <Text style={[styles.btnText, quantity <= 1 && styles.btnTextDisabled]}>−</Text>
      </AnimatedButton>
      <View style={styles.countWrap}>
        <Text style={styles.count}>{quantity}</Text>
      </View>
      <AnimatedButton onPress={onIncrement}>
        <Text style={[styles.btnText, styles.btnTextActive]}>+</Text>
      </AnimatedButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.35,
  },
  btnText: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    fontWeight: '400',
    lineHeight: 22,
  },
  btnTextActive: {
    color: Colors.accent,
    fontWeight: '600',
  },
  btnTextDisabled: {
    color: Colors.textTertiary,
  },
  countWrap: {
    minWidth: 44,
    alignItems: 'center',
  },
  count: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
