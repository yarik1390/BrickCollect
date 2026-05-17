import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { FontSize } from '../constants/theme';
import { TabParamList } from './types';
import PortfolioScreen from '../screens/PortfolioScreen';
import FigSetScanScreen from '../screens/FigSetScanScreen';
import PileScannerScreen from '../screens/PileScannerScreen';
import BlindBagScreen from '../screens/BlindBagScreen';

const Tab = createBottomTabNavigator<TabParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<keyof TabParamList, { active: IoniconName; inactive: IoniconName }> = {
  Portfolio: { active: 'trending-up', inactive: 'trending-up-outline' },
  FigSetScan: { active: 'person', inactive: 'person-outline' },
  PileScanner: { active: 'radio', inactive: 'radio-outline' },
  BlindBag: { active: 'bag-handle', inactive: 'bag-handle-outline' },
};

const TAB_LABELS: Record<keyof TabParamList, string> = {
  Portfolio: 'Home',
  FigSetScan: 'Fig/Set Scan',
  PileScanner: 'Bulk Piece Scan',
  BlindBag: 'Blind Bag',
};

export default function TabNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const routeName = route.name as keyof TabParamList;
        const icons = TAB_ICONS[routeName];
        return {
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <View style={styles.iconWrap}>
              <Ionicons
                name={focused ? icons.active : icons.inactive}
                size={size}
                color={color}
              />
            </View>
          ),
          tabBarLabel: TAB_LABELS[routeName],
          tabBarActiveTintColor: Colors.tabBarActive,
          tabBarInactiveTintColor: Colors.tabBarInactive,
          tabBarStyle: {
            backgroundColor: Colors.tabBarBg,
            borderTopColor: Colors.tabBarBorder,
            borderTopWidth: 1,
            height: 60 + insets.bottom,
            paddingBottom: insets.bottom + 4,
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontSize: FontSize.xs,
            fontWeight: '500',
            marginTop: 2,
          },
        };
      }}
    >
      <Tab.Screen name="Portfolio" component={PortfolioScreen} />
      <Tab.Screen name="FigSetScan" component={FigSetScanScreen} />
      <Tab.Screen name="PileScanner" component={PileScannerScreen} />
      <Tab.Screen name="BlindBag" component={BlindBagScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
