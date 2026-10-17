import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, StatusBar, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import Icon from '@expo/vector-icons/MaterialIcons';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, useTheme } from '../theme';

export default function LoginScreen() {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const getLoginErrorMessage = (err) => {
    if (err.response?.data?.detail) {
      return err.response.data.detail;
    }

    if (err.code === 'ECONNABORTED') {
      return 'The server took too long to respond. Please try again.';
    }

    if (err.request) {
      return 'Unable to reach the server. Check that the backend is running and accessible from this device.';
    }

    return 'Something went wrong while trying to log in.';
  };

  const handleLogin = async () => {
    if (!username || !password) { Alert.alert('Error', 'Please fill in all fields'); return; }
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      Alert.alert('Login Failed', getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle={theme.themeMode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.bg} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.brandIcon}><Icon name="videocam" size={36} color={colors.accent} /></View>
        <Text style={styles.logo}>Baangs</Text>
        <Text style={styles.subtitle}>Field Service Management</Text>
        <Text style={styles.tagline}>Staff Mobile App</Text>
      <View style={styles.card}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Username"
              autoComplete="username"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}><TextInput
              style={[styles.input, { flex: 1, borderWidth: 0 }]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              accessibilityLabel="Password"
              autoComplete="current-password"
              onSubmitEditing={handleLogin}
            /><TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(!showPassword)} style={styles.eye}><Icon name={showPassword ? 'visibility-off' : 'visibility'} size={22} color={colors.textSecondary} /></TouchableOpacity></View>
          </View>

          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.8} accessibilityRole="button">
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <><Text style={styles.btnText}>Sign in</Text><Icon name="arrow-forward" size={20} color="#fff" /></>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity style={styles.support} onPress={() => Linking.openURL('tel:8330033280')}><Icon name="support-agent" size={20} color={colors.accent} /><Text style={{ color: colors.accent, fontWeight: '600' }}>Contact Dispatch</Text></TouchableOpacity>
      <Text style={styles.version}>Baangs FSM v{Constants.expoConfig?.version || '1.0.14'}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, paddingVertical: 32 },
  brandIcon: { alignSelf: 'center', width: 72, height: 72, borderRadius: 16, backgroundColor: colors.accentDim, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  eye: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
  support: { flexDirection: 'row', gap: 8, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  version: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logo: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.accent,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 14,
  },
  tagline: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 12,
    marginBottom: spacing['2xl'],
  },
  form: {
    gap: spacing.base,
  },
  inputGroup: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 15,
    minHeight: 52,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    minHeight: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
