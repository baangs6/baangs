import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../theme';
import { leavesApi } from '../api';

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromYmd(value) {
  if (!value) return new Date();
  const parts = value.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function normalizeDateInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // Already ISO-ish (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD-MM-YYYY -> YYYY-MM-DD
  const dmy = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  // DD/MM/YYYY -> YYYY-MM-DD
  const dmySlash = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmySlash) return `${dmySlash[3]}-${dmySlash[2]}-${dmySlash[1]}`;
  return raw;
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [leaveForm, setLeaveForm] = React.useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });
  const [leaveTypeOpen, setLeaveTypeOpen] = React.useState(false);
  const [showFromPicker, setShowFromPicker] = React.useState(false);
  const [showToPicker, setShowToPicker] = React.useState(false);
  const [myLeaves, setMyLeaves] = React.useState([]);
  const [savingLeave, setSavingLeave] = React.useState(false);
  const leaveTypeOptions = React.useMemo(() => ([
    { value: 'casual', label: 'Casual' },
    { value: 'sick', label: 'Sick' },
    { value: 'earned', label: 'Earned' },
    { value: 'unpaid', label: 'Unpaid' },
  ]), []);

  const loadLeaves = React.useCallback(async () => {
    if (user?.role !== 'technician') return;
    try {
      const res = await leavesApi.list({ mine: true });
      setMyLeaves(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.log(e);
    }
  }, [user?.role]);

  React.useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout },
      ]
    );
  };

  const applyLeave = async () => {
    const fromDate = normalizeDateInput(leaveForm.from_date);
    const toDate = normalizeDateInput(leaveForm.to_date);
    const reason = String(leaveForm.reason || '').trim();

    if (!leaveForm.leave_type || !fromDate || !toDate || !reason) {
      Alert.alert('Missing details', 'Please fill leave type, from date, to date and reason.');
      return;
    }
    setSavingLeave(true);
    try {
      await leavesApi.apply({
        ...leaveForm,
        from_date: fromDate,
        to_date: toDate,
        reason,
      });
      setLeaveForm({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });
      await loadLeaves();
      Alert.alert('Leave applied', 'Your leave request has been submitted.');
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to apply leave');
    } finally {
      setSavingLeave(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.full_name?.[0] || user?.username?.[0] || '?'}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{user?.full_name || user?.username}</Text>
          <Text style={styles.role}>{user?.role?.toUpperCase()}</Text>
          {user?.phone && <Text style={styles.detail}>{user.phone}</Text>}
          {user?.staff_id && <Text style={styles.detail}>Staff ID: {user.staff_id}</Text>}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Account Actions</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={styles.actionBtnText}>Logout</Text>
          <Text style={styles.actionIcon}>🚪</Text>
        </TouchableOpacity>
      </View>

      {user?.role === 'technician' && (
        <>
          <Text style={styles.sectionTitle}>Leave Application</Text>
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Leave Type</Text>
            <TouchableOpacity
              style={[styles.input, styles.dropdownTrigger]}
              activeOpacity={0.75}
              onPress={() => setLeaveTypeOpen((p) => !p)}
            >
              <Text style={styles.dropdownText}>
                {leaveTypeOptions.find((o) => o.value === leaveForm.leave_type)?.label || 'Select leave type'}
              </Text>
              <Text style={styles.dropdownChevron}>{leaveTypeOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {leaveTypeOpen && (
              <View style={styles.dropdownMenu}>
                {leaveTypeOptions.map((o) => (
                  <TouchableOpacity
                    key={o.value}
                    style={styles.dropdownItem}
                    activeOpacity={0.75}
                    onPress={() => {
                      setLeaveForm((p) => ({ ...p, leave_type: o.value }));
                      setLeaveTypeOpen(false);
                    }}
                  >
                    <Text style={[styles.dropdownItemText, leaveForm.leave_type === o.value && styles.dropdownItemTextActive]}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {Platform.OS === 'web' ? (
              <>
                <TextInput
                  style={[styles.input, styles.dateInput]}
                  placeholder="From Date"
                  placeholderTextColor={colors.textMuted}
                  value={leaveForm.from_date}
                  onChangeText={(v) => setLeaveForm((p) => ({ ...p, from_date: v }))}
                  {...{ type: 'date' }}
                />
                <TextInput
                  style={[styles.input, styles.dateInput]}
                  placeholder="To Date"
                  placeholderTextColor={colors.textMuted}
                  value={leaveForm.to_date}
                  onChangeText={(v) => setLeaveForm((p) => ({ ...p, to_date: v }))}
                  {...{ type: 'date' }}
                />
              </>
            ) : (
              <>
                <TextInput
                  style={[styles.input, styles.dateInput]}
                  placeholder="From Date"
                  placeholderTextColor={colors.textMuted}
                  value={leaveForm.from_date}
                  editable={false}
                />
                <TouchableOpacity
                  style={styles.dateBtn}
                  activeOpacity={0.75}
                  onPress={() => setShowFromPicker(true)}
                >
                  <Text style={styles.dateBtnText}>Pick From Date</Text>
                </TouchableOpacity>
                {showFromPicker && (
                  <DateTimePicker
                    value={fromYmd(leaveForm.from_date)}
                    mode="date"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowFromPicker(false);
                      if (selectedDate) {
                        setLeaveForm((p) => ({ ...p, from_date: toYmd(selectedDate) }));
                      }
                    }}
                  />
                )}
                <TextInput
                  style={[styles.input, styles.dateInput]}
                  placeholder="To Date"
                  placeholderTextColor={colors.textMuted}
                  value={leaveForm.to_date}
                  editable={false}
                />
                <TouchableOpacity
                  style={styles.dateBtn}
                  activeOpacity={0.75}
                  onPress={() => setShowToPicker(true)}
                >
                  <Text style={styles.dateBtnText}>Pick To Date</Text>
                </TouchableOpacity>
                {showToPicker && (
                  <DateTimePicker
                    value={fromYmd(leaveForm.to_date)}
                    mode="date"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowToPicker(false);
                      if (selectedDate) {
                        setLeaveForm((p) => ({ ...p, to_date: toYmd(selectedDate) }));
                      }
                    }}
                  />
                )}
              </>
            )}
            <TextInput
              style={[styles.input, { minHeight: 72 }]}
              multiline
              placeholder="Reason"
              placeholderTextColor={colors.textMuted}
              value={leaveForm.reason}
              onChangeText={(v) => setLeaveForm((p) => ({ ...p, reason: v }))}
            />
            <TouchableOpacity style={styles.actionBtn} onPress={applyLeave} activeOpacity={0.75}>
              <Text style={[styles.actionBtnText, { color: colors.accent }]}>{savingLeave ? 'Submitting...' : 'Apply Leave'}</Text>
              <Text style={styles.actionIcon}>📝</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>My Leave Requests</Text>
          <View style={styles.card}>
            {myLeaves.length === 0 ? (
              <Text style={styles.detail}>No leave requests yet.</Text>
            ) : myLeaves.map((l) => (
              <View key={l.leave_id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={styles.detail}>Type: {String(l.leave_type || '-').toUpperCase()}</Text>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{l.from_date} to {l.to_date}</Text>
                <Text style={styles.detail}>{l.reason}</Text>
                <Text style={[styles.detail, { color: l.status === 'approved' ? colors.success : l.status === 'rejected' ? colors.danger : colors.warning }]}>
                  {String(l.status || 'pending').toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.versionText}>Baangs FSM Mobile v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    marginHorizontal: spacing.base, padding: spacing.xl, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl,
  },
  avatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accentDim,
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.lg,
    borderWidth: 1, borderColor: colors.accent,
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: colors.accent },
  profileInfo: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
  role: { fontSize: 12, fontWeight: '800', color: colors.accent, marginBottom: 4, letterSpacing: 1 },
  detail: { fontSize: 13, color: colors.textSecondary },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface, marginHorizontal: spacing.base,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  actionBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.base },
  actionBtnText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  actionIcon: { fontSize: 16 },
  input: {
    backgroundColor: colors.surface2,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingVertical: 10,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownTrigger: {
    minHeight: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  dropdownChevron: { color: colors.textMuted, fontSize: 12 },
  dropdownMenu: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    marginBottom: 10,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: spacing.base,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemText: { color: colors.text, fontSize: 14 },
  dropdownItemTextActive: { color: colors.accent, fontWeight: '700' },
  dateInput: { marginBottom: 8 },
  dateBtn: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.base,
    marginBottom: 10,
  },
  dateBtnText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  versionText: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: spacing['3xl'] },
});
