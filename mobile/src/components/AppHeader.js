import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';

export default function AppHeader({ title, onProfile, admin = false }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  return <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
    <View style={[styles.brand, admin && { marginLeft: 48 }]}>
      {!admin && <View style={[styles.mark, { backgroundColor: colors.accentDim }]}><Icon name="videocam" size={24} color={colors.accent} /></View>}
      <View><Text style={[styles.kicker, { color: colors.accent }]}>BAANGS FSM</Text><Text style={[styles.title, { color: colors.text }]}>{title}</Text></View>
    </View>
    {!admin && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open profile" onPress={onProfile} disabled={!onProfile} style={[styles.avatar, { backgroundColor: colors.accentDim }]}><Text style={{ color: colors.accent, fontWeight: '800', fontSize: 18 }}>{(user?.full_name || user?.username || 'B')[0].toUpperCase()}</Text></TouchableOpacity>}
  </View>;
}
const styles = StyleSheet.create({
  header: { minHeight: 68, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  brand: { flexDirection: 'row', gap: 12, alignItems: 'center', flexShrink: 1 },
  mark: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 11, fontWeight: '800' }, title: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
