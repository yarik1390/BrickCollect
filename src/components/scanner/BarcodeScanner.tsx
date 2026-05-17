import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../constants/theme';

interface Props {
  onScanned: (barcode: string) => void;
  onClose?: () => void;
}

export default function BarcodeScanner({ onScanned, onClose }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const lastScanned = useRef<string | null>(null);

  const handleBarcode = useCallback(({ data }: { data: string }) => {
    if (scanned || data === lastScanned.current) return;
    lastScanned.current = data;
    setScanned(true);
    onScanned(data);
  }, [scanned, onScanned]);

  const reset = useCallback(() => {
    lastScanned.current = null;
    setScanned(false);
  }, []);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={48} color={Colors.textTertiary} />
        <Text style={styles.permText}>Camera access is needed to scan barcodes</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permBtn} activeOpacity={0.8}>
          <Text style={styles.permBtnText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'code128', 'code39'] }}
      />

      {/* Scan overlay */}
      <View style={styles.overlay}>
        <View style={styles.scanFrame}>
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
        </View>
        <Text style={styles.hint}>
          {scanned ? 'Scanned! Processing...' : 'Point at a LEGO set barcode'}
        </Text>
      </View>

      {/* Close */}
      {onClose && (
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      )}

      {/* Rescan */}
      {scanned && (
        <TouchableOpacity style={styles.rescanBtn} onPress={reset} activeOpacity={0.8}>
          <Ionicons name="refresh" size={18} color={Colors.textInverse} />
          <Text style={styles.rescanText}>Scan Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const isTop = pos.startsWith('t');
  const isLeft = pos.endsWith('l');
  return (
    <View
      style={[
        cornerStyles.corner,
        isTop ? cornerStyles.top : cornerStyles.bottom,
        isLeft ? cornerStyles.left : cornerStyles.right,
      ]}
    >
      <View style={[cornerStyles.bar, cornerStyles.barH, isTop ? cornerStyles.borderTop : cornerStyles.borderBottom]} />
      <View style={[cornerStyles.bar, cornerStyles.barV, isLeft ? cornerStyles.borderLeft : cornerStyles.borderRight]} />
    </View>
  );
}

const CORNER = 24;
const BAR = 3;

const cornerStyles = StyleSheet.create({
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  top: { top: 0 },
  bottom: { bottom: 0 },
  left: { left: 0 },
  right: { right: 0 },
  bar: { position: 'absolute', backgroundColor: Colors.accent },
  barH: { height: BAR, width: CORNER, left: 0 },
  barV: { width: BAR, height: CORNER, top: 0 },
  borderTop: { top: 0 },
  borderBottom: { bottom: 0 },
  borderLeft: { left: 0 },
  borderRight: { right: 0 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.base,
  },
  permText: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  permBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  permBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 240,
    height: 160,
    position: 'relative',
    borderRadius: 4,
  },
  hint: {
    marginTop: Spacing.xl,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    left: Spacing.base,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rescanBtn: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
  rescanText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textInverse,
  },
});
