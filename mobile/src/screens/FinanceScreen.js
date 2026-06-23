import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, TextInput, Alert, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Icon from '@expo/vector-icons/MaterialIcons';
import { attendanceApi, billingApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, useTheme } from '../theme';

export default function FinanceScreen() {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  const { user } = useAuth();
  const [billing, setBilling] = useState([]);
  const [allowances, setAllowances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [allowanceSaving, setAllowanceSaving] = useState(false);
  const [allowanceForm, setAllowanceForm] = useState({
    expense_type: 'food',
    amount: '',
    remark: '',
    bill_uri: null,
  });

  const load = async () => {
    setError('');
    try {
      const [billingRes, allowanceRes] = await Promise.all([
        billingApi.list().catch((e) => {
          setError(e.response?.status === 403 ? 'Finance billing is available for admin and manager users.' : 'Unable to load billing records.');
          return { data: [] };
        }),
        user?.staff_id ? attendanceApi.allowances({ staff_id: user.staff_id, limit: 20 }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      setBilling(billingRes.data || []);
      setAllowances(allowanceRes.data || []);
    } catch (e) {
      setBilling([]);
      setAllowances([]);
      setError('Unable to load finance records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.staff_id]);

  const pickBillPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to capture bill photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setAllowanceForm((prev) => ({ ...prev, bill_uri: result.assets[0].uri }));
    }
  };

  const submitAllowance = async () => {
    if (!user?.staff_id) {
      Alert.alert('Staff Link Required', 'Your account is not linked to a staff record.');
      return;
    }

    const amount = Number(allowanceForm.amount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid Amount', 'Enter a valid expense amount.');
      return;
    }
    if (allowanceForm.expense_type === 'other' && !allowanceForm.remark.trim()) {
      Alert.alert('Remark Required', 'Remark is mandatory for Other Expense.');
      return;
    }

    setAllowanceSaving(true);
    try {
      const res = await attendanceApi.createAllowance({
        staff_id: user.staff_id,
        expense_type: allowanceForm.expense_type,
        amount,
        remark: allowanceForm.remark,
      });
      if (allowanceForm.bill_uri) {
        await attendanceApi.uploadAllowanceBill(res.data.allowance_id, allowanceForm.bill_uri);
      }
      setAllowanceForm({ expense_type: 'food', amount: '', remark: '', bill_uri: null });
      await load();
      Alert.alert('Saved', 'Daily expense added.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Failed to save expense');
    } finally {
      setAllowanceSaving(false);
    }
  };

  const totals = useMemo(() => billing.reduce((acc, item) => {
    acc.revenue += Number(item.invoice_amount || 0);
    acc.collected += Number(item.collected_amount || 0);
    acc.expense += Number(item.expense || 0) + Number(item.material_amount || 0);
    acc.profit += Number(item.profit || 0);
    return acc;
  }, { revenue: 0, collected: 0, expense: 0, profit: 0 }), [billing]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={theme.colors.accent} size="large" /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.accent} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Finance</Text>
        <Text style={styles.subtitle}>Billing, collection, expense, and profit summary</Text>
      </View>

      {error ? (
        <View style={styles.emptyCard}>
          <Icon name="lock" size={32} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Billing unavailable</Text>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Daily Allowance</Text>
        <Text style={styles.cardDesc}>Add food, petrol, or other daily expenses with bill photo.</Text>

        <Text style={styles.label}>Expense Type</Text>
        <View style={styles.segmentRow}>
          {[
            ['food', 'Food'],
            ['petrol', 'Petrol'],
            ['other', 'Other'],
          ].map(([value, label]) => (
            <TouchableOpacity
              key={value}
              style={[styles.segmentBtn, allowanceForm.expense_type === value && styles.segmentBtnActive]}
              onPress={() => setAllowanceForm((prev) => ({ ...prev, expense_type: value }))}
            >
              <Text style={[styles.segmentText, allowanceForm.expense_type === value && styles.segmentTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Amount</Text>
        <TextInput
          style={[styles.input, styles.compactInput]}
          value={allowanceForm.amount}
          onChangeText={(text) => setAllowanceForm((prev) => ({ ...prev, amount: text }))}
          placeholder="0"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Remark</Text>
        <TextInput
          style={styles.input}
          value={allowanceForm.remark}
          onChangeText={(text) => setAllowanceForm((prev) => ({ ...prev, remark: text }))}
          placeholder="Bill details or notes"
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />

        <TouchableOpacity style={styles.billBtn} onPress={pickBillPhoto}>
          <Text style={styles.billBtnText}>{allowanceForm.bill_uri ? 'Bill Photo Added' : 'Add Bill Photo'}</Text>
        </TouchableOpacity>
        {allowanceForm.bill_uri ? (
          <Image source={{ uri: allowanceForm.bill_uri }} style={styles.billPreview} resizeMode="cover" />
        ) : null}

        <TouchableOpacity style={styles.saveBtn} onPress={submitAllowance} disabled={allowanceSaving}>
          <Text style={styles.saveBtnText}>{allowanceSaving ? 'Saving...' : 'Save Expense'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.cardTitle}>Recent Expenses</Text>
        {allowances.length === 0 ? (
          <Text style={styles.emptyInline}>No expenses added yet.</Text>
        ) : allowances.map((item) => (
          <View key={item.allowance_id} style={styles.expenseRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.expenseTitle}>{item.date} - {formatExpenseType(item.expense_type)}</Text>
              <Text style={styles.expenseMeta}>Rs {Number(item.amount || 0).toFixed(2)} - {item.payment_status}</Text>
              {item.remark ? <Text style={styles.expenseRemark}>{item.remark}</Text> : null}
            </View>
            {item.bill_url ? <Text style={styles.billTag}>Bill</Text> : null}
          </View>
        ))}
      </View>

      {!error ? (
        <>
          <View style={styles.statsGrid}>
            <MoneyCard label="Revenue" value={totals.revenue} color={theme.colors.success} />
            <MoneyCard label="Collected" value={totals.collected} color={theme.colors.accent} />
            <MoneyCard label="Expense" value={totals.expense} color={theme.colors.warning} />
            <MoneyCard label="Profit" value={totals.profit} color={theme.colors.info} />
          </View>

          <Text style={styles.sectionLabel}>Recent Billing</Text>
          {billing.length === 0 ? (
            <View style={styles.emptyCard}>
              <Icon name="receipt-long" size={32} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No billing records</Text>
              <Text style={styles.emptyText}>Completed job billing will appear here.</Text>
            </View>
          ) : billing.slice(0, 50).map((item) => (
            <View key={item.billing_id} style={styles.rowCard}>
              <View style={styles.rowTop}>
                <Text style={styles.jobId}>{item.job_id}</Text>
                <Text style={styles.dateText}>{item.complete_date}</Text>
              </View>
              <Text style={styles.customer}>{item.customer_name || 'Customer'}</Text>
              <View style={styles.moneyRow}>
                <Text style={styles.moneyText}>Invoice Rs {formatAmount(item.invoice_amount)}</Text>
                <Text style={[styles.moneyText, { color: theme.colors.success }]}>Profit Rs {formatAmount(item.profit)}</Text>
              </View>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function MoneyCard({ label, value, color }) {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  return (
    <View style={[styles.statCard, { borderColor: `${color}44` }]}>
      <Text style={[styles.statValue, { color }]}>Rs {formatAmount(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatAmount(value) {
  const number = Number(value || 0);
  if (number >= 100000) return `${(number / 100000).toFixed(1)}L`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return number.toFixed(0);
}

function formatExpenseType(value) {
  if (value === 'food') return 'Food Expense';
  if (value === 'petrol') return 'Petrol Expense';
  return 'Other Expense';
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.base,
  },
  statCard: {
    flex: 1,
    minWidth: '42%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.base,
  },
  statValue: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  statLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    paddingHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  rowCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  jobId: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  dateText: { color: colors.textMuted, fontSize: 12 },
  customer: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: spacing.xs },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  moneyText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  emptyCard: {
    marginHorizontal: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: spacing.sm },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 },
  formCard: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.base,
    padding: spacing.base,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  cardDesc: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.base },
  label: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: spacing.xs },
  segmentRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: 'center',
  },
  segmentBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  segmentText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  segmentTextActive: { color: colors.accent },
  input: {
    minHeight: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    color: colors.text,
    padding: spacing.md,
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
  compactInput: { minHeight: 0, height: 46 },
  billBtn: {
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  billBtnText: { color: colors.textSecondary, fontWeight: '800', fontSize: 13 },
  billPreview: { width: '100%', height: 140, borderRadius: radius.md, marginBottom: spacing.sm },
  saveBtn: {
    backgroundColor: colors.accentDim,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  saveBtnText: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  emptyInline: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: spacing.md },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  expenseTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  expenseMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  expenseRemark: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  billTag: {
    color: colors.success,
    fontWeight: '800',
    fontSize: 11,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.successDim,
    borderRadius: radius.full,
  },
});
