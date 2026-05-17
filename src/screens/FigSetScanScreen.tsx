import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BarcodeScanner from '../components/scanner/BarcodeScanner';
import SetSearchResult from '../components/scanner/SetSearchResult';
import { buildCollectionItem } from '../api/rebrickable';
import { useCollectionStore } from '../store/collectionStore';
import { CollectionItem } from '../types';
import { Colors } from '../constants/colors';
import { FontSize, FontWeight, Spacing } from '../constants/theme';

export default function FigSetScanScreen() {
  const insets = useSafeAreaInsets();
  const addItem = useCollectionStore((s) => s.addItem);

  const [scannedItem, setScannedItem] = useState<CollectionItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleBarcode = useCallback(async (barcode: string) => {
    setShowResult(true);
    setLoading(true);
    setError(null);
    setScannedItem(null);

    try {
      const item = await buildCollectionItem(barcode);
      setScannedItem(item);
    } catch (e: any) {
      setError(`Could not find set "${barcode}". Try scanning again or check your API key.`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAdd = useCallback(() => {
    if (scannedItem) {
      addItem(scannedItem);
    }
    setShowResult(false);
    setScannedItem(null);
  }, [scannedItem, addItem]);

  const handleDismiss = useCallback(() => {
    setShowResult(false);
    setScannedItem(null);
    setError(null);
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.category}>SCAN</Text>
        <Text style={styles.title}>Fig / Set Scanner</Text>
      </View>

      <View style={styles.cameraWrap}>
        <BarcodeScanner onScanned={handleBarcode} />
      </View>

      {/* Result sheet */}
      <Modal
        visible={showResult}
        transparent
        animationType="slide"
        onRequestClose={handleDismiss}
      >
        <View style={styles.modalBackdrop}>
          <SetSearchResult
            item={scannedItem}
            loading={loading}
            error={error}
            onAdd={handleAdd}
            onDismiss={handleDismiss}
          />
        </View>
      </Modal>
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
    paddingBottom: Spacing.base,
  },
  category: {
    fontSize: 11,
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
  cameraWrap: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    margin: Spacing.base,
    marginTop: 0,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
});
