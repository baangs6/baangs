import React from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { customersApi, dashboardApi, inventoryApi, staffApi, usersApi } from '../api';
import { radius, spacing, useTheme } from '../theme';
import { callPhone, openJobMap } from '../utils/contactActions';

function useList(loader) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await loader();
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      Alert.alert('Loading failed', e?.response?.data?.detail || e.message || 'Please try again.');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loader]);

  React.useEffect(() => { load(); }, [load]);
  return { items, loading, refreshing, setRefreshing, load, setItems };
}

function ScreenShell({ title, subtitle, children, loading, refreshing, onRefresh }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {children}
    </ScrollView>
  );
}

export function CustomersScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const state = useList(React.useCallback(() => customersApi.list(), []));
  const [selected, setSelected] = React.useState(null);
  return (
    <ScreenShell title="Customers" subtitle="Customer records from the web panel" {...state} onRefresh={() => { state.setRefreshing(true); state.load(); }}>
      {state.items.map((c) => (
        <TouchableOpacity key={c.customer_id || c.phone_number} style={styles.card} onPress={() => setSelected(c)} activeOpacity={0.8}>
          <Text style={styles.cardTitle}>{c.name || c.customer_name || 'Customer'}</Text>
          <Text style={styles.meta}>{c.phone_number || c.phone || '-'}</Text>
          <Text style={styles.meta}>{c.location || c.address || '-'}</Text>
        </TouchableOpacity>
      ))}
      <Modal transparent animationType="fade" visible={!!selected} onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{selected?.name || selected?.customer_name || 'Customer'}</Text>
            <Text style={styles.meta}>Phone: {selected?.phone_number || selected?.phone || '-'}</Text>
            <Text style={styles.meta}>Location: {selected?.location || selected?.address || '-'}</Text>
            <Text style={styles.meta}>Site Type: {selected?.site_type || '-'}</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.smallBtn} onPress={() => callPhone(selected?.phone_number || selected?.phone)}>
                <Text style={styles.smallBtnText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.smallBtn} onPress={() => openJobMap(selected || {})}>
                <Text style={styles.smallBtnText}>Map</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

