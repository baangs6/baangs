import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { amcApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme';
import { formatDate } from '../utils/dateFormat';
import useLiveRefresh from '../hooks/useLiveRefresh';

export default function AmcPanel({ customer, job }) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [rows, setRows] = useState([]);
  const [link, setLink] = useState({ amc_id: null, replacement_products: false });
  const [benefits, setBenefits] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [pickDate, setPickDate] = useState(false);
  const [choose, setChoose] = useState(false);
  const id = job?.job_id || customer?.customer_id;
  const isJob = !!job;
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await (isJob ? amcApi.job(id) : amcApi.list(id));
      setRows(isJob ? data.contracts : data);
      if (isJob) { setLink({ amc_id: data.amc_id, replacement_products: data.replacement_products }); setBenefits(data.benefits); }
      setError('');
    } catch (e) { setError(e.response?.data?.detail || 'Unable to load AMC'); }
  }, [id, isJob]);
  useEffect(() => { load(); }, [load, job?.status]);
  useLiveRefresh(async () => { if (!form && !choose && !busy) await load(); }, id);
  async function save(action) {
    setBusy(true);
    try { await action(); setForm(null); setChoose(false); await load(); }
    catch (e) { Alert.alert('AMC', e.response?.data?.detail || 'Unable to save AMC'); }
    finally { setBusy(false); }
  }
  const button = (label, action) => <TouchableOpacity disabled={busy} onPress={action} style={{ padding: 12, borderWidth: 1, borderColor: colors.accent, borderRadius: 6, marginVertical: 6 }}><Text style={{ color: colors.accent }}>{label}</Text></TouchableOpacity>;
  const textStyle = { color: colors.text, marginVertical: 4 };
  return <View style={{ paddingVertical: 16 }}>
    <Text style={[textStyle, { fontSize: 18, fontWeight: '700' }]}>Annual Maintenance Contract</Text>
    {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
    {busy && <ActivityIndicator color={colors.accent} />}
    {rows.length === 0 && <Text style={textStyle}>No contracts for this location.</Text>}
    {rows.map(r => <View key={r.amc_id} style={{ borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 10 }}>
      <Text style={[textStyle, { fontWeight: '700' }]}>{r.nickname || r.location} | {r.status}</Text>
      <Text style={textStyle}>{formatDate(r.start_date)} to {formatDate(r.end_date)}</Text>
      <Text style={textStyle}>{r.free_visits_remaining}/4 free visits remaining | {r.extra_visits} extra visits</Text>
      <Text style={textStyle}>Rs {r.amount} | {r.days_remaining} days remaining</Text>
      {!!r.notes && <Text style={textStyle}>{r.notes}</Text>}
      {r.visits.map(v => <Text style={textStyle} key={v.job_id}>{v.job_id} | {formatDate(v.completed_on)} | {v.free_service ? 'Included service' : 'Chargeable service'}</Text>)}
      {!isJob && user?.role === 'admin' && r.status === 'active' && button('Cancel AMC', () => Alert.alert('Cancel AMC?', 'Completed visit history will be retained.', [{ text: 'Back' }, { text: 'Cancel AMC', onPress: () => save(() => amcApi.cancel(id, r.amc_id)) }]))}
    </View>)}
    {!!benefits && <Text style={textStyle}>{benefits.free_service ? 'Included service visit' : 'Service charges apply'} | Replacement discount {benefits.product_discount_percent}%</Text>}
    {isJob && user?.role === 'admin' && job.status !== 'complete' && !benefits && <>
      {button(rows.find(r => r.amc_id === link.amc_id)?.amc_id || 'Select service contract', () => setChoose(!choose))}
      {choose && <>{button('No AMC', () => { setLink({ amc_id: null, replacement_products: false }); setChoose(false); })}{rows.filter(r => r.status === 'active').map(r => <View key={r.amc_id}>{button(`${r.amc_id} | ${r.free_visits_remaining} free`, () => { setLink({ ...link, amc_id: r.amc_id }); setChoose(false); })}</View>)}</>}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Switch disabled={!link.amc_id} value={link.replacement_products} onValueChange={value => setLink({ ...link, replacement_products: value })} /><Text style={[textStyle, { flex: 1 }]}>All billed products are replacements (10% discount)</Text></View>
      {button('Save AMC Selection', () => save(() => amcApi.link(id, link)))}
    </>}
    {!isJob && user?.role === 'admin' && !form && button('Add / Renew AMC', () => setForm({ start_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }), location: customer.location || '', nickname: customer.nickname || '', amount: '0', notes: '' }))}
    {form && <>
      {['location', 'nickname', 'amount', 'notes'].map(key => <View key={key}><Text style={textStyle}>{({ location: 'Location', nickname: 'Site nickname', amount: 'Contract amount', notes: 'Terms / notes' })[key]}</Text><TextInput style={{ color: colors.text, borderWidth: 1, borderColor: colors.border, padding: 10, borderRadius: 6 }} value={form[key]} keyboardType={key === 'amount' ? 'decimal-pad' : 'default'} onChangeText={value => setForm({ ...form, [key]: value })} /></View>)}
      {button(`Start date: ${formatDate(form.start_date)}`, () => setPickDate(true))}
      {pickDate && <DateTimePicker value={new Date(`${form.start_date}T12:00:00`)} mode="date" onChange={(event, value) => { setPickDate(false); if (value) setForm({ ...form, start_date: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` }); }} />}
      {button('Save Contract', () => save(() => amcApi.create(id, { ...form, amount: Number(form.amount) })))}
      {button('Cancel', () => setForm(null))}
    </>}
  </View>;
}
