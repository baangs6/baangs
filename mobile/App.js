import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { Platform, View, ActivityIndicator, StatusBar } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import Icon from '@expo/vector-icons/MaterialIcons';
import { attendanceApi, notificationsApi } from './src/api';
import { ThemeProvider, useTheme } from './src/theme';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import JobsScreen from './src/screens/JobsScreen';
import JobDetailScreen from './src/screens/JobDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import RequiredCheckInScreen from './src/screens/RequiredCheckInScreen';
import FinanceScreen from './src/screens/FinanceScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const navigationRef = React.createRef();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function JobsStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="JobsList" component={JobsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job Details', headerBackTitle: 'Back' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const bottomInset = Math.max(insets.bottom, 8);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    let intervalId;

    async function requestNotificationAccess() {
      if (Platform.OS === 'web' || !user) return;
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default notifications',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'attendance-reminder.wav',
          vibrationPattern: [0, 250, 250, 250],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
        await Notifications.setNotificationChannelAsync('jobs', {
          name: 'Job notifications',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'attendance-reminder.wav',
          vibrationPattern: [0, 250, 250, 250],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
        await Notifications.setNotificationChannelAsync('attendance-reminders', {
          name: 'Attendance reminders',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'attendance-reminder.wav',
          vibrationPattern: [0, 350, 180, 350],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      if (existing.status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        if (requested.status !== 'granted') return;
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.easConfig?.projectId ||
        Constants.manifest2?.extra?.eas?.projectId;
      const tokenResult = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      await notificationsApi.registerPushToken({
        token: tokenResult.data,
        platform: Platform.OS,
        device_id: Constants.sessionId || Constants.installationId || null,
      });
    }

    async function pollNotifications() {
      try {
        const countRes = await notificationsApi.unreadCount();

        if (!mounted) return;
        const nextCount = Number(countRes.data?.count || 0);
        setUnreadCount(nextCount);
      } catch (error) {
        console.warn('Notification poll failed', error);
      }
    }

    requestNotificationAccess().catch((error) => console.warn('Notification permission failed', error));
    pollNotifications();
    intervalId = setInterval(pollNotifications, 30000);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [user]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const jobId = response.notification.request.content.data?.job_id;
      if (jobId && navigationRef.current?.isReady()) {
        navigationRef.current.navigate('Jobs', {
          screen: 'JobDetail',
          params: { jobId },
        });
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Dashboard') iconName = 'dashboard';
          else if (route.name === 'Jobs') iconName = 'work';
          else if (route.name === 'Finance') iconName = 'account-balance-wallet';
          else if (route.name === 'Notifications') iconName = 'notifications';
          else if (route.name === 'Settings') iconName = 'settings';
          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 56 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Jobs" component={JobsStack} />
      <Tab.Screen name="Finance" component={FinanceScreen} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ tabBarBadge: unreadCount > 0 ? unreadCount : undefined }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { colors, themeMode } = useTheme();
  const { user, loading } = useAuth();
  const [attendanceReady, setAttendanceReady] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [checkingAttendance, setCheckingAttendance] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkTodayAttendance() {
      if (!user) {
        setAttendanceReady(false);
        setTodayAttendance(null);
        return;
      }

      if (!user.staff_id) {
        setAttendanceReady(true);
        setTodayAttendance(null);
        return;
      }

      setCheckingAttendance(true);
      try {
        const res = await attendanceApi.today(user.staff_id);
        if (mounted) {
          setTodayAttendance(res.data);
          setAttendanceReady(!!res.data?.checkin_photo_url);
        }
      } catch (error) {
        if (mounted) {
          setTodayAttendance(null);
          setAttendanceReady(false);
        }
      } finally {
        if (mounted) setCheckingAttendance(false);
      }
    }

    checkTodayAttendance();
    return () => {
      mounted = false;
    };
  }, [user]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} key={themeMode}>
      <StatusBar barStyle={themeMode === 'light' ? 'dark-content' : 'light-content'} backgroundColor={colors.bg} />
      {user ? (
        checkingAttendance ? (
          <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : attendanceReady ? (
          <MainTabs />
        ) : (
          <RequiredCheckInScreen
            existingAttendance={todayAttendance}
            onCheckedIn={() => {
              setTodayAttendance(null);
              setAttendanceReady(true);
            }}
          />
        )
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