export function StaffScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const state = useList(React.useCallback(() => staffApi.list(), []));
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [form, setForm] = React.useState({ full_name: '', phone: '', role: 'technician', skills: '' });

  const openForm = (item = null) => {
    setEditing(item);
    setForm({
      full_name: item?.full_name || item?.name || '',
      phone: item?.phone || '',
      role: item?.role || 'technician',
      skills: Array.isArray(item?.skills) ? item.skills.join(', ') : (item?.skills || ''),
    });
    setFormOpen(true);
  };
  const save = async () => {
    try {
      const payload = { ...form, skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean) };
      if (editing?.staff_id) await staffApi.update(editing.staff_id, payload);
      else await staffApi.create(payload);
      setFormOpen(false);
      state.load();
    } catch (e) {
      Alert.alert('Save failed', e?.response?.data?.detail || e.message || 'Please try again.');
    }
  };
  return (
    <ScreenShell title="Staff / Technicians" subtitle="Technician and staff directory" {...state} onRefresh={() => { state.setRefreshing(true); state.load(); }}>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => openForm()}>
        <Text style={styles.primaryBtnText}>+ Add Staff / Technician</Text>
      </TouchableOpacity>
      {state.items.map((s) => (
        <TouchableOpacity key={s.staff_id} style={styles.card} onPress={() => openForm(s)} activeOpacity={0.8}>
          <Text style={styles.cardTitle}>{s.full_name || s.name || s.staff_id}</Text>
          <Text style={styles.meta}>{s.role || 'Staff'} | {s.phone || '-'}</Text>
          <Text style={styles.meta}>Skills: {Array.isArray(s.skills) ? s.skills.join(', ') : (s.skills || '-')}</Text>
          <Text style={[styles.status, { color: s.is_active === false ? colors.danger : colors.success }]}>
            {s.is_active === false ? 'Inactive' : 'Active'}
          </Text>
        </TouchableOpacity>
      ))}
      <Modal transparent animationType="fade" visible={formOpen} onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Staff' : 'Add Staff'}</Text>
            <FormInput styles={styles} colors={colors} label="Full Name" value={form.full_name} onChangeText={(v) => setForm((p) => ({ ...p, full_name: v }))} />
            <FormInput styles={styles} colors={colors} label="Phone" value={form.phone} onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))} />
            <FormInput styles={styles} colors={colors} label="Role" value={form.role} onChangeText={(v) => setForm((p) => ({ ...p, role: v }))} />
            <FormInput styles={styles} colors={colors} label="Skills" value={form.skills} onChangeText={(v) => setForm((p) => ({ ...p, skills: v }))} />
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.smallBtn} onPress={save}><Text style={styles.smallBtnText}>Save</Text></TouchableOpacity>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setFormOpen(false)}><Text style={styles.closeBtnText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

export function UsersScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const state = useList(React.useCallback(() => usersApi.list(), []));

  const toggle = async (u) => {
    try {
      if (u.is_active === false) await usersApi.activate(u.user_id);
      else await usersApi.deactivate(u.user_id);
      state.load();
    } catch (e) {
      Alert.alert('Update failed', e?.response?.data?.detail || e.message || 'Please try again.');
    }
  };

  return (
    <ScreenShell title="Users" subtitle="Login users and access status" {...state} onRefresh={() => { state.setRefreshing(true); state.load(); }}>
      {state.items.map((u) => (
        <View key={u.user_id || u.username} style={styles.card}>
          <Text style={styles.cardTitle}>{u.full_name || u.username}</Text>
          <Text style={styles.meta}>{u.role || '-'} | {u.phone || '-'}</Text>
          <TouchableOpacity style={styles.smallBtn} onPress={() => toggle(u)}>
            <Text style={styles.smallBtnText}>{u.is_active === false ? 'Activate' : 'Deactivate'}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScreenShell>
  );
}

export function InventoryScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const state = useList(React.useCallback(() => inventoryApi.list(), []));
  const [search, setSearch] = React.useState('');
  const [adjusting, setAdjusting] = React.useState(null);
  const [qty, setQty] = React.useState('');
  const items = state.items.filter((i) => `${i.item_name || i.name || ''} ${i.model_number || ''} ${i.serial_number || i.barcode || ''}`.toLowerCase().includes(search.toLowerCase()));
  const adjust = async () => {
    try {
      await inventoryApi.adjust(adjusting.barcode || adjusting.serial_number, { quantity: Number(qty), reason: 'Mobile admin stock adjustment' });
      setAdjusting(null);
      setQty('');
      state.load();
    } catch (e) {
      Alert.alert('Adjustment failed', e?.response?.data?.detail || e.message || 'Please try again.');
    }
  };
  return (
    <ScreenShell title="Inventory" subtitle="Items master and available stock" {...state} onRefresh={() => { state.setRefreshing(true); state.load(); }}>
      <TextInput style={styles.searchInput} placeholder="Search item, model, serial" placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
      {items.map((i) => (
        <TouchableOpacity key={i.item_id || i.serial_number || i.item_name} style={styles.card} onPress={() => setAdjusting(i)} activeOpacity={0.8}>
          <Text style={styles.cardTitle}>{i.item_name || i.name || 'Item'}</Text>
          <Text style={styles.meta}>Model: {i.model_number || '-'}</Text>
          <Text style={styles.meta}>Serial: {i.serial_number || i.barcode || '-'}</Text>
          <Text style={styles.meta}>Status: {i.status || '-'}</Text>
          <Text style={styles.status}>Qty: {i.quantity ?? i.current_stock ?? 0}</Text>
        </TouchableOpacity>
      ))}
      <Modal transparent animationType="fade" visible={!!adjusting} onRequestClose={() => setAdjusting(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Adjust Stock</Text>
            <Text style={styles.cardTitle}>{adjusting?.item_name || adjusting?.name}</Text>
            <Text style={styles.meta}>Current Qty: {adjusting?.quantity ?? adjusting?.current_stock ?? 0}</Text>
            <FormInput styles={styles} colors={colors} label="Adjustment Qty" value={qty} onChangeText={setQty} keyboardType="numeric" />
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.smallBtn} onPress={adjust}><Text style={styles.smallBtnText}>Apply</Text></TouchableOpacity>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setAdjusting(null)}><Text style={styles.closeBtnText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

function FormInput({ styles, colors, label, ...props }) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput {...props} placeholderTextColor={colors.textMuted} style={styles.searchInput} />
    </View>
  );
}

export function ReportsScreen() {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [summary, setSummary] = React.useState(null);
  const [perf, setPerf] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [sumRes, perfRes] = await Promise.all([dashboardApi.summary(), dashboardApi.technicianPerformance()]);
      setSummary(sumRes.data || {});
      setPerf(Array.isArray(perfRes.data) ? perfRes.data : []);
    } catch (e) {
      Alert.alert('Reports failed', e?.response?.data?.detail || e.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  return (
    <ScreenShell title="Reports" subtitle="Dashboard report view" loading={loading} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}>
      <View style={styles.reportGrid}>
        <ReportBox label="Jobs" value={summary?.jobs?.total || 0} styles={styles} />
        <ReportBox label="Pending" value={summary?.jobs?.pending || 0} styles={styles} />
        <ReportBox label="Revenue" value={`Rs ${summary?.revenue?.total || 0}`} styles={styles} />
        <ReportBox label="Customers" value={summary?.customers?.total || 0} styles={styles} />
      </View>
      {perf.map((p) => (
        <View key={p.staff_id} style={styles.card}>
          <Text style={styles.cardTitle}>{p.staff_name || p.staff_id}</Text>
          <Text style={styles.meta}>{p.total_jobs} total | {p.completed} done | {p.wip || 0} WIP</Text>
        </View>
      ))}
    </ScreenShell>
  );
}

function ReportBox({ label, value, styles }) {
  return (
    <View style={styles.reportBox}>
      <Text style={styles.reportValue}>{value}</Text>
      <Text style={styles.meta}>{label}</Text>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', marginBottom: spacing.xs },
  subtitle: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  status: { color: colors.accent, fontSize: 13, fontWeight: '800', marginTop: spacing.xs },
  smallBtn: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  smallBtnText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  primaryBtn: {
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  searchInput: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  formLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: spacing.xs },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.base,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginBottom: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  closeBtn: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  closeBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: '800' },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.base },
  reportBox: {
    flex: 1,
    minWidth: '42%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.base,
  },
  reportValue: { color: colors.accent, fontSize: 22, fontWeight: '900' },
});
