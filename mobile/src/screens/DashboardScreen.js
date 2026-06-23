import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import Icon from '@expo/vector-icons/MaterialIcons';
import { attendanceApi, dashboardApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, useTheme } from '../theme';

export default function DashboardScreen() {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [techPerf, setTechPerf] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const load = async () => {
    try {
      const [sumRes, techRes, attendanceRes] = await Promise.all([
        dashboardApi.summary(),
        dashboardApi.technicianPerformance(),
        user?.staff_id ? attendanceApi.today(user.staff_id).catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      ]);
      setSummary(sumRes.data);
      setTechPerf(techRes.data);
      setTodayAttendance(attendanceRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.staff_id]);

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Permission', 'Camera access is required to logout from work.');
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
      cameraType: ImagePicker.CameraType?.front || 'front',
    });
    if (result.canceled || !result.assets?.length) return null;
    return result.assets[0].uri;
  };

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location Permission', 'Location access is required to logout from work.');
      return null;
    }
    return (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })).coords;
  };

  const handleWorkdayLogout = async () => {
    if (!todayAttendance?.attendance_id) {
      Alert.alert('Not Checked In', 'Please check in before logout.');
      return;
    }
    setCheckingOut(true);
    try {
      const photoUri = await takePhoto();
      if (!photoUri) return;
      const coords = await getLocation();
      if (!coords) return;

      await attendanceApi.checkOut({
        attendance_id: todayAttendance.attendance_id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        remarks: 'Logged out from dashboard',
      });
      await attendanceApi.uploadCheckoutPhoto(todayAttendance.attendance_id, photoUri);
      await load();
      Alert.alert('Logged Out', 'Your workday logout has been saved.');
    } catch (e) {
      Alert.alert('Logout Failed', e.response?.data?.detail || e.message || 'Please try again.');
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const jobs = summary?.jobs || {};
  const revenue = summary?.revenue || {};
  const showRevenue = user?.role !== 'technician';
  const canWorkdayLogout = !!todayAttendance && !todayAttendance.is_checked_out;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Good {getTimeOfDay()}, {user?.full_name?.split(' ')[0] || user?.username}!
          </Text>
          <Text style={styles.subGreeting}>Here&apos;s today&apos;s overview</Text>
        </View>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{user?.role?.toUpperCase()}</Text>
        </View>
      </View>

      {user?.staff_id && (
        <View style={styles.logoutPanel}>
          <View style={{ flex: 1 }}>
            <Text style={styles.logoutTitle}>{canWorkdayLogout ? 'Checked in today' : 'Workday status'}</Text>
            <Text style={styles.logoutSub}>
              {canWorkdayLogout
                ? `Check in: ${todayAttendance.checkin_time?.slice(11, 19) || '-'}`
                : todayAttendance?.is_checked_out
                  ? `Logged out: ${todayAttendance.checkout_time?.slice(11, 19) || '-'}`
                  : 'Check-in required when you login'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.logoutAction, !canWorkdayLogout && styles.logoutActionDisabled]}
            onPress={handleWorkdayLogout}
            disabled={!canWorkdayLogout || checkingOut}
            activeOpacity={0.85}
          >
            {checkingOut ? (
              <ActivityIndicator color={colors.danger} />
            ) : (
              <>
                <Icon name="logout" size={18} color={canWorkdayLogout ? colors.danger : colors.textMuted} />
                <Text style={[styles.logoutActionText, !canWorkdayLogout && styles.logoutActionTextDisabled]}>Logout</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionLabel}>Jobs Overview</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Total" value={jobs.total || 0} color={colors.accent} />
        <StatCard label="Pending" value={jobs.pending || 0} color={colors.warning} />
        <StatCard label="In Progress" value={jobs.in_progress || 0} color={colors.info} />
        <StatCard label="Complete" value={jobs.complete || 0} color={colors.success} />
      </View>

      {showRevenue && (
        <>
          <Text style={styles.sectionLabel}>Revenue</Text>
          <View style={styles.statsGrid}>
            <StatCard label="Revenue" value={`Rs ${fmtK(revenue.total)}`} color={colors.success} />
            <StatCard label="Profit" value={`Rs ${fmtK(revenue.profit)}`} color={colors.accent} />
            <StatCard label="Customers" value={summary?.customers?.total || 0} color={colors.secondary} />
            <StatCard label="Staff" value={summary?.staff?.total || 0} color={colors.amber} />
          </View>
        </>
      )}

      {techPerf.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Technician Performance</Text>
          <View style={styles.card}>
            {techPerf.slice(0, 5).map((t) => (
              <View key={t.staff_id} style={styles.techRow}>
                <View style={styles.techAvatar}>
                  <Text style={styles.techAvatarText}>{t.staff_name?.[0] || '?'}</Text>
                </View>
                <View style={styles.techInfo}>
                  <Text style={styles.techName}>{t.staff_name || t.staff_id}</Text>
                  <Text style={styles.techSub}>
                    {t.total_jobs} total | {t.completed} done
                  </Text>
                </View>
                <View style={styles.successBadge}>
                  <Text style={styles.successBadgeText}>{t.completed}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.spacer} />
    </ScrollView>
  );
}

function StatCard({ label, value, color }) {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  return (
    <View style={[styles.statCard, { borderColor: `${color}33` }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function fmtK(v) {
  if (!v) return '0';
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toString();
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    paddingBottom: spacing.md,
  },
  greeting: { fontSize: 22, fontWeight: '800', color: colors.text },
  subGreeting: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  roleBadge: {
    backgroundColor: colors.accentDim,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  roleBadgeText: { color: colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  logoutPanel: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoutTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  logoutSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  logoutAction: {
    minWidth: 104,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  logoutActionDisabled: { borderColor: colors.border, backgroundColor: colors.surface2 },
  logoutActionText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  logoutActionTextDisabled: { color: colors.textMuted },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '42%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.base,
  },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  techAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentDim,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  techAvatarText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  techInfo: { flex: 1 },
  techName: { fontSize: 14, fontWeight: '600', color: colors.text },
  techSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  successBadge: {
    backgroundColor: colors.successDim,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  successBadgeText: { color: colors.success, fontWeight: '700', fontSize: 13 },
  spacer: { height: 20 },
});
