import React, { useEffect, useState, useMemo, createElement, useRef } from 'react';
import { Animated, PanResponder, View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { jobsApi, lookupsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, useTheme } from '../theme';
import { callPhone, openJobMap } from '../utils/contactActions';
import storage from '../utils/storage';
import { formatDate } from '../utils/dateFormat';

export default function JobsScreen({ navigation, route }) {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  const STATUS_COLORS = React.useMemo(() => ({
    pending: colors.warning, in_progress: colors.info, complete: colors.success, cancelled: colors.danger,
  }), [theme.colors]);
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [allServiceTypes, setAllServiceTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [priorityMode, setPriorityMode] = useState(false);
  const [jobOrder, setJobOrder] = useState([]);
  const [daysSort, setDaysSort] = useState(null);
  const assignedStaffId = route?.params?.assigned_staff_id;
  const technicianName = route?.params?.technicianName;
  const orderKey = `jobOrder:${assignedStaffId || user?.staff_id || user?.user_id || 'default'}`;
  const canPrioritize = user?.role === 'technician' || !!assignedStaffId;

  const fetchJobs = async () => {
    try {
      const params = {};
      const [jobsRes, lookupsRes] = await Promise.allSettled([
        jobsApi.list(params),
        lookupsApi.all()
      ]);

      if (jobsRes.status === 'fulfilled') {
        setJobs(Array.isArray(jobsRes.value.data) ? jobsRes.value.data : []);
      } else {
        setJobs([]);
      }

      if (
        lookupsRes.status === 'fulfilled' &&
        lookupsRes.value.data &&
        Array.isArray(lookupsRes.value.data.service_types)
      ) {
        setAllServiceTypes(lookupsRes.value.data.service_types.map((s) => s.value));
      } else {
        setAllServiceTypes([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  useEffect(() => {
    let mounted = true;
    storage.getItem(orderKey).then((saved) => {
      if (!mounted) return;
      try {
        const parsed = saved ? JSON.parse(saved) : [];
        setJobOrder(Array.isArray(parsed) ? parsed : []);
      } catch {
        setJobOrder([]);
      }
    });
    return () => {
      mounted = false;
    };
  }, [orderKey]);

  useEffect(() => {
    if (jobs.length === 0) return;
    setJobOrder((prev) => {
      const knownIds = new Set(jobs.map((j) => j.job_id));
      const retained = prev.filter((id) => knownIds.has(id));
      const added = jobs.map((j) => j.job_id).filter((id) => !retained.includes(id));
      const next = [...retained, ...added];
      if (JSON.stringify(next) !== JSON.stringify(prev)) {
        storage.setItem(orderKey, JSON.stringify(next)).catch(() => {});
      }
      return next;
    });
  }, [jobs, orderKey]);

  useEffect(() => {
    if (route?.params?.statusFilter) setFilter(route.params.statusFilter);
  }, [route?.params?.statusFilter]);

  const serviceTypes = useMemo(() => {
    const types = new Set([...allServiceTypes, ...jobs.map(j => j.work_type).filter(Boolean)]);
    return ['all', ...Array.from(types)];
  }, [jobs, allServiceTypes]);

  const dateFilteredJobs = useMemo(() => {
    return jobs.filter(j => {
      if (!fromDate && !toDate) return true;
      if (!j.scheduled_date) return false;
      if (fromDate && j.scheduled_date < fromDate) return false;
      if (toDate && j.scheduled_date > toDate) return false;
      return true;
    });
  }, [jobs, fromDate, toDate]);

  const counts = useMemo(() => {
    let pending = 0, in_progress = 0, complete = 0;
    dateFilteredJobs.forEach(j => {
      const status = String(j.status || '').toLowerCase();
      if (status === 'pending') pending++;
      else if (status === 'in_progress') in_progress++;
      else if (status === 'complete') complete++;
    });
    return { pending, in_progress, complete };
  }, [dateFilteredJobs]);

  const filteredJobs = useMemo(() => {
    let res = dateFilteredJobs;
    if (assignedStaffId) {
      res = res.filter((j) => j.assigned_staff_id === assignedStaffId || j.primary_technician_id === assignedStaffId);
    }
    if (filter !== 'all') res = res.filter(j => String(j.status || '').toLowerCase() === filter);
    if (serviceTypeFilter !== 'all') res = res.filter(j => j.work_type === serviceTypeFilter);
    const position = new Map(jobOrder.map((id, index) => [id, index]));
    return [...res].sort((a, b) => {
      if (daysSort) {
        const difference = getDaysOpen(a) - getDaysOpen(b);
        if (difference !== 0) return daysSort === 'asc' ? difference : -difference;
      }
      return (position.get(a.job_id) ?? 99999) - (position.get(b.job_id) ?? 99999);
    });
  }, [dateFilteredJobs, filter, serviceTypeFilter, assignedStaffId, jobOrder, daysSort]);

  const moveJob = (jobId, direction) => {
    const visibleIds = filteredJobs.map((j) => j.job_id);
    const currentVisibleIndex = visibleIds.indexOf(jobId);
    const targetVisibleIndex = currentVisibleIndex + direction;
    if (currentVisibleIndex < 0 || targetVisibleIndex < 0 || targetVisibleIndex >= visibleIds.length) return;

    const targetId = visibleIds[targetVisibleIndex];
    setJobOrder((prev) => {
      const base = prev.length ? prev : jobs.map((j) => j.job_id);
      const next = [...base];
      const from = next.indexOf(jobId);
      const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      next.splice(from, 1);
      next.splice(to, 0, jobId);
      storage.setItem(orderKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchJobs(); }} tintColor={colors.accent} />}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{technicianName ? `${technicianName} Jobs` : 'My Jobs'}</Text>
          <Text style={styles.headerSub}>{filteredJobs.length} showing from {jobs.length} jobs</Text>
        </View>
        {user?.role !== 'technician' && (
          <TouchableOpacity style={styles.createBtn} onPress={() => navigation.navigate('JobCreate')} activeOpacity={0.8}>
            <Text style={styles.createBtnText}>+ Create</Text>
          </TouchableOpacity>
        )}
      </View>

      {canPrioritize && (
        <View style={styles.priorityPanel}>
          <View style={{ flex: 1 }}>
            <Text style={styles.priorityPanelTitle}>Work Order Priority</Text>
            <Text style={styles.priorityPanelSub}>Hold a job card and drag it up or down.</Text>
          </View>
          <TouchableOpacity
            style={[styles.priorityToggle, priorityMode && styles.priorityToggleActive]}
            onPress={() => {
              setDaysSort(null);
              setPriorityMode((p) => !p);
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.priorityToggleText, priorityMode && styles.priorityToggleTextActive]}>
              {priorityMode ? 'Done' : 'Prioritize'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.summaryGrid}>
        <View style={[styles.summaryBox, { borderColor: `${colors.warning}44` }]}>
          <Text style={[styles.summaryNum, { color: colors.warning }]}>{counts.pending}</Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <View style={[styles.summaryBox, { borderColor: `${colors.info}44` }]}>
          <Text style={[styles.summaryNum, { color: colors.info }]}>{counts.in_progress}</Text>
          <Text style={styles.summaryLabel}>In Progress</Text>
        </View>
        <View style={[styles.summaryBox, { borderColor: `${colors.success}44` }]}>
          <Text style={[styles.summaryNum, { color: colors.success }]}>{counts.complete}</Text>
          <Text style={styles.summaryLabel}>Completed</Text>
        </View>
      </View>

      <View style={styles.filterWrap}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, gap: spacing.md }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted }}>DATE RANGE:</Text>
          {Platform.OS === 'web' ? (
            <>
              {createElement('input', { type: 'date', value: fromDate, onChange: (e) => setFromDate(e.target.value), style: { padding: '6px', borderRadius: '6px', border: '1px solid #ccc' } })}
              <Text style={{ fontSize: 12 }}>to</Text>
              {createElement('input', { type: 'date', value: toDate, onChange: (e) => setToDate(e.target.value), style: { padding: '6px', borderRadius: '6px', border: '1px solid #ccc' } })}
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowFrom(true)}>
                <Text style={styles.dateBtnText}>{fromDate || 'From date'}</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12 }}>to</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTo(true)}>
                <Text style={styles.dateBtnText}>{toDate || 'To date'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        
        {Platform.OS !== 'web' && showFrom && (
          <DateTimePicker
            value={new Date(fromDate || Date.now())}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowFrom(false);
              if (date) setFromDate(date.toISOString().split('T')[0]);
            }}
          />
        )}
        {Platform.OS !== 'web' && showTo && (
          <DateTimePicker
            value={new Date(toDate || Date.now())}
            mode="date"
            display="default"
            minimumDate={fromDate ? new Date(fromDate) : undefined}
            onChange={(event, date) => {
              setShowTo(false);
              if (date) setToDate(date.toISOString().split('T')[0]);
            }}
          />
        )}
      </View>

      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {serviceTypes.map(f => (
            <TouchableOpacity 
              key={f} 
              style={[styles.filterTab, serviceTypeFilter === f && styles.filterTabActive]}
              onPress={() => setServiceTypeFilter(f)}
            >
              <Text style={[styles.filterTabText, serviceTypeFilter === f && styles.filterTabTextActive]}>
                {f === 'all' ? 'ALL SERVICES' : f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Days Open</Text>
        <TouchableOpacity
          style={[styles.sortBtn, daysSort && styles.sortBtnActive]}
          onPress={() => setDaysSort((current) => current === 'desc' ? 'asc' : current === 'asc' ? null : 'desc')}
        >
          <Text style={[styles.sortBtnText, daysSort && styles.sortBtnTextActive]}>
            {daysSort === 'desc' ? 'Highest first' : daysSort === 'asc' ? 'Lowest first' : 'Sort'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {['all', 'pending', 'in_progress', 'complete'].map(f => (
            <TouchableOpacity 
              key={f} 
              style={[styles.filterTab, filter === f && styles.filterTabActive, filter === f && f !== 'all' && { borderColor: STATUS_COLORS[f] }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive, filter === f && f !== 'all' && { color: STATUS_COLORS[f] }]}>
                {f.replace('_', ' ').toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {filteredJobs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🔧</Text>
          <Text style={styles.emptyText}>No jobs found</Text>
        </View>
      ) : (
        filteredJobs.map((job, index) => (
          <DraggableJobCard
            key={job.job_id}
            enabled={priorityMode}
            onMove={(offset) => moveJob(job.job_id, offset)}
            style={styles.card}
            onPress={() => navigation.navigate('JobDetail', { jobId: job.job_id })} activeOpacity={0.7}>
            <View style={styles.cardHeader}>
              <View style={styles.jobTitleWrap}>
                {canPrioritize && <Text style={styles.rankBadge}>#{index + 1}</Text>}
                <Text style={styles.jobId}>{job.job_id}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: `${STATUS_COLORS[job.status]}22`, borderColor: STATUS_COLORS[job.status] }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLORS[job.status] }]}>{job.status?.replace('_', ' ')}</Text>
              </View>
            </View>
            <Text style={styles.customerName}>{job.customer_name}</Text>
            <Text style={styles.detail}>{job.phone_number} · {job.location || 'No location'}</Text>
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={[styles.quickBtn, { borderColor: colors.success }]}
                onPress={(event) => {
                  event.stopPropagation();
                  callPhone(job.phone_number);
                }}
              >
                <Text style={[styles.quickBtnText, { color: colors.success }]}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickBtn, { borderColor: colors.info }]}
                onPress={(event) => {
                  event.stopPropagation();
                  openJobMap(job);
                }}
              >
                <Text style={[styles.quickBtnText, { color: colors.info }]}>Map</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.workType}>{job.work_type}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                {job.status !== 'complete' && job.status !== 'cancelled' ? (
                  <Text style={styles.daysOpen}>{getDaysOpen(job)} days open</Text>
                ) : null}
                <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(job.priority) + '22' }]}>
                  <Text style={[styles.priorityText, { color: getPriorityColor(job.priority) }]}>{job.priority}</Text>
                </View>
              </View>
            </View>
            {job.scheduled_date && (
              <Text style={styles.scheduledDate}>📅 {formatDate(job.scheduled_date)} {job.preferred_time ? `· ${job.preferred_time}` : ''}</Text>
            )}
            {priorityMode && <Text style={styles.dragHint}>Hold and drag this job up or down</Text>}
          </DraggableJobCard>
        ))
      )}
    </ScrollView>
  );
}

function getPriorityColor(p) {
  return { low: colors.success, medium: colors.info, high: colors.warning, urgent: colors.danger }[p] || colors.textMuted;
}

function DraggableJobCard({ enabled, onMove, children, style, onPress }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => enabled,
    onMoveShouldSetPanResponder: (_, gesture) => enabled && Math.abs(gesture.dy) > 8,
    onPanResponderMove: Animated.event([null, { dy: translateY }], { useNativeDriver: false }),
    onPanResponderRelease: (_, gesture) => {
      const offset = Math.round(gesture.dy / 120);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      if (offset !== 0) onMove(offset);
    },
    onPanResponderTerminate: () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start(),
  }), [enabled, onMove, translateY]);

  return (
    <Animated.View style={[style, enabled && { transform: [{ translateY }], zIndex: 5 }]} {...(enabled ? panResponder.panHandlers : {})}>
      <TouchableOpacity onPress={enabled ? undefined : onPress} activeOpacity={0.7}>{children}</TouchableOpacity>
    </Animated.View>
  );
}

