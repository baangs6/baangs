import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { notificationsApi } from '../api';
import { colors, spacing, radius, useTheme } from '../theme';
import { formatDateTime } from '../utils/dateFormat';
import useLiveRefresh from '../hooks/useLiveRefresh';
import * as Notifications from 'expo-notifications';
import Icon from '@expo/vector-icons/MaterialIcons';

export default function NotificationsScreen({ navigation }) {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const visibleRows = rows.filter(row => filter === 'all' || (filter === 'unread' ? !row.is_read : !!row.meta?.job_id));

  const load = async () => {
    try {
      const res = await notificationsApi.list(50);
      setRows(Array.isArray(res.data) ? res.data : []);
      setError('');
    } catch (e) {
      console.error(e);
      setError('Unable to refresh notifications. Pull down to retry.');
    } finally {
      setRefreshing(false);
    }
  };

  useLiveRefresh(load);

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
              await Notifications.dismissAllNotificationsAsync();
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
          <Text style={styles.title}>Recent Alerts</Text>
          <Text style={styles.sub}>{rows.filter(row => !row.is_read).length} unread | Job alerts and updates</Text>
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
      <View style={styles.filters}>{[['all', 'All Alerts'], ['unread', 'Unread'], ['jobs', 'Work Orders']].map(([value, label]) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={[styles.filter, filter === value && { backgroundColor: colors.accent }]}><Text style={{ color: filter === value ? '#fff' : colors.textSecondary, fontWeight: '600', fontSize: 13 }}>{label}</Text></TouchableOpacity>)}</View>

      {!!error && <Text style={{ color: colors.danger, padding: spacing.base }}>{error}</Text>}
      {visibleRows.length === 0 && !error ? (
        <View style={styles.empty}>
          <Icon name="notifications-none" size={40} color={colors.textMuted} /><Text style={styles.emptyText}>No notifications in this view</Text>
        </View>
      ) : visibleRows.map((row) => (
        <TouchableOpacity
          key={row.notification_id}
          style={[styles.item, !row.is_read && styles.itemUnread]}
          onPress={() => openRow(row)}
          activeOpacity={0.75}
        >
          <View style={styles.itemHead}><View style={styles.itemIcon}><Icon name={row.meta?.job_id ? 'assignment' : 'notifications-none'} size={24} color={colors.accent} /></View><Text style={styles.itemTitle}>{row.title}</Text>{!row.is_read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />}</View>
          <Text style={styles.itemMsg}>{row.message}</Text>
          {!!row.meta?.job_id && <View style={styles.review}><Icon name="visibility" size={18} color={colors.accent} /><Text style={{ color: colors.accent, fontWeight: '700' }}>Review Details</Text><Icon name="chevron-right" size={20} color={colors.accent} /></View>}
          <Text style={styles.itemTime}>{formatDateTime(row.created_at)}</Text>
        </TouchableOpacity>
      ))}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginVertical: 12 },
  filter: { minHeight: 44, borderRadius: radius.full, backgroundColor: colors.surface2, paddingHorizontal: 16, justifyContent: 'center' },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  itemIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  review: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 12 },
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
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  itemTitle: { flex: 1, color: colors.text, fontWeight: '700', fontSize: 16 },
  itemMsg: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginBottom: 12 },
  itemTime: { color: colors.textMuted, fontSize: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
});
