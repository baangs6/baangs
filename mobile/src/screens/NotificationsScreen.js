import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { notificationsApi } from '../api';
import { colors, spacing, radius, useTheme } from '../theme';

export default function NotificationsScreen({ navigation }) {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = async () => {
    try {
      const res = await notificationsApi.list(50);
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openRow = async (row) => {
    if (!row.is_read) {
      try {
        await notificationsApi.markRead(row.notification_id);
        setRows((prev) => prev.map((x) => x.notification_id === row.notification_id ? { ...x, is_read: true } : x));
      } catch (e) {
        console.error(e);
      }
    }

    const jobId = row?.meta?.job_id;
    if (jobId) {
      navigation.navigate('Jobs', {
        screen: 'JobDetail',
        params: { jobId },
      });
    }
  };

  const clearAll = () => {
    if (rows.length === 0 || clearing) return;
    Alert.alert(
      'Clear notifications',
      'Remove all notifications from this device account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await notificationsApi.clear();
              setRows([]);
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.detail || 'Failed to clear notifications');
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.sub}>Job alerts and updates</Text>
        </View>
        <TouchableOpacity
          style={[styles.clearBtn, (rows.length === 0 || clearing) && styles.clearBtnDisabled]}
          onPress={clearAll}
          disabled={rows.length === 0 || clearing}
          activeOpacity={0.75}
        >
          <Text style={styles.clearBtnText}>{clearing ? 'Clearing...' : 'Clear'}</Text>
        </TouchableOpacity>
      </View>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No notifications</Text>
        </View>
      ) : rows.map((row) => (
        <TouchableOpacity
          key={row.notification_id}
          style={[styles.item, !row.is_read && styles.itemUnread]}
          onPress={() => openRow(row)}
          activeOpacity={0.75}
        >
          <Text style={styles.itemTitle}>{row.title}</Text>
          <Text style={styles.itemMsg}>{row.message}</Text>
          <Text style={styles.itemTime}>{row.created_at?.slice(0, 16).replace('T', ' ')}</Text>
        </TouchableOpacity>
      ))}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.xl, paddingBottom: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  clearBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dangerDim,
  },
  clearBtnDisabled: { opacity: 0.45 },
  clearBtnText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted },
  item: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.base,
  },
  itemUnread: {
    borderColor: colors.accent,
    backgroundColor: colors.surface2,
  },
  itemTitle: { color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 4 },
  itemMsg: { color: colors.textSecondary, fontSize: 13, marginBottom: 6 },
  itemTime: { color: colors.textMuted, fontSize: 11 },
});
