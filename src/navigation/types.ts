import { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Portfolio: undefined;
  FigSetScan: undefined;
  PileScanner: undefined;
  BlindBag: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>;
  ItemDetail: { itemId: string };
};
