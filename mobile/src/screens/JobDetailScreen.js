import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { jobsApi, updatesApi, billingApi, inventoryApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius } from '../theme';

const STATUS_COLORS = {
  pending: colors.warning,
  in_progress: colors.info,
  complete: colors.success,
  cancelled: colors.danger,
};

const EMPTY_MANUAL_ITEM = {
  barcode: '',
  item_name: '',
  model_number: '',
  serial_number: '',
  quantity_used: '1',
};

export default function JobDetailScreen({ route }) {
  const { jobId } = route.params;
  const { user } = useAuth();

  const [job, setJob] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [modelInput, setModelInput] = useState('');
  const [serialInput, setSerialInput] = useState('');
  const [scanTarget, setScanTarget] = useState('model');
  const [qtyInput, setQtyInput] = useState('1');
  const [foundItem, setFoundItem] = useState(null);
  const [searchingItem, setSearchingItem] = useState(false);

  const [manualItemForm, setManualItemForm] = useState(EMPTY_MANUAL_ITEM);
  const [manualSerials, setManualSerials] = useState(['']);

  const [updateForm, setUpdateForm] = useState({
    status: 'in_progress',
    visit_notes: '',
    expense: '0',
    collected_amount: '0',
    inventory_used: [],
    manual_inventory_items: [],
  });

  const [billingForm, setBillingForm] = useState({
    invoice_amount: '0',
    expense: '0',
    material_amount: '0',
    collected_amount: '0',
    payment_mode: 'cash',
    payment_id: '',
  });

  const isAdmin = user?.role === 'admin';

  const load = async () => {
    try {
      const [jobRes, updatesRes] = await Promise.all([
        jobsApi.get(jobId),
        updatesApi.getJobUpdates(jobId),
      ]);
      setJob(jobRes.data);
      setUpdates(updatesRes.data);
      setUpdateForm((prev) => ({ ...prev, status: jobRes.data.status || 'in_progress' }));
    } catch (error) {
      Alert.alert('Error', 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [jobId]);

  const clearUpdateDraft = () => {
    setUpdateForm({
      status: job?.status || 'in_progress',
      visit_notes: '',
      expense: '0',
      collected_amount: '0',
      inventory_used: [],
      manual_inventory_items: [],
    });
    setModelInput('');
    setSerialInput('');
    setFoundItem(null);
    setQtyInput('1');
    setManualItemForm(EMPTY_MANUAL_ITEM);
    setManualSerials(['']);
  };

  const getCurrentLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Location permission is required.');
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy || null,
    };
  };

  const submitWorkEvent = async (eventType) => {
    setActionSaving(true);
    try {
      const location = await getCurrentLocation();
      const status = eventType === 'start_work' ? 'in_progress' : 'complete';
      await updatesApi.create({
        job_id: jobId,
        status,
        work_event: eventType,
        location,
        visit_notes: eventType === 'start_work' ? 'Reached location and started work' : 'Work ended on site',
      });
      await load();
      Alert.alert('Success', eventType === 'start_work' ? 'Work started with location' : 'Work ended with location');
    } catch (error) {
      Alert.alert('Error', error.response?.data?.detail || error.message || 'Unable to save work event');
    } finally {
      setActionSaving(false);
    }
  };

  const submitUpdate = async () => {
    setSaving(true);
    try {
      let location = null;
      try {
        location = await getCurrentLocation();
      } catch (err) {
        console.warn("Could not get location for update", err);
      }
      
      const workEvent = updateForm.status === 'complete' ? 'end_work' : null;

      await updatesApi.create({
        job_id: jobId,
        status: updateForm.status,
        work_event: workEvent,
        location: location,
        visit_notes: updateForm.visit_notes,
        expense: parseFloat(updateForm.expense) || 0,
        collected_amount: parseFloat(updateForm.collected_amount) || 0,
        inventory_used: updateForm.inventory_used.map((item) => ({
          barcode: item.barcode,
          serial_number: item.serial_number || null,
          quantity_used: item.quantity_used,
        })),
        manual_inventory_items: updateForm.manual_inventory_items.map((item) => ({
          barcode: item.barcode || null,
          item_name: item.item_name,
          model_number: item.model_number || null,
          serial_number: item.serial_number || null,
          quantity_used: item.quantity_used,
          category: 'Miscellaneous',
          brand: null,
          unit_type: 'Pcs',
          remarks: null,
        })),
      });
      await load();
      setShowUpdateModal(false);
      clearUpdateDraft();
      Alert.alert('Success', 'Job update saved');
    } catch (error) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update job');
    } finally {
      setSaving(false);
    }
  };

  const submitBilling = async () => {
    setSaving(true);
    try {
      await billingApi.create({
        job_id: jobId,
        invoice_amount: parseFloat(billingForm.invoice_amount) || 0,
        expense: parseFloat(billingForm.expense) || 0,
        material_amount: parseFloat(billingForm.material_amount) || 0,
        collected_amount: parseFloat(billingForm.collected_amount) || 0,
        payment_mode: billingForm.payment_mode,
        payment_id: billingForm.payment_id,
      });
      await load();
      setShowBillingModal(false);
      Alert.alert('Success', 'Billing completed');
    } catch (error) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save billing');
    } finally {
      setSaving(false);
    }
  };

  const lookupItem = async () => {
    const model = modelInput.trim();
    const serial = serialInput.trim();
    if (!model || !serial) {
      Alert.alert('Missing Input', 'Enter both model number and serial number');
      return;
    }
    setSearchingItem(true);
    try {
      const res = await inventoryApi.search(model, serial);
      setFoundItem(res.data);
      setQtyInput('1');
    } catch (error) {
      setFoundItem(null);
      Alert.alert('Not Found', error.response?.data?.detail || 'No inventory found for this model and serial number');
    } finally {
      setSearchingItem(false);
    }
  };

  const addKnownInventory = () => {
    const quantityUsed = parseFloat(qtyInput);
    if (!foundItem || !quantityUsed || quantityUsed <= 0) return;
    if (quantityUsed > foundItem.current_quantity) {
      Alert.alert('Invalid Quantity', `Only ${foundItem.current_quantity} available in stock`);
      return;
    }

    if (updateForm.inventory_used.some((item) => item.barcode === foundItem.barcode)) {
      Alert.alert('Already Added', 'This barcode is already in the list');
      return;
    }

    const model = (foundItem.model_number || '').trim().toLowerCase();
    const serial = serialInput.trim().toLowerCase();
    if (model && serial) {
      const duplicateInKnown = updateForm.inventory_used.some((item) =>
        (item.model_number || '').trim().toLowerCase() === model &&
        (item.serial_number || '').trim().toLowerCase() === serial
      );
      const duplicateInManual = updateForm.manual_inventory_items.some((item) =>
        (item.model_number || '').trim().toLowerCase() === model &&
        (item.serial_number || '').trim().toLowerCase() === serial
      );
      if (duplicateInKnown || duplicateInManual) {
        Alert.alert('Duplicate Item', 'This model number + serial number is already added');
        return;
      }
    }

    setUpdateForm((prev) => ({
      ...prev,
      inventory_used: [
        ...prev.inventory_used,
        {
          barcode: foundItem.barcode,
          item_name: foundItem.item_name,
          model_number: foundItem.model_number || '',
          serial_number: serialInput.trim(),
          quantity_used: quantityUsed,
        },
      ],
    }));
    setModelInput('');
    setSerialInput('');
    setFoundItem(null);
    setQtyInput('1');
  };

  const addManualInventory = () => {
    const quantityUsed = parseFloat(manualItemForm.quantity_used);
    const serialList = manualSerials.map((s) => s.trim()).filter(Boolean);
    if (
      !manualItemForm.item_name.trim() ||
      !manualItemForm.model_number.trim() ||
      serialList.length === 0 ||
      !quantityUsed ||
      quantityUsed <= 0
    ) {
      Alert.alert('Missing Details', 'Enter item name, model number, serial number and valid quantity');
      return;
    }
    if (!Number.isInteger(quantityUsed)) {
      Alert.alert('Invalid Quantity', 'Quantity must be a whole number for serial-based manual items');
      return;
    }
    if (serialList.length !== quantityUsed) {
      Alert.alert(
        'Serial Count Mismatch',
        `Quantity is ${quantityUsed}, but serial count is ${serialList.length}. Enter exactly ${quantityUsed} serial number(s).`
      );
      return;
    }

    const model = manualItemForm.model_number.trim().toLowerCase();
    if (model) {
      for (const serialVal of serialList) {
        const serial = serialVal.toLowerCase();
        const duplicateInKnown = updateForm.inventory_used.some((item) =>
          (item.model_number || '').trim().toLowerCase() === model &&
          (item.serial_number || '').trim().toLowerCase() === serial
        );
        const duplicateInManual = updateForm.manual_inventory_items.some((item) =>
          (item.model_number || '').trim().toLowerCase() === model &&
          (item.serial_number || '').trim().toLowerCase() === serial
        );
        if (duplicateInKnown || duplicateInManual) {
          Alert.alert('Duplicate Item', `Model ${manualItemForm.model_number.trim()} with serial ${serialVal} is already added`);
          return;
        }
      }
    }

    setUpdateForm((prev) => ({
      ...prev,
      manual_inventory_items: [
        ...prev.manual_inventory_items,
        {
          // Manual flow rule: barcode follows serial input
          barcode: serialList.join(', '),
          item_name: manualItemForm.item_name.trim(),
          model_number: manualItemForm.model_number.trim(),
          serial_number: serialList.join(', '),
          quantity_used: quantityUsed,
        },
      ],
    }));

    setManualItemForm(EMPTY_MANUAL_ITEM);
    setManualSerials(['']);
  };

  const removeKnownInventory = (barcode) => {
    setUpdateForm((prev) => ({
      ...prev,
      inventory_used: prev.inventory_used.filter((item) => item.barcode !== barcode),
    }));
  };

  const removeManualInventory = (index) => {
    setUpdateForm((prev) => ({
      ...prev,
      manual_inventory_items: prev.manual_inventory_items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const openScanner = async (target = 'model') => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Camera permission is required to scan barcodes');
        return;
      }
    }
    setScanTarget(target);
    setShowScannerModal(true);
  };

  const onBarcodeScanned = ({ data }) => {
    if (!data) return;
    if (scanTarget === 'serial') {
      setSerialInput(data);
    } else if (scanTarget.startsWith('manual_serial_')) {
      const idx = Number(scanTarget.replace('manual_serial_', ''));
      if (!Number.isNaN(idx)) {
        setManualSerials((prev) => prev.map((v, i) => (i === idx ? data : v)));
      }
    } else {
      setModelInput(data);
    }
    setShowScannerModal(false);
  };

  if (loading || !job) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const canWorkActions = !isAdmin && job.status !== 'cancelled' && job.status !== 'complete';
  const hasStarted = !!job.work_started_at || job.status === 'in_progress';
  const canStartWork = canWorkActions && !hasStarted;
  const canUpdateStatus = canWorkActions && job.status === 'in_progress';

  return (
    <ScrollView style={styles.container}>
      <View style={styles.jobHeader}>
        <Text style={styles.jobId}>{job.job_id}</Text>
        <View style={[styles.badge, { backgroundColor: `${STATUS_COLORS[job.status] || colors.textMuted}22`, borderColor: STATUS_COLORS[job.status] || colors.textMuted }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLORS[job.status] || colors.textMuted }]}>
            {job.status?.replace('_', ' ')}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Customer</Text>
        <InfoRow label="Name" value={job.customer_name} />
        <InfoRow label="Phone" value={job.phone_number} />
        <InfoRow label="Location" value={job.location || '-'} />
        <InfoRow label="Site Type" value={job.site_type || '-'} />
      </View>

      {isAdmin && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Work Tracking</Text>
          <InfoRow label="Started At" value={formatDateTime(job.work_started_at)} />
          <InfoRow label="Started By" value={job.work_started_by || '-'} />
          <InfoRow label="Start Location" value={formatLocation(job.work_start_location)} />
          <InfoRow label="Ended At" value={formatDateTime(job.work_ended_at)} />
          <InfoRow label="Ended By" value={job.work_ended_by || '-'} />
          <InfoRow label="End Location" value={formatLocation(job.work_end_location)} />
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Job Details</Text>
        <InfoRow label="Work Type" value={job.work_type} />
        <InfoRow label="Priority" value={job.priority} />
        <InfoRow label="Scheduled" value={job.scheduled_date || '-'} />
        <InfoRow label="Preferred Time" value={job.preferred_time || '-'} />
        {job.complaint ? <Text style={styles.complaint}>{job.complaint}</Text> : null}
      </View>

      {job.status !== 'complete' && job.status !== 'cancelled' && (
        <View style={styles.actions}>
          {canStartWork && (
            <TouchableOpacity
              style={[styles.updateBtn, { backgroundColor: colors.infoDim, borderColor: colors.info }]}
              onPress={() => submitWorkEvent('start_work')}
              disabled={actionSaving}
            >
              <Text style={[styles.updateBtnText, { color: colors.info }]}>
                {actionSaving ? 'Saving...' : 'Start Work'}
              </Text>
            </TouchableOpacity>
          )}

          {canUpdateStatus && (
            <TouchableOpacity style={styles.updateBtn} onPress={() => setShowUpdateModal(true)}>
              <Text style={styles.updateBtnText}>Update Status</Text>
            </TouchableOpacity>
          )}

          {isAdmin && (
            <TouchableOpacity
              style={[styles.updateBtn, { backgroundColor: colors.success, borderColor: colors.success }]}
              onPress={() => setShowBillingModal(true)}
            >
              <Text style={[styles.updateBtnText, { color: '#fff' }]}>Complete and Bill</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Updates ({updates.length})</Text>
        {updates.map((update) => (
          <View key={update.update_id} style={styles.updateItem}>
            <Text style={styles.updateStaff}>{update.staff_name}</Text>
            <View style={[styles.badge, { alignSelf: 'flex-start', backgroundColor: `${STATUS_COLORS[update.status] || colors.textMuted}22`, borderColor: STATUS_COLORS[update.status] || colors.textMuted }]}>
              <Text style={[styles.badgeText, { color: STATUS_COLORS[update.status] || colors.textMuted }]}>
                {update.status?.replace('_', ' ')}
              </Text>
            </View>

            {update.work_event ? (
              <Text style={styles.updateMeta}>
                Event: {update.work_event === 'start_work' ? 'Start Work' : update.work_event === 'end_work' ? 'End Work' : update.work_event}
              </Text>
            ) : null}
            {update.location ? <Text style={styles.updateMeta}>Location: {formatLocation(update.location)}</Text> : null}
            {update.visit_notes ? <Text style={styles.updateNotes}>{update.visit_notes}</Text> : null}
            {Number(update.collected_amount || 0) > 0 ? (
              <Text style={styles.money}>Collected: Rs {Number(update.collected_amount).toFixed(2)}</Text>
            ) : null}
            {Number(update.expense || 0) > 0 ? (
              <Text style={styles.money}>Expense: Rs {Number(update.expense).toFixed(2)}</Text>
            ) : null}

            {update.inventory_used?.length > 0 && (
              <View style={styles.inventoryBox}>
                <Text style={styles.inventoryTitle}>Hardware Used</Text>
                {update.inventory_used.map((item) => (
                  <Text key={`${update.update_id}-${item.barcode}`} style={styles.inventoryLine}>
                    - {item.quantity_used} x {item.item_name || item.barcode}
                    {item.model_number ? ` | Model: ${item.model_number}` : ''}
                    {item.serial_number ? ` | Serial: ${item.serial_number}` : ''}
                  </Text>
                ))}
              </View>
            )}

            {update.manual_inventory_items?.length > 0 && (
              <View style={styles.inventoryBox}>
                <Text style={styles.inventoryTitle}>Manual Inventory</Text>
                {update.manual_inventory_items.map((item, index) => (
                  <Text key={`${update.update_id}-manual-${index}`} style={styles.inventoryLine}>
                    - {item.quantity_used} x {item.item_name} ({item.verification_status || 'pending'})
                    {item.model_number ? ` | Model: ${item.model_number}` : ''}
                    {item.serial_number ? ` | Serial: ${item.serial_number}` : ''}
                  </Text>
                ))}
              </View>
            )}

            <Text style={styles.updateTime}>{formatDateTime(update.update_time)}</Text>
          </View>
        ))}
        {updates.length === 0 ? <Text style={styles.noUpdates}>No updates yet</Text> : null}
      </View>

      <Modal visible={showUpdateModal} animationType="slide" transparent onRequestClose={() => setShowUpdateModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
            <Text style={styles.modalTitle}>Update Job Status</Text>

            <Text style={styles.label}>Status</Text>
            <View style={styles.statusPicker}>
              {['pending', 'in_progress', 'complete', 'cancelled'].map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusOpt,
                    updateForm.status === status && {
                      backgroundColor: `${STATUS_COLORS[status]}33`,
                      borderColor: STATUS_COLORS[status],
                    },
                  ]}
                  onPress={() => setUpdateForm((prev) => ({ ...prev, status }))}
                >
                  <Text
                    style={[
                      styles.statusOptText,
                      updateForm.status === status && { color: STATUS_COLORS[status] },
                    ]}
                  >
                    {status.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Visit Notes</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={updateForm.visit_notes}
              onChangeText={(text) => setUpdateForm((prev) => ({ ...prev, visit_notes: text }))}
              placeholder="What was done on site?"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <Text style={styles.label}>Amount Collected (Rs)</Text>
            <TextInput
              style={styles.input}
              value={updateForm.collected_amount}
              onChangeText={(text) => setUpdateForm((prev) => ({ ...prev, collected_amount: text }))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.label}>Expense (Rs)</Text>
            <TextInput
              style={styles.input}
              value={updateForm.expense}
              onChangeText={(text) => setUpdateForm((prev) => ({ ...prev, expense: text }))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.subCard}>
              <Text style={styles.label}>Hardware Used</Text>
              <Text style={styles.label}>Model Number</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.rowInput]}
                  placeholder="Type model number"
                  value={modelInput}
                  onChangeText={setModelInput}
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity style={[styles.findBtn, { backgroundColor: colors.info }]} onPress={() => openScanner('model')}>
                  <Text style={styles.findBtnText}>Scan</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>Serial Number</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.rowInput]}
                  placeholder="Type serial number"
                  value={serialInput}
                  onChangeText={setSerialInput}
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity style={[styles.findBtn, { backgroundColor: colors.info }]} onPress={() => openScanner('serial')}>
                  <Text style={styles.findBtnText}>Scan</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.findBtn} onPress={lookupItem}>
                {searchingItem ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.findBtnText}>Find</Text>
                )}
              </TouchableOpacity>

              {foundItem ? (
                <View style={styles.foundCard}>
                  <Text style={styles.foundName}>{foundItem.item_name}</Text>
                  <Text style={styles.foundStock}>
                    Stock: {foundItem.current_quantity} {foundItem.unit_type}
                  </Text>
                  {!!foundItem.model_number && <Text style={styles.foundStock}>Model: {foundItem.model_number}</Text>}
                  {!!serialInput.trim() && <Text style={styles.foundStock}>Serial: {serialInput.trim()}</Text>}
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, { width: 90, marginBottom: 0 }]}
                      value={qtyInput}
                      onChangeText={setQtyInput}
                      keyboardType="numeric"
                      placeholder="Qty"
                      placeholderTextColor={colors.textMuted}
                    />
                    <TouchableOpacity style={[styles.findBtn, { backgroundColor: colors.success }]} onPress={addKnownInventory}>
                      <Text style={styles.findBtnText}>Add</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {updateForm.inventory_used.map((item) => (
                <View key={item.barcode} style={styles.selectedRow}>
                  <Text style={styles.selectedText}>
                    {item.quantity_used} x {item.item_name} ({item.barcode})
                    {item.model_number ? ` | Model: ${item.model_number}` : ''}
                    {item.serial_number ? ` | Serial: ${item.serial_number}` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => removeKnownInventory(item.barcode)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={styles.subCard}>
              <Text style={styles.label}>Barcode Not Found - Add Manual Inventory</Text>
              <TextInput
                style={styles.input}
                placeholder="Item name"
                value={manualItemForm.item_name}
                onChangeText={(text) => setManualItemForm((prev) => ({ ...prev, item_name: text }))}
                placeholderTextColor={colors.textMuted}
              />
              <View style={styles.row}>
                <TextInput
                  style={styles.input}
                  placeholder="Qty"
                  value={manualItemForm.quantity_used}
                  onChangeText={(text) => {
                    setManualItemForm((prev) => ({ ...prev, quantity_used: text }));
                    const qty = Math.max(1, parseInt(text, 10) || 1);
                    setManualSerials((prev) => {
                      const next = [...prev];
                      while (next.length < qty) next.push('');
                      return next.slice(0, qty);
                    });
                  }}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.rowInput]}
                  placeholder="Model number"
                  value={manualItemForm.model_number}
                  onChangeText={(text) => setManualItemForm((prev) => ({ ...prev, model_number: text }))}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              {manualSerials.map((serialVal, idx) => (
                <View style={styles.row} key={`manual-serial-${idx}`}>
                  <TextInput
                    style={[styles.input, styles.rowInput]}
                    placeholder={`Serial number ${idx + 1}`}
                    value={serialVal}
                    onChangeText={(text) => setManualSerials((prev) => prev.map((v, i) => (i === idx ? text : v)))}
                    placeholderTextColor={colors.textMuted}
                  />
                  <TouchableOpacity style={[styles.findBtn, { backgroundColor: colors.info }]} onPress={() => openScanner(`manual_serial_${idx}`)}>
                    <Text style={styles.findBtnText}>Scan</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={[styles.findBtn, { backgroundColor: colors.warning }]} onPress={addManualInventory}>
                <Text style={styles.findBtnText}>Add Manual Item</Text>
              </TouchableOpacity>

              {updateForm.manual_inventory_items.map((item, index) => (
                <View key={`${item.item_name}-${index}`} style={styles.selectedRow}>
                  <Text style={styles.selectedText}>
                    {item.quantity_used} x {item.item_name}
                    {item.model_number ? ` | Model: ${item.model_number}` : ''}
                    {item.serial_number ? ` | Serial: ${item.serial_number}` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => removeManualInventory(index)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.saveBtn, styles.saveBtnStacked]} onPress={submitUpdate} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowUpdateModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showBillingModal} animationType="slide" transparent onRequestClose={() => setShowBillingModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalSheet}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
            <Text style={styles.modalTitle}>Create Billing</Text>
            {[
              ['Invoice Amount (Rs)', 'invoice_amount'],
              ['Expense (Rs)', 'expense'],
              ['Material Amount (Rs)', 'material_amount'],
              ['Collected Amount (Rs)', 'collected_amount'],
            ].map(([label, field]) => (
              <React.Fragment key={field}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  style={styles.input}
                  value={billingForm[field]}
                  onChangeText={(text) => setBillingForm((prev) => ({ ...prev, [field]: text }))}
                  keyboardType="numeric"
                  placeholderTextColor={colors.textMuted}
                />
              </React.Fragment>
            ))}
            <Text style={styles.label}>Payment Mode</Text>
            <View style={styles.statusPicker}>
              {['cash', 'upi', 'bank_transfer', 'cheque', 'card'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.statusOpt,
                    billingForm.payment_mode === mode && {
                      backgroundColor: colors.accentDim,
                      borderColor: colors.accent,
                    },
                  ]}
                  onPress={() => setBillingForm((prev) => ({ ...prev, payment_mode: mode }))}
                >
                  <Text
                    style={[
                      styles.statusOptText,
                      billingForm.payment_mode === mode && { color: colors.accent },
                    ]}
                  >
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Payment Reference</Text>
            <TextInput
              style={styles.input}
              value={billingForm.payment_id}
              onChangeText={(text) => setBillingForm((prev) => ({ ...prev, payment_id: text }))}
              placeholder="UPI ref / cheque / txn id"
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.saveBtn, styles.saveBtnStacked, { backgroundColor: colors.success }]} onPress={submitBilling} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Complete</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowBillingModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showScannerModal} animationType="slide" onRequestClose={() => setShowScannerModal(false)}>
        <View style={styles.scannerWrap}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={onBarcodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerText}>
              {scanTarget === 'serial' || scanTarget.startsWith('manual_serial_')
                ? 'Scan serial number'
                : 'Scan model number'}
            </Text>
            <TouchableOpacity style={styles.cancelScannerBtn} onPress={() => setShowScannerModal(false)}>
              <Text style={styles.cancelScannerText}>Close Scanner</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function formatDateTime(value) {
  if (!value) return '-';
  return value.slice(0, 16).replace('T', ' ');
}

function formatLocation(location) {
  if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
    return '-';
  }
  const lat = Number(location.latitude).toFixed(5);
  const lng = Number(location.longitude).toFixed(5);
  const acc = location.accuracy ? ` (±${Math.round(location.accuracy)}m)` : '';
  return `${lat}, ${lng}${acc}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    paddingBottom: spacing.md,
  },
  jobId: { fontFamily: 'monospace', fontSize: 16, fontWeight: '800', color: colors.accent },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.md },
  complaint: {
    fontSize: 13,
    color: colors.textSecondary,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 12 },
  infoLabel: { fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', fontWeight: '600', width: '36%' },
  infoValue: { fontSize: 13, color: colors.text, flex: 1, textAlign: 'right' },
  actions: { paddingHorizontal: spacing.base, paddingBottom: spacing.md, gap: spacing.sm },
  updateBtn: {
    backgroundColor: colors.accentDim,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  updateBtnText: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  updateItem: { borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: spacing.md, marginBottom: spacing.md },
  updateStaff: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 4 },
  updateMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  updateNotes: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  money: { fontSize: 12, color: colors.warning, marginTop: 4 },
  updateTime: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  noUpdates: { color: colors.textMuted, textAlign: 'center', padding: spacing.base },
  inventoryBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.success,
  },
  inventoryTitle: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 4 },
  inventoryLine: { fontSize: 12, color: colors.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalScroll: { flexShrink: 1 },
  modalContent: { padding: spacing.xl, paddingBottom: spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.lg, textAlign: 'center' },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text,
    marginBottom: spacing.md,
    fontSize: 14,
  },
  statusPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  statusOpt: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  statusOptText: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textTransform: 'capitalize' },
  subCard: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rowInput: { flex: 1 },
  findBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    minWidth: 68,
    alignItems: 'center',
  },
  findBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  foundCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  foundName: { color: colors.text, fontWeight: '700', fontSize: 13 },
  foundStock: { color: colors.textSecondary, fontSize: 11, marginBottom: spacing.xs },
  selectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    marginTop: 4,
  },
  selectedText: { color: colors.text, fontSize: 12, flex: 1, marginRight: 12 },
  removeText: { color: colors.danger, fontWeight: '700', fontSize: 12 },
  modalBtns: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  cancelBtn: {
    width: '100%',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minHeight: 38,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: { color: colors.textSecondary, fontWeight: '600' },
  saveBtn: {
    width: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minHeight: 38,
  },
  saveBtnStacked: { marginBottom: spacing.sm },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  scannerWrap: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: spacing.md,
  },
  scannerText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  cancelScannerBtn: { backgroundColor: '#fff', borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  cancelScannerText: { color: '#000', fontWeight: '700' },
});
