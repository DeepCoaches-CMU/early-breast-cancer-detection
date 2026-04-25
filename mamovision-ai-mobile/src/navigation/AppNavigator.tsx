import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import DiagnosticsScreen from '../screens/DiagnosticsScreen';
import ScanHistoryScreen from '../screens/ScanHistoryScreen';
import PatientsScreen from '../screens/PatientsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({
  name,
  focused,
}: {
  name: 'diagnostics' | 'history' | 'patients' | 'settings';
  focused: boolean;
}) {
  const icons = {
    diagnostics: '⊕',
    history: '📋',
    patients: '👤',
    settings: '⚙',
  };
  return (
    <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>{icons[name]}</Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#00F2FF',
        tabBarInactiveTintColor: '#4A4A6A',
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Diagnostics"
        component={DiagnosticsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="diagnostics" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={ScanHistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="history" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Patients"
        component={PatientsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="patients" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon name="settings" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator({ user }: { user: any }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : null}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#111120',
    borderTopWidth: 1,
    borderTopColor: '#2A2A4A',
    height: 60,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  tabIcon: {
    fontSize: 18,
    color: '#4A4A6A',
  },
  tabIconActive: {
    color: '#00F2FF',
  },
});
