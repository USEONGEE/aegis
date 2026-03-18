import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { ChatScreen } from '../domains/chat/screens/ChatScreen';
import { PolicyScreen } from '../domains/policy/screens/PolicyScreen';
import { ApprovalScreen } from '../domains/approval/screens/ApprovalScreen';
import { ActivityScreen } from '../domains/activity/screens/ActivityScreen';
import { DashboardScreen } from '../domains/dashboard/screens/DashboardScreen';
import { SettingsScreen } from '../domains/settings/screens/SettingsScreen';
import { TxApprovalSheet } from '../shared/tx/TxApprovalSheet';

export type RootTabParamList = {
  Chat: undefined;
  Policy: undefined;
  Approval: undefined;
  Activity: undefined;
  Dashboard: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, string> = {
  Chat: 'C',
  Policy: 'P',
  Approval: 'A',
  Activity: 'T',
  Dashboard: 'D',
  Settings: 'S',
};

export function RootNavigator() {
  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#ffffff',
          tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#1a1a1a' },
          tabBarActiveTintColor: '#3b82f6',
          tabBarInactiveTintColor: '#6b7280',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size - 4, fontWeight: 'bold' }}>
              {TAB_ICONS[route.name as keyof RootTabParamList]}
            </Text>
          ),
        })}
      >
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Policy" component={PolicyScreen} />
        <Tab.Screen name="Approval" component={ApprovalScreen} />
        <Tab.Screen name="Activity" component={ActivityScreen} />
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
      <TxApprovalSheet />
    </>
  );
}
