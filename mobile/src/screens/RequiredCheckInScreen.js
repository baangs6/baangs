import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import Icon from '@expo/vector-icons/MaterialIcons';
import { attendanceApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { spacing, radius, useTheme } from '../theme';

export default function RequiredCheckInScreen({ existingAttendance, onCheckedIn }) {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  const { user, logout } = useAuth();
  const [photoUri, setPhotoUri] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  const staffId = user?.staff_id;

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Permission', 'Camera access is required to check in.');
      return null;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
      cameraType: ImagePicker.CameraType?.front || 'front',
    });

    if (result.canceled || !result.assets?.length) {
      return null;
    }

    const uri = result.assets[0].uri;
    setPhotoUri(uri);
    return uri;
  };

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setErrorText('Location permission is required to check in.');
      return null;
    }

    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return loc.coords;
    } catch (error) {
      setErrorText('Could not get location. Please turn on GPS and try again.');
      return null;
    }
  };

  const handleCheckIn = async () => {
    if (!staffId) {
      Alert.alert('Staff Link Required', 'Your login is not linked to a staff record. Please contact admin.');
      return;
    }

    setSaving(true);
    setErrorText('');

    try {
      const capturedPhoto = await takePhoto();
      if (!capturedPhoto) {
        setSaving(false);
        return;
      }

      const coords = await getLocation();
      if (!coords) {
        setSaving(false);
        return;
      }

      const attendanceId = existingAttendance?.attendance_id;
      if (attendanceId) {
        await attendanceApi.uploadCheckinPhoto(attendanceId, capturedPhoto);
      } else {
        const checkInRes = await attendanceApi.checkIn({
          staff_id: staffId,
          latitude: coords.latitude,
          longitude: coords.longitude,
          remarks: remarks.trim(),
        });
        await attendanceApi.uploadCheckinPhoto(checkInRes.data.attendance_id, capturedPhoto);
      }
      onCheckedIn?.();
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.message || 'Check-in failed. Please try again.';
      setErrorText(detail);
      Alert.alert('Check-In Failed', detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.kicker}>Attendance required</Text>
          <Text style={styles.title}>Check in to continue</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout} disabled={saving}>
          <Icon name="logout" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <View style={styles.iconCircle}>
          <Icon name="photo-camera" size={36} color={theme.colors.accent} />
        </View>
        <Text style={styles.panelTitle}>Take a live photo</Text>
        <Text style={styles.panelText}>
          {existingAttendance?.attendance_id
            ? "Today's attendance is already started. Add your live photo to continue."
            : "Your selfie and location will be saved for today's attendance before the app opens."}
        </Text>

        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={styles.previewEmpty}>
            <Icon name="person" size={48} color={theme.colors.textMuted} />
          </View>
        )}

        <Text style={styles.label}>Remarks optional</Text>
        <TextInput
          style={styles.input}
          value={remarks}
          onChangeText={setRemarks}
          placeholder="Notes about today's start"
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <TouchableOpacity style={styles.primaryBtn} onPress={handleCheckIn} disabled={saving} activeOpacity={0.85}>
          {saving ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : (
            <>
              <Icon name="camera-alt" size={20} color={theme.colors.accent} />
              <Text style={styles.primaryText}>Take Photo and Check In</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 64 : 40,
    paddingBottom: spacing.xl,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 4,
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  panelText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.base,
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    marginBottom: spacing.base,
    backgroundColor: colors.surface2,
  },
  previewEmpty: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginBottom: spacing.base,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 74,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    color: colors.text,
    padding: spacing.md,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
  },
});
