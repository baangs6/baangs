import React from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { updatesApi } from '../api';
import { useTheme } from '../theme';
import { formatDateTime } from '../utils/dateFormat';

const periods = ['day', 'week', 'month', 'year'];

export default function LearningLogScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [period, setPeriod] = React.useState('day');
  const [data, setData] = React.useState({ summary: {}, items: [] });
  const [replies, setReplies] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const response = await updatesApi.learningLog({ period });
      setData(response.data || { summary: {}, items: [] });
    } catch (error) {
      Alert.alert('Unable to load', error.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  React.useEffect(() => { setLoading(true); load(); }, [load]);

  const review = async (item, status) => {
    try {
      await updatesApi.reviewDoubt(item.update_id, {
        admin_reply: replies[item.update_id] ?? item.admin_reply ?? '',
        doubt_status: status,
      });
      await load();
    } catch (error) {
      Alert.alert('Unable to save', error.response?.data?.detail || 'Please try again.');
    }
  };

  const header = (
    <View>
      <View style={styles.periodRow}>{periods.map((value) => <TouchableOpacity key={value} style={[styles.period, period === value && styles.periodActive]} onPress={() => setPeriod(value)}><Text style={[styles.periodText, period === value && styles.periodTextActive]}>{value[0].toUpperCase() + value.slice(1)}</Text></TouchableOpacity>)}</View>
      <View style={styles.summaryRow}>
        <Summary label="Learnings" value={data.summary?.learnings || 0} styles={styles} />
        <Summary label="Doubts" value={data.summary?.doubts || 0} styles={styles} />
        <Summary label="Open" value={data.summary?.open_doubts || 0} styles={styles} />
      </View>
    </View>
  );

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.accent} /></View>;
  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={data.items || []}
      keyExtractor={(item) => item.update_id}
      ListHeaderComponent={header}
      ListEmptyComponent={<View style={styles.empty}><Icon name="school" size={38} color={colors.textMuted} /><Text style={styles.emptyText}>No technician notes in this period</Text></View>}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.staff}>{item.staff_name || item.assigned_staff_id}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MainTabs', { screen: 'Jobs', params: { screen: 'JobDetail', params: { jobId: item.job_id } } })}>
            <Text style={styles.job}>{item.job_id}{item.customer_name ? ` · ${item.customer_name}` : ''}</Text>
          </TouchableOpacity>
          <Text style={styles.date}>{formatDateTime(item.update_time)}</Text>
          {item.learning_notes ? <View style={styles.learning}><Text style={styles.boxTitle}>What I learned{item.learning_category ? ` · ${item.learning_category}` : ''}</Text><Text style={styles.body}>{item.learning_notes}</Text></View> : null}
          {item.issues_faced ? <View style={styles.doubt}><Text style={styles.boxTitle}>Doubt · {item.doubt_status || 'open'}</Text><Text style={styles.body}>{item.issues_faced}</Text>{item.admin_reply ? <Text style={styles.reply}>Admin reply: {item.admin_reply}</Text> : null}<TextInput style={styles.input} multiline value={replies[item.update_id] ?? item.admin_reply ?? ''} onChangeText={(text) => setReplies((old) => ({ ...old, [item.update_id]: text }))} placeholder="Write a reply" placeholderTextColor={colors.textMuted} /><View style={styles.actions}><TouchableOpacity style={styles.primary} onPress={() => review(item, 'answered')}><Text style={styles.primaryText}>Reply</Text></TouchableOpacity><TouchableOpacity style={styles.secondary} onPress={() => review(item, 'resolved')}><Text style={styles.secondaryText}>Resolve</Text></TouchableOpacity></View></View> : null}
        </View>
      )}
    />
  );
}

function Summary({ label, value, styles }) {
  return <View style={styles.summary}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

const makeStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: 16, gap: 12 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  periodRow: { flexDirection: 'row', gap: 6, marginBottom: 12 }, period: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface }, periodActive: { backgroundColor: colors.text, borderColor: colors.text }, periodText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 }, periodTextActive: { color: colors.surface },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 }, summary: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 7 }, summaryValue: { color: colors.text, fontSize: 22, fontWeight: '800' }, summaryLabel: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 15, borderRadius: 7, marginBottom: 12 }, staff: { color: colors.text, fontSize: 16, fontWeight: '800' }, job: { color: colors.accent, fontWeight: '700', marginTop: 5 }, date: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  learning: { backgroundColor: colors.successDim, borderLeftWidth: 3, borderLeftColor: colors.success, padding: 12, marginTop: 12 }, doubt: { backgroundColor: colors.warningDim, borderLeftWidth: 3, borderLeftColor: colors.warning, padding: 12, marginTop: 12 }, boxTitle: { color: colors.text, fontWeight: '800', marginBottom: 6 }, body: { color: colors.textSecondary, lineHeight: 20 }, reply: { color: colors.text, marginTop: 10, fontWeight: '600' }, input: { minHeight: 68, borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface, color: colors.text, padding: 10, marginTop: 10, textAlignVertical: 'top' }, actions: { flexDirection: 'row', gap: 8, marginTop: 10 }, primary: { backgroundColor: colors.accent, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 6 }, primaryText: { color: '#fff', fontWeight: '800' }, secondary: { borderWidth: 1, borderColor: colors.border, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 6 }, secondaryText: { color: colors.text, fontWeight: '800' },
  empty: { alignItems: 'center', padding: 42 }, emptyText: { color: colors.textMuted, marginTop: 10 },
});