function getDaysOpen(job) {
  const value = job.service_request_date || job.created_at || job.scheduled_date;
  if (!value) return 0;
  const created = new Date(value);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  headerSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  createBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    alignSelf: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  priorityPanel: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  priorityPanelTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  priorityPanelSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  priorityToggle: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface2,
  },
  priorityToggleActive: { backgroundColor: colors.accent },
  priorityToggleText: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  priorityToggleTextActive: { color: '#fff' },
  empty: { alignItems: 'center', padding: spacing['3xl'] },
  emptyIcon: { fontSize: 48, marginBottom: spacing.base },
  emptyText: { color: colors.textMuted, fontSize: 16 },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  jobTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  rankBadge: {
    minWidth: 32,
    textAlign: 'center',
    overflow: 'hidden',
    borderRadius: radius.full,
    backgroundColor: colors.accentDim,
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    paddingVertical: 3,
  },
  jobId: { fontFamily: 'monospace', fontSize: 11, color: colors.accent, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: radius.full, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  customerName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 2 },
  detail: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  quickActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  quickBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface2,
  },
  quickBtnText: { fontSize: 12, fontWeight: '800' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workType: { fontSize: 12, color: colors.textMuted, textTransform: 'capitalize' },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  priorityText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  daysOpen: { fontSize: 11, fontWeight: '700', color: colors.warning },
  scheduledDate: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  reorderRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  reorderBtn: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  reorderBtnDisabled: { borderColor: colors.border, backgroundColor: colors.surface2 },
  reorderBtnText: { color: colors.accent, fontSize: 12, fontWeight: '900' },
  reorderBtnTextDisabled: { color: colors.textMuted },
  summaryGrid: { flexDirection: 'row', paddingHorizontal: spacing.base, gap: spacing.sm, marginBottom: spacing.md },
  summaryBox: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  summaryNum: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  summaryLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase' },
  filterWrap: { marginBottom: spacing.md },
  sortRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.base, marginBottom: spacing.md },
  sortLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  sortBtn: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  sortBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  sortBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  sortBtnTextActive: { color: colors.accent },
  dragHint: { color: colors.accent, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: spacing.md },
  filterScroll: { paddingHorizontal: spacing.base, gap: spacing.sm },
  filterTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterTabActive: { backgroundColor: colors.surface2, borderColor: colors.accent },
  filterTabText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterTabTextActive: { color: colors.accent },
  dateBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dateBtnText: { fontSize: 12, fontWeight: '600', color: colors.text },
});
