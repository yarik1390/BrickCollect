import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { FontSize, FontWeight, Radius, Shadows, Spacing } from '../constants/theme';

export default function BlindBagScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.category}>SCAN</Text>
        <Text style={styles.title}>Blind Bag</Text>
      </View>

      <View style={styles.body}>
        <View style={[styles.iconCircle, Shadows.green]}>
          <LinearGradient
            colors={[Colors.accentDim, Colors.gradientStart]}
            style={styles.iconGradient}
          >
            <Ionicons name="bag-handle" size={40} color={Colors.accent} />
          </LinearGradient>
        </View>

        <Text style={styles.comingSoonLabel}>Coming Soon</Text>
        <Text style={styles.heading}>Blind Bag Scanner</Text>
        <Text style={styles.description}>
          Shake your blind bags and let BrickCollect predict which minifigure is inside using weight and rattle pattern analysis.
        </Text>

        <TouchableOpacity style={styles.notifyBtn} activeOpacity={0.8}>
          <Ionicons name="notifications-outline" size={18} color={Colors.textInverse} />
          <Text style={styles.notifyText}>Notify Me</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
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
    fontSize: 26,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.base,
    marginBottom: 60,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
  },
  iconGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.accent,
    letterSpacing: 1.5,
  },
  heading: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  description: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  notifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  notifyText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
});
