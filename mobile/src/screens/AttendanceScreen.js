import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, ActivityIndicator, TextInput, Image, Platform
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { attendanceApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../theme';

export default function AttendanceScreen() {
  const { user } = useAuth();
  const [todayRecord, setTodayRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [checkoutRemarks, setCheckoutRemarks] = useState('');
  const [locationError, setLocationError] = useState('');

  const staffId = user?.staff_id;

  useEffect(() => {
    if (staffId) {
      loadTodayRecord();
    } else {
      setLoading(false);
    }
  }, [staffId]);

  const loadTodayRecord = async () => {
    try {
      const res = await attendanceApi.today(staffId);
      setTodayRecord(res.data);
    } catch (e) {
      console.log('No attendance record today');
    } finally {
      setLoading(false);
    }
  };

  const getLocation = async () => {
    setLocationError('');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationError('Location permission denied. Please enable in settings.');
      return null;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(loc.coords);
      return loc.coords;
    } catch (e) {
      setLocationError('Could not get location. Please try again.');
      return null;
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required for attendance verification.');
        return null;
      }
      
      console.log('Launching camera...');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const uri = result.assets[0].uri;
        setPhoto(uri);
        return uri;
      }
    } catch (error) {
      console.error('Camera Error:', error);
      Alert.alert('Camera Error', 'Could not open the camera. Please ensure your device has a working camera.');
    }
    return null;
  };

  const handleCheckIn = async () => {
    if (!staffId) {
      Alert.alert('Error', 'Your account is not linked to a staff record. Please contact admin.');
      return;
    }

    setSaving(true);
    try {
      // Take photo FIRST (user interaction)
      const photoUri = await takePhoto();
      if (!photoUri) {
        setSaving(false);
        return;
      }

      // Get location in background or after photo
      const coords = await getLocation();
      if (!coords) { 
        Alert.alert('Location Error', 'Could not verify your location. Please ensure GPS is on and try again.');
        setSaving(false); 
        return; 
      }

      // Check in
      const checkInRes = await attendanceApi.checkIn({
        staff_id: staffId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        remarks,
      });

      const attendanceId = checkInRes.data.attendance_id;

      // Upload photo
      try {
        await attendanceApi.uploadCheckinPhoto(attendanceId, photoUri);
      } catch (e) {
        console.log('Check-in photo upload failed:', e?.response?.data || e?.message || e);
        Alert.alert('Photo Upload Failed', e?.response?.data?.detail || 'Attendance marked, but check-in photo upload failed.');
      }

      await loadTodayRecord();
      setRemarks('');
      setPhoto(null);
      Alert.alert('✅ Checked In', `Checked in at ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Check-in failed');
    }
    setSaving(false);
  };

  const handleCheckOut = async () => {
    if (!todayRecord) return;

    setSaving(true);
    try {
      // Take photo FIRST
      const photoUri = await takePhoto();
      if (!photoUri) {
        setSaving(false);
        return;
      }

      // Get location after photo
      const coords = await getLocation();
      if (!coords) { 
        setSaving(false); 
        return; 
      }

      const checkOutRes = await attendanceApi.checkOut({
        attendance_id: todayRecord.attendance_id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        remarks: checkoutRemarks,
      });

      // Upload checkout photo
      try {
        await attendanceApi.uploadCheckoutPhoto(todayRecord.attendance_id, photoUri);
      } catch (e) {
        console.log('Check-out photo upload failed:', e?.response?.data || e?.message || e);
        Alert.alert('Photo Upload Failed', e?.response?.data?.detail || 'Checkout marked, but checkout photo upload failed.');
      }

      await loadTodayRecord();
      setCheckoutRemarks('');
      setPhoto(null);
      Alert.alert('✅ Checked Out', `Checked out at ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.detail || 'Check-out failed');
    }
    setSaving(false);
  };

  if (!staffId) {
    return (
      <View style={styles.center}>
        <Text style={styles.warningIcon}>⚠️</Text>
        <Text style={styles.warningTitle}>No Staff Record Linked</Text>
        <Text style={styles.warningText}>Your user account is not linked to a staff record. Please ask your admin to link your account.</Text>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  const isCheckedIn = !!todayRecord && !todayRecord.is_checked_out;
  const isCheckedOut = todayRecord?.is_checked_out;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Attendance</Text>
        <Text style={styles.headerDate}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
      </View>

      {/* Status Card */}
      <View style={[styles.statusCard, {
        borderColor: isCheckedOut ? colors.success : isCheckedIn ? colors.info : colors.border,
        backgroundColor: isCheckedOut ? colors.successDim : isCheckedIn ? colors.infoDim : colors.surface,
      }]}>
        <Text style={styles.statusIcon}>
          {isCheckedOut ? '✅' : isCheckedIn ? '🟡' : '⚪'}
        </Text>
        <Text style={styles.statusTitle}>
          {isCheckedOut ? 'Work Day Complete' : isCheckedIn ? 'Currently Checked In' : 'Not Checked In'}
        </Text>
        {todayRecord && (
          <View style={styles.timeRow}>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>CHECK IN</Text>
              <Text style={styles.timeValue}>{todayRecord.checkin_time?.slice(11, 19) || '—'}</Text>
            </View>
            <Text style={styles.timeDivider}>→</Text>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>CHECK OUT</Text>
              <Text style={styles.timeValue}>{todayRecord.checkout_time?.slice(11, 19) || '—'}</Text>
            </View>
          </View>
        )}
        {todayRecord?.checkin_latitude && (
          <Text style={styles.locationText}>
            📍 Last location: {todayRecord.checkin_latitude?.toFixed(4)}, {todayRecord.checkin_longitude?.toFixed(4)}
          </Text>
        )}
      </View>

      {/* Check-In Form */}
      {!todayRecord && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🟢 Check In</Text>
          <Text style={styles.cardDesc}>GPS + selfie photo will be captured automatically</Text>

          <Text style={styles.label}>Remarks / Notes (optional)</Text>
          <TextInput
            style={styles.input}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Notes about site, conditions..."
            placeholderTextColor={colors.textMuted}
            multiline
          />

          {locationError ? <Text style={styles.errorText}>⚠️ {locationError}</Text> : null}

          {saving ? (
            <View style={styles.savingContainer}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.savingText}>Getting location & taking photo...</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.checkInBtn} onPress={handleCheckIn} activeOpacity={0.8}>
              <Text style={styles.checkInBtnText}>📍 Check In Now</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Check-Out Form */}
      {isCheckedIn && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔴 Check Out</Text>
          <Text style={styles.cardDesc}>GPS + selfie photo will be captured for verification</Text>

          <Text style={styles.label}>End of Day Remarks (optional)</Text>
          <TextInput
            style={styles.input}
            value={checkoutRemarks}
            onChangeText={setCheckoutRemarks}
            placeholder="Any notes about today's work..."
            placeholderTextColor={colors.textMuted}
            multiline
          />

          {locationError ? <Text style={styles.errorText}>⚠️ {locationError}</Text> : null}

          {saving ? (
            <View style={styles.savingContainer}>
              <ActivityIndicator color={colors.danger} />
              <Text style={styles.savingText}>Getting location & taking photo...</Text>
            </View>
          ) : (
            <TouchableOpacity style={[styles.checkInBtn, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]}
              onPress={handleCheckOut} activeOpacity={0.8}>
              <Text style={[styles.checkInBtnText, { color: colors.danger }]}>📍 Check Out Now</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Today's Record Details */}
      {todayRecord && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📋 Today's Record</Text>
          {todayRecord.remarks && (
            <View style={styles.remarkBox}>
              <Text style={styles.remarkLabel}>Check-in Remarks:</Text>
              <Text style={styles.remarkText}>{todayRecord.remarks}</Text>
            </View>
          )}
          {todayRecord.checkout_remarks && (
            <View style={styles.remarkBox}>
              <Text style={styles.remarkLabel}>Check-out Remarks:</Text>
              <Text style={styles.remarkText}>{todayRecord.checkout_remarks}</Text>
            </View>
          )}
          {todayRecord.checkin_photo_url && (
            <View style={{ marginTop: spacing.md }}>
              <Text style={styles.remarkLabel}>Check-in Photo:</Text>
              <Image source={{ uri: todayRecord.checkin_photo_url }} style={styles.photoPreview} resizeMode="cover" />
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  warningIcon: { fontSize: 48, marginBottom: spacing.base },
  warningTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  warningText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  header: { padding: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  headerDate: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  statusCard: {
    marginHorizontal: spacing.base, marginBottom: spacing.base,
    borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: 1, alignItems: 'center',
  },
  statusIcon: { fontSize: 40, marginBottom: spacing.sm },
  statusTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  timeBlock: { alignItems: 'center' },
  timeLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  timeValue: { fontSize: 22, fontWeight: '800', color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  timeDivider: { fontSize: 18, color: colors.textMuted },
  locationText: { fontSize: 11, color: colors.textMuted, marginTop: spacing.xs },
  card: {
    backgroundColor: colors.surface, marginHorizontal: spacing.base,
    marginBottom: spacing.base, borderRadius: radius.lg,
    padding: spacing.base, borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 4 },
  cardDesc: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.base },
  label: { fontSize: 11, color: colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, color: colors.text,
    marginBottom: spacing.md, fontSize: 13, minHeight: 70, textAlignVertical: 'top',
  },
  errorText: { color: colors.danger, fontSize: 12, marginBottom: spacing.sm },
  savingContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  savingText: { color: colors.textMuted, fontSize: 13 },
  checkInBtn: {
    backgroundColor: colors.accentDim, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.accent,
  },
  checkInBtnText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  remarkBox: { backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm },
  remarkLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  remarkText: { fontSize: 13, color: colors.textSecondary },
  photoPreview: { width: '100%', height: 200, borderRadius: radius.md, marginTop: spacing.xs },
});
