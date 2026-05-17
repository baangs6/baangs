import React, { useEffect, useState, useMemo, createElement } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { jobsApi, lookupsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../theme';
import { callPhone, openJobMap } from '../utils/contactActions';

const STATUS_COLORS = {
  pending: colors.warning, in_progress: colors.info, complete: colors.success, cancelled: colors.danger,
};

export default function JobsScreen({ navigation }) {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [allServiceTypes, setAllServiceTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const serviceTypes = useMemo(() => {
    const types = new Set([...allServiceTypes, ...jobs.map(j => j.work_type).filter(Boolean)]);
    return ['all', ...Array.from(types)];
  }, [jobs, allServiceTypes]);

  const dateFilteredJobs = useMemo(() => {
    return jobs.filter(j => {
      if (!j.scheduled_date) return false;
      return j.scheduled_date >= fromDate && j.scheduled_date <= toDate;
    });
  }, [jobs, fromDate, toDate]);

  const counts = useMemo(() => {
    let pending = 0, in_progress = 0, complete = 0;
    dateFilteredJobs.forEach(j => {
      if (j.status === 'pending') pending++;
      else if (j.status === 'in_progress') in_progress++;
      else if (j.status === 'complete') complete++;
    });
    return { pending, in_progress, complete };
  }, [dateFilteredJobs]);

  const filteredJobs = useMemo(() => {
    let res = dateFilteredJobs;
    if (filter !== 'all') res = res.filter(j => j.status === filter);
    if (serviceTypeFilter !== 'all') res = res.filter(j => j.work_type === serviceTypeFilter);
    return res;
  }, [dateFilteredJobs, filter, serviceTypeFilter]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchJobs(); }} tintColor={colors.accent} />}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Jobs</Text>
        <Text style={styles.headerSub}>{jobs.length} assigned to you</Text>
      </View>

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
                <Text style={styles.dateBtnText}>{fromDate}</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12 }}>to</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowTo(true)}>
                <Text style={styles.dateBtnText}>{toDate}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        
        {Platform.OS !== 'web' && showFrom && (
          <DateTimePicker
            value={new Date(fromDate)}
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
            value={new Date(toDate)}
            mode="date"
            display="default"
            minimumDate={new Date(fromDate)}
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
        filteredJobs.map(job => (
          <TouchableOpacity key={job.job_id} style={styles.card}
            onPress={() => navigation.navigate('JobDetail', { jobId: job.job_id })} activeOpacity={0.7}>
            <View style={styles.cardHeader}>
              <Text style={styles.jobId}>{job.job_id}</Text>
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
              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(job.priority) + '22' }]}>
                <Text style={[styles.priorityText, { color: getPriorityColor(job.priority) }]}>{job.priority}</Text>
              </View>
            </View>
            {job.scheduled_date && (
              <Text style={styles.scheduledDate}>📅 {job.scheduled_date} {job.preferred_time ? `· ${job.preferred_time}` : ''}</Text>
            )}
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

function getPriorityColor(p) {
  return { low: colors.success, medium: colors.info, high: colors.warning, urgent: colors.danger }[p] || colors.textMuted;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  headerSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
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
  scheduledDate: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  summaryGrid: { flexDirection: 'row', paddingHorizontal: spacing.base, gap: spacing.sm, marginBottom: spacing.md },
  summaryBox: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  summaryNum: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  summaryLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase' },
  filterWrap: { marginBottom: spacing.md },
  filterScroll: { paddingHorizontal: spacing.base, gap: spacing.sm },
  filterTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterTabActive: { backgroundColor: colors.surface2, borderColor: colors.accent },
  filterTabText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterTabTextActive: { color: colors.accent },
  dateBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dateBtnText: { fontSize: 12, fontWeight: '600', color: colors.text },
});
