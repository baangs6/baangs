import React from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { customersApi, jobsApi, lookupsApi, staffApi } from '../api';
import { radius, spacing, useTheme } from '../theme';

const initialForm = {
  customer_name: '',
  phone_number: '',
  location: '',
  map_location: '',
  work_type: 'installation',
  site_type: 'Home',
  priority: 'medium',
  scheduled_date: new Date().toISOString().split('T')[0],
  preferred_time: '',
  complaint: '',
  assigned_staff_id: '',
};

export default function JobCreateScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [form, setForm] = React.useState(initialForm);
  const [staff, setStaff] = React.useState([]);
  const [customers, setCustomers] = React.useState([]);
  const [lookups, setLookups] = React.useState({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    Promise.allSettled([staffApi.list(), lookupsApi.all(), customersApi.list()]).then(([staffRes, lookupRes, customersRes]) => {
      if (staffRes.status === 'fulfilled') setStaff(Array.isArray(staffRes.value.data) ? staffRes.value.data : []);
      if (lookupRes.status === 'fulfilled') setLookups(lookupRes.value.data || {});
      if (customersRes.status === 'fulfilled') setCustomers(Array.isArray(customersRes.value.data) ? customersRes.value.data : []);
    });
  }, []);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const customerMatches = React.useMemo(() => {
    const q = `${form.customer_name} ${form.phone_number}`.trim().toLowerCase();
    if (q.length < 2) return [];
    return customers.filter((c) => `${c.customer_name || c.name || ''} ${c.phone_number || c.phone || ''}`.toLowerCase().includes(q)).slice(0, 6);
  }, [customers, form.customer_name, form.phone_number]);

  const selectCustomer = (c) => {
    setForm((prev) => ({
      ...prev,
      customer_name: c.customer_name || c.name || prev.customer_name,
      phone_number: c.phone_number || c.phone || prev.phone_number,
      location: c.location || c.address || prev.location,
      map_location: c.map_location || prev.map_location,
      site_type: c.site_type || prev.site_type,
    }));
  };

  const submit = async () => {
    if (!form.customer_name.trim() || !form.phone_number.trim() || !form.location.trim() || !form.assigned_staff_id) {
      Alert.alert('Missing details', 'Customer, phone, location and technician are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        customer_name: form.customer_name.trim(),
        phone_number: form.phone_number.trim(),
        location: form.location.trim(),
        complaint: form.complaint.trim(),
      };
      const res = await jobsApi.create(payload);
      Alert.alert('Job Created', res.data?.job_id || 'New job created.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Create failed', e?.response?.data?.detail || e.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Create New Job</Text>
      <Text style={styles.sub}>Add the same job details from the web panel inside the app.</Text>

      <Field label="Customer Name" value={form.customer_name} onChangeText={(v) => update('customer_name', v)} colors={colors} />
      <Field label="Phone Number" value={form.phone_number} onChangeText={(v) => update('phone_number', v)} keyboardType="phone-pad" colors={colors} />
      {customerMatches.length > 0 && (
        <View style={styles.suggestionBox}>
          <Text style={styles.suggestionTitle}>Existing Customers</Text>
          {customerMatches.map((c) => (
            <TouchableOpacity key={c.customer_id || c.phone_number} style={styles.suggestionItem} onPress={() => selectCustomer(c)}>
              <Text style={styles.suggestionName}>{c.customer_name || c.name}</Text>
              <Text style={styles.suggestionMeta}>{c.phone_number || c.phone} | {c.location || '-'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Field label="Location / Address" value={form.location} onChangeText={(v) => update('location', v)} colors={colors} />
      <Field label="Map Location" value={form.map_location} onChangeText={(v) => update('map_location', v)} placeholder="latitude,longitude" colors={colors} />
      <DropdownField label="Work Type" value={form.work_type} options={(lookups.service_types || []).map((o) => o.value).concat(['installation', 'maintenance', 'complaint'])} onSelect={(v) => update('work_type', v)} styles={styles} />
      <DropdownField label="Site Type" value={form.site_type} options={['Home', 'Office', 'Shop', 'Apartment', 'Other']} onSelect={(v) => update('site_type', v)} styles={styles} />
      <DropdownField label="Priority" value={form.priority} options={['low', 'medium', 'high', 'urgent']} onSelect={(v) => update('priority', v)} styles={styles} />
      <Field label="Scheduled Date" value={form.scheduled_date} onChangeText={(v) => update('scheduled_date', v)} placeholder="YYYY-MM-DD" colors={colors} />
      <Field label="Preferred Time" value={form.preferred_time} onChangeText={(v) => update('preferred_time', v)} placeholder="HH:MM" colors={colors} />
      <Field label="Complaint / Notes" value={form.complaint} onChangeText={(v) => update('complaint', v)} multiline colors={colors} />

      <DropdownField
        label="Assign Technician"
        value={staff.find((s) => s.staff_id === form.assigned_staff_id)?.full_name || staff.find((s) => s.staff_id === form.assigned_staff_id)?.name || ''}
        placeholder="Select technician"
        options={staff.filter((s) => (s.role || '').toLowerCase() === 'technician' || s.staff_id).map((s) => ({ label: s.full_name || s.name || s.staff_id, value: s.staff_id }))}
        onSelect={(v) => update('assigned_staff_id', v)}
        styles={styles}
      />

      <TouchableOpacity style={[styles.submit, saving && styles.submitDisabled]} onPress={submit} disabled={saving} activeOpacity={0.85}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Create Job</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({ label, colors, multiline, ...props }) {
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, multiline && styles.textarea]}
      />
    </View>
  );
}

function DropdownField({ label, value, placeholder, options, onSelect, styles }) {
  const [open, setOpen] = React.useState(false);
  const normalized = Array.from(new Map(options.filter(Boolean).map((option) => {
    const item = typeof option === 'string' ? { label: option, value: option } : option;
    return [item.value, item];
  })).values());
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.dropdownTrigger} onPress={() => setOpen((p) => !p)}>
        <Text style={styles.dropdownTriggerText}>{value || placeholder || 'Select'}</Text>
        <Text style={styles.dropdownChevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdownMenu}>
          {normalized.map((option) => (
          <TouchableOpacity key={option.value} style={styles.dropdownItem} onPress={() => { onSelect(option.value); setOpen(false); }}>
            <Text style={styles.dropdownItemText}>{String(option.label)}</Text>
          </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', marginBottom: spacing.xs },
  sub: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', marginBottom: spacing.xs, textTransform: 'uppercase' },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  optionActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  optionText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  optionTextActive: { color: colors.accent },
  suggestionBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  suggestionTitle: { color: colors.accent, fontSize: 12, fontWeight: '900', marginBottom: spacing.xs },
  suggestionItem: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  suggestionMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  dropdownTrigger: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownTriggerText: { color: colors.text, fontSize: 15, fontWeight: '700', textTransform: 'capitalize' },
  dropdownChevron: { color: colors.textMuted, fontSize: 12 },
  dropdownMenu: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  dropdownItem: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownItemText: { color: colors.text, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  submit: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
