import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { createStackNavigator } from '@react-navigation/stack';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './src/lib/firebase';
import { UserContext } from './src/contexts/UserContext';
import AuthScreen from './src/screens/AuthScreen';
import { RootNavigator } from './src/navigation/AppNavigator';

const Stack = createStackNavigator();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  if (initializing) {
    return (
      <View style={styles.splash}>
        <View style={styles.splashLogo}>
          <View style={styles.logoDot} />
        </View>
        <ActivityIndicator size="large" color="#00F2FF" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <UserContext.Provider value={user}>
        <StatusBar style="light" backgroundColor="#0A0A0F" />
        <NavigationContainer>
          {user ? (
            <RootNavigator user={user} />
          ) : (
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Auth">
                {() => <AuthScreen onLogin={(u) => setUser(u)} />}
              </Stack.Screen>
            </Stack.Navigator>
          )}
        </NavigationContainer>
      </UserContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  splashLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#00F2FF15',
    borderWidth: 2,
    borderColor: '#00F2FF40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#00F2FF',
    shadowColor: '#00F2FF',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 10,
  },
});
