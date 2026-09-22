import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { Platform, View, ActivityIndicator, StatusBar, StyleSheet, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import Icon from '@expo/vector-icons/MaterialIcons';
import { attendanceApi, notificationsApi, staffApi } from './src/api';
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
import JobCreateScreen from './src/screens/JobCreateScreen';
import { CustomersScreen, InventoryScreen, ReportsScreen, StaffScreen, UsersScreen } from './src/screens/AdminListScreens';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const RootStack = createStackNavigator();
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
      <Stack.Screen name="JobCreate" component={JobCreateScreen} options={{ title: 'Create Job', headerBackTitle: 'Back' }} />
      <Stack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job Details', headerBackTitle: 'Back' }} />
    </Stack.Navigator>
  );
}

function RootApp() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <RootStack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '800' },
        }}
      >
        <RootStack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <RootStack.Screen name="Customers" component={CustomersScreen} />
        <RootStack.Screen name="Staff" component={StaffScreen} options={{ title: 'Staff / Technicians' }} />
        <RootStack.Screen name="Users" component={UsersScreen} />
        <RootStack.Screen name="Inventory" component={InventoryScreen} />
        <RootStack.Screen name="Reports" component={ReportsScreen} />
      </RootStack.Navigator>
      <AdminOverlay />
    </View>
  );
}

function AdminOverlay() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => overlayStyles(colors, insets), [colors, insets]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const isAdmin = ['admin', 'manager', 'sales'].includes(String(user?.role || '').toLowerCase());

  useEffect(() => {
    if (!isAdmin) return;
    staffApi.list()
      .then((res) => setTechnicians((Array.isArray(res.data) ? res.data : []).filter((s) => String(s.role || '').toLowerCase() === 'technician' || s.staff_id)))
      .catch(() => setTechnicians([]));
  }, [isAdmin]);

  if (!isAdmin) return null;

  const go = (screen, params) => {
    setMenuOpen(false);
    navigationRef.current?.navigate(screen, params);
  };

  const menuItems = [
    { label: 'Dashboard', icon: 'dashboard', action: () => go('MainTabs', { screen: 'Dashboard' }) },
    { label: 'Jobs', icon: 'work', action: () => go('MainTabs', { screen: 'Jobs', params: { screen: 'JobsList' } }) },
    { label: 'Create Job', icon: 'add-task', action: () => go('MainTabs', { screen: 'Jobs', params: { screen: 'JobCreate' } }) },
    { label: 'Customers', icon: 'people', action: () => go('Customers') },
    { label: 'Staff / Technicians', icon: 'engineering', action: () => go('Staff') },
    { label: 'Users', icon: 'admin-panel-settings', action: () => go('Users') },
    { label: 'Inventory', icon: 'inventory-2', action: () => go('Inventory') },
    { label: 'Finance', icon: 'account-balance-wallet', action: () => go('MainTabs', { screen: 'Finance' }) },
    { label: 'Reports', icon: 'bar-chart', action: () => go('Reports') },
    { label: 'Notifications', icon: 'notifications', action: () => go('MainTabs', { screen: 'Notifications' }) },
    { label: 'Settings', icon: 'settings', action: () => go('MainTabs', { screen: 'Settings' }) },
  ];

  const openTechnician = (tech) => {
    setTechOpen(false);
    navigationRef.current?.navigate('MainTabs', {
      screen: 'Dashboard',
      params: {
        selectedTechnician: tech,
      },
    });
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <TouchableOpacity style={styles.menuFab} onPress={() => setMenuOpen(true)} activeOpacity={0.8}>
        <Icon name="menu" size={22} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.techFab} onPress={() => setTechOpen(true)} activeOpacity={0.8}>
        <Icon name="person-search" size={18} color="#fff" />
        <Text style={styles.fabText}>Tech</Text>
      </TouchableOpacity>

      <Modal transparent animationType="fade" visible={menuOpen} onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.drawer}>
            <Text style={styles.drawerTitle}>Admin Menu</Text>
            <ScrollView>
              {menuItems.map((item) => (
                <TouchableOpacity key={item.label} style={styles.drawerItem} onPress={item.action}>
                  <Icon name={item.icon} size={20} color={colors.accent} />
                  <Text style={styles.drawerItemText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal transparent animationType="fade" visible={techOpen} onRequestClose={() => setTechOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setTechOpen(false)}>
          <View style={styles.techSheet}>
            <Text style={styles.drawerTitle}>Select Technician</Text>
            <ScrollView>
              {technicians.map((tech) => (
                <TouchableOpacity key={tech.staff_id} style={styles.drawerItem} onPress={() => openTechnician(tech)}>
                  <View style={styles.avatarMini}>
                    <Text style={styles.avatarMiniText}>{(tech.full_name || tech.name || tech.staff_id || '?')[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.drawerItemText}>{tech.full_name || tech.name || tech.staff_id}</Text>
                    <Text style={styles.techSub}>{tech.staff_id}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
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
        await Notifications.setNotificationChannelGroupAsync('baangs-notifications', {
          name: 'Baangs notifications',
        });
        await Notifications.setNotificationChannelAsync('baangs-stack', {
          name: 'Baangs notifications',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'attendance-reminder.wav',
          vibrationPattern: [0, 250, 250, 250],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          groupId: 'baangs-notifications',
        });
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default notifications',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'attendance-reminder.wav',
          vibrationPattern: [0, 250, 250, 250],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          groupId: 'baangs-notifications',
        });
        await Notifications.setNotificationChannelAsync('jobs', {
          name: 'Job notifications',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'attendance-reminder.wav',
          vibrationPattern: [0, 250, 250, 250],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          groupId: 'baangs-notifications',
        });
        await Notifications.setNotificationChannelAsync('attendance-reminders', {
          name: 'Attendance reminders',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'attendance-reminder.wav',
          vibrationPattern: [0, 350, 180, 350],
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          groupId: 'baangs-notifications',
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
        navigationRef.current.navigate('MainTabs', {
          screen: 'Jobs',
          params: {
            screen: 'JobDetail',
            params: { jobId },
          },
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
          <RootApp />
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

const overlayStyles = (colors, insets) => StyleSheet.create({
  menuFab: {
    position: 'absolute',
    top: insets.top + 8,
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    zIndex: 20,
  },
  techFab: {
    position: 'absolute',
    top: insets.top + 8,
    right: 12,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    elevation: 8,
    zIndex: 20,
  },
  fabText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-start',
  },
  drawer: {
    width: 292,
    maxWidth: '82%',
    height: '100%',
    backgroundColor: colors.surface,
    paddingTop: insets.top + 18,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  techSheet: {
    marginTop: insets.top + 62,
    marginHorizontal: 16,
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  drawerTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: 14 },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  drawerItemText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  avatarMini: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMiniText: { color: colors.accent, fontWeight: '900' },
  techSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});

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
