import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import IconButton from '../components/ui/IconButton';
import { Colors } from '../constants/colors';
import { FontSize, FontWeight, Radius, Shadows, Spacing } from '../constants/theme';

export default function PileScannerScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.category}>SCAN</Text>
          <Text style={styles.title}>Pile Scanner</Text>
        </View>
        <IconButton name="help-circle-outline" size={18} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* CTA card */}
        <TouchableOpacity activeOpacity={0.85} style={[styles.ctaWrap, Shadows.green]}>
          <LinearGradient
            colors={[Colors.accentDim, '#0B8A3A', Colors.gradientStart]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cta}
          >
            <View style={styles.ctaContent}>
              <View>
                <Text style={styles.ctaTitle}>Scan your pile!</Text>
                <Text style={styles.ctaSubtitle}>
                  Pour out your bricks and see{'\n'}what you can build
                </Text>
              </View>
              <View style={styles.ctaArrow}>
                <Ionicons name="arrow-forward" size={22} color={Colors.textInverse} />
              </View>
            </View>

            {/* Decorative dots */}
            <View style={styles.decorDot1} />
            <View style={styles.decorDot2} />
          </LinearGradient>
        </TouchableOpacity>

        {/* Builds card */}
        <TouchableOpacity activeOpacity={0.85} style={[styles.buildsCard, Shadows.subtle]}>
          <View style={styles.buildsIcon}>
            <Ionicons name="construct-outline" size={22} color={Colors.accent} />
          </View>
          <View style={styles.buildsText}>
            <Text style={styles.buildsTitle}>Check out our builds</Text>
            <Text style={styles.buildsSub}>Browse build ideas with instructions</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </TouchableOpacity>

        {/* Info row */}
        <View style={styles.infoRow}>
          <InfoChip icon="cube-outline" label="Piece detection" />
          <InfoChip icon="color-palette-outline" label="Color sorting" />
          <InfoChip icon="bulb-outline" label="Build matching" />
        </View>
      </ScrollView>
    </View>
  );
}

function InfoChip({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }) {
  return (
    <View style={chipStyles.chip}>
      <Ionicons name={icon} size={16} color={Colors.accent} />
      <Text style={chipStyles.label}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    textAlign: 'center',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    fontSize: 26,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  scroll: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  ctaWrap: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  cta: {
    padding: Spacing.xl,
    minHeight: 130,
    justifyContent: 'center',
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctaTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    color: '#fff',
    marginBottom: 6,
  },
  ctaSubtitle: {
    fontSize: FontSize.base,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 21,
  },
  ctaArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  decorDot1: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  decorDot2: {
    position: 'absolute',
    right: 60,
    bottom: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  buildsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.md,
  },
  buildsIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.2)',
  },
  buildsText: {
    flex: 1,
  },
  buildsTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  buildsSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  infoRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
