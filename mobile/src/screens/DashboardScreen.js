import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { dashboardApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../theme';

export default function DashboardScreen() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [techPerf, setTechPerf] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [sumRes, techRes] = await Promise.all([
        dashboardApi.summary(),
        dashboardApi.technicianPerformance(),
      ]);
      setSummary(sumRes.data);
      setTechPerf(techRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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

const styles = StyleSheet.create({
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
