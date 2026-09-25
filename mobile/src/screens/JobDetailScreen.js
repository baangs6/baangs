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
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as Sharing from 'expo-sharing';
import { jobsApi, updatesApi, billingApi, inventoryApi, API_BASE_URL } from '../api';
import { formatDate } from '../utils/dateFormat';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, useTheme } from '../theme';
import { callPhone, openJobMap } from '../utils/contactActions';
import storage from '../utils/storage';

const EMPTY_MANUAL_ITEM = {
  barcode: '',
  item_name: '',
  model_number: '',
  serial_number: '',
  quantity_used: '1',
};

const LEARNING_CATEGORIES = ['CCTV', 'Networking', 'Electrical', 'Software', 'Customer Handling', 'Other'];

export default function JobDetailScreen({ route }) {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme.colors), [theme.colors]);
  const STATUS_COLORS = React.useMemo(() => ({
    pending: colors.warning,
    in_progress: colors.info,
    complete: colors.success,
    cancelled: colors.danger,
  }), [theme.colors]);
  const { jobId } = route.params;
  const { user } = useAuth();

  const [job, setJob] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [customerHistory, setCustomerHistory] = useState([]);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [modelInput, setModelInput] = useState('');
  const [serialInput, setSerialInput] = useState('');
  const [scanTarget, setScanTarget] = useState('model');
  const [qtyInput, setQtyInput] = useState('1');
  const [foundItem, setFoundItem] = useState(null);
  const [modelOptions, setModelOptions] = useState([]);
  const [inventorySuggestions, setInventorySuggestions] = useState([]);
  const [searchingItem, setSearchingItem] = useState(false);

  const [manualItemForm, setManualItemForm] = useState(EMPTY_MANUAL_ITEM);
  const [manualSerials, setManualSerials] = useState(['']);

  const [updateForm, setUpdateForm] = useState({
    status: 'in_progress',
    visit_notes: '',
    issues_faced: '',
    learning_notes: '',
    learning_category: 'CCTV',
    expense: '0',
    service_charge: '0',
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
    setLoading(true);
    try {
      const jobRes = await jobsApi.get(jobId);
      setJob(jobRes.data);
      try {
        const updatesRes = await updatesApi.getJobUpdates(jobId);
        setUpdates(Array.isArray(updatesRes.data) ? updatesRes.data : []);
      } catch (updatesError) {
        console.warn('Job updates unavailable', updatesError.response?.data || updatesError.message);
        setUpdates([]);
      }
      try {
        const historyRes = await jobsApi.customerHistory(jobId);
        setCustomerHistory(historyRes.data?.history || []);
      } catch (historyError) {
        console.warn('Customer history unavailable', historyError);
        setCustomerHistory([]);
      }
      setUpdateForm((prev) => ({ ...prev, status: jobRes.data.status || 'in_progress' }));
    } catch (error) {
      const detail = error.response?.data?.detail;
      Alert.alert('Error', typeof detail === 'string' ? detail : error.message || 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [jobId]);

  const loadInventorySuggestions = async () => {
    try {
      const res = await inventoryApi.list();
      setInventorySuggestions(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.warn('Inventory suggestions failed', error);
    }
  };

  const clearUpdateDraft = () => {
    setUpdateForm({
      status: job?.status || 'in_progress',
      visit_notes: '',
      issues_faced: '',
      learning_notes: '',
      learning_category: 'CCTV',
      expense: '0',
      service_charge: '0',
      collected_amount: '0',
      inventory_used: [],
      manual_inventory_items: [],
    });
    setModelInput('');
    setSerialInput('');
    setFoundItem(null);
    setModelOptions([]);
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
        issues_faced: updateForm.issues_faced,
        learning_notes: updateForm.learning_notes,
        learning_category: updateForm.learning_notes ? updateForm.learning_category : null,
        expense: parseFloat(updateForm.expense) || 0,
        service_charge: parseFloat(updateForm.service_charge) || 0,
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

  const lookupItem = async (nextModel = modelInput, nextSerial = serialInput) => {
    const model = nextModel.trim();
    const serial = nextSerial.trim();
    if (!model && !serial) {
      Alert.alert('Missing Input', 'Enter model number or serial number');
      return;
    }
    setSearchingItem(true);
    try {
      const res = await inventoryApi.search(model, serial);
      const matches = Array.isArray(res.data?.matches) ? res.data.matches : [];
      if (matches.length > 0) {
        setFoundItem(null);
        setModelOptions(matches);
      } else {
        setFoundItem(res.data);
        setModelOptions([]);
        if (res.data?.model_number) setModelInput(res.data.model_number);
      }
      setQtyInput('1');
    } catch (error) {
      setFoundItem(null);
      setModelOptions([]);
      Alert.alert('Not Found', error.response?.data?.detail || 'No inventory found for the entered details');
    } finally {
      setSearchingItem(false);
    }
  };

  const shareInvoice = async (whatsapp = false) => {
    setInvoiceBusy(true);
    try {
      const token = await storage.getItem('token');
      const target = `${FileSystem.cacheDirectory}${jobId}-invoice.pdf`;
      const result = await FileSystem.downloadAsync(
        `${API_BASE_URL}/billing/job/${encodeURIComponent(jobId)}/invoice.pdf`,
        target,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (result.status < 200 || result.status >= 300) throw new Error(`Invoice download failed (${result.status})`);
      if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this phone.');
      await Sharing.shareAsync(result.uri, {
        mimeType: 'application/pdf',
        dialogTitle: whatsapp ? 'Send invoice using WhatsApp' : 'Save or open invoice',
        UTI: 'com.adobe.pdf',
      });
    } catch (error) {
      let message = error.response?.data?.detail || error.message || 'Complete billing before downloading the invoice.';
      if (String(message).includes('(404)')) message = 'No billing record exists for this job. Add the service charge or item billing first.';
      Alert.alert('Invoice unavailable', message);
    } finally {
      setInvoiceBusy(false);
    }
  };

  const selectModelOption = (item) => {
    setFoundItem(item);
    setModelOptions([]);
    setModelInput(item.model_number || '');
    setQtyInput('1');
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
    setModelOptions([]);
    setQtyInput('1');
  };

  const addManualInventory = () => {
    const quantityUsed = parseFloat(manualItemForm.quantity_used);
    const serialList = manualSerials.map((s) => s.trim()).filter(Boolean);
    if (
      !manualItemForm.item_name.trim() ||
      !quantityUsed ||
      quantityUsed <= 0
    ) {
      Alert.alert('Missing Details', 'Enter item name and valid quantity');
      return;
    }
    if (!Number.isInteger(quantityUsed)) {
      Alert.alert('Invalid Quantity', 'Quantity must be a whole number for serial-based manual items');
      return;
    }
    if (serialList.length > 0 && serialList.length !== quantityUsed) {
      Alert.alert(
        'Serial Count Mismatch',
        `Quantity is ${quantityUsed}, but serial count is ${serialList.length}. Enter exactly ${quantityUsed} serial number(s), or leave all serial numbers blank.`
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
          barcode: serialList.length > 0 ? serialList.join(', ') : null,
          item_name: manualItemForm.item_name.trim(),
          model_number: manualItemForm.model_number.trim(),
          serial_number: serialList.length > 0 ? serialList.join(', ') : null,
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
      lookupItem(modelInput, data);
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
        <InfoRow styles={styles} label="Name" value={job.customer_name} />
        <InfoRow styles={styles} label="Phone" value={job.phone_number} />
        <InfoRow styles={styles} label="Location" value={job.location || '-'} />
        <InfoRow styles={styles} label="Map" value={job.map_location || '-'} />
        <InfoRow styles={styles} label="Site Type" value={job.site_type || '-'} />
        <View style={styles.contactActions}>
          <TouchableOpacity
            style={[styles.contactBtn, { borderColor: colors.success }]}
            onPress={() => callPhone(job.phone_number)}
          >
            <Text style={[styles.contactBtnText, { color: colors.success }]}>Call Customer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.contactBtn, { borderColor: colors.info }]}
            onPress={() => openJobMap(job)}
          >
            <Text style={[styles.contactBtnText, { color: colors.info }]}>Open Map</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isAdmin && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Work Tracking</Text>
          <InfoRow styles={styles} label="Started At" value={formatDateTime(job.work_started_at)} />
          <InfoRow styles={styles} label="Started By" value={job.work_started_by || '-'} />
          <InfoRow styles={styles} label="Start Location" value={formatLocation(job.work_start_location)} />
          <InfoRow styles={styles} label="Ended At" value={formatDateTime(job.work_ended_at)} />
          <InfoRow styles={styles} label="Ended By" value={job.work_ended_by || '-'} />
          <InfoRow styles={styles} label="End Location" value={formatLocation(job.work_end_location)} />
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Job Details</Text>
        <InfoRow styles={styles} label="Work Type" value={job.work_type} />
        <InfoRow styles={styles} label="Priority" value={job.priority} />
        <InfoRow styles={styles} label="Scheduled" value={formatDate(job.scheduled_date)} />
        <InfoRow styles={styles} label="Preferred Time" value={job.preferred_time || '-'} />
        {job.complaint ? <Text style={styles.complaint}>{job.complaint}</Text> : null}
      </View>

      <View style={styles.invoiceActions}>
        <TouchableOpacity style={styles.invoiceBtn} onPress={() => shareInvoice(false)} disabled={invoiceBusy}>
          <Text style={styles.invoiceBtnText}>{invoiceBusy ? 'Preparing...' : 'Download Invoice'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.invoiceBtn, styles.whatsappBtn]} onPress={() => shareInvoice(true)} disabled={invoiceBusy}>
          <Text style={[styles.invoiceBtnText, styles.whatsappBtnText]}>WhatsApp</Text>
        </TouchableOpacity>
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
            <TouchableOpacity
              style={styles.updateBtn}
              onPress={() => {
                setShowUpdateModal(true);
                loadInventorySuggestions();
              }}
            >
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
        <TouchableOpacity style={styles.historyHeader} onPress={() => setShowCustomerHistory((visible) => !visible)}>
          <View>
            <Text style={[styles.sectionTitle, { marginBottom: 2 }]}>Customer History</Text>
            <Text style={styles.historyCount}>{customerHistory.length} service record{customerHistory.length === 1 ? '' : 's'}</Text>
          </View>
          <Text style={styles.historyToggle}>{showCustomerHistory ? 'Hide' : 'View'}</Text>
        </TouchableOpacity>
        {showCustomerHistory && (
          <View style={{ marginTop: spacing.md }}>
            {customerHistory.length === 0 ? <Text style={styles.noUpdates}>No previous service history</Text> : null}
            {customerHistory.map((entry) => (
              <View key={entry.job_id} style={styles.historyItem}>
                <View style={styles.historyTitleRow}>
                  <Text style={styles.historyJobId}>{entry.job_id}</Text>
                  <Text style={styles.historyDate}>{formatDateTime(entry.date)}</Text>
                </View>
                <Text style={styles.historyService}>{entry.work_type || 'Service'} | {entry.status?.replace('_', ' ')}</Text>
                {!!entry.complaint && <Text style={styles.historyText}>Complaint: {entry.complaint}</Text>}
                <Text style={styles.historyText}>Staff: {entry.staff_attended?.join(', ') || '-'}</Text>
                {entry.service_updates?.map((update, index) => (
                  <Text key={`${entry.job_id}-update-${index}`} style={styles.historyText}>
                    {update.staff_name || 'Technician'}: {update.visit_notes || update.issues_faced}
                  </Text>
                ))}
                {entry.products_used?.length > 0 && (
                  <View style={styles.inventoryBox}>
                    <Text style={styles.inventoryTitle}>Products Used</Text>
                    {entry.products_used.map((product, index) => (
                      <Text key={`${entry.job_id}-product-${index}`} style={styles.inventoryLine}>
                        {product.quantity_used} x {product.item_name}
                        {product.model_number ? ` | Model: ${product.model_number}` : ''}
                        {product.serial_number ? ` | Serial: ${product.serial_number}` : ''}
                      </Text>
                    ))}
                  </View>
                )}
                <Text style={styles.historyInvoice}>
                  {entry.invoice
                    ? `Invoice ${entry.invoice.billing_id}: Rs ${Number(entry.invoice.invoice_amount || 0).toFixed(2)} | Collected Rs ${Number(entry.invoice.collected_amount || 0).toFixed(2)}`
                    : 'Invoice: Not billed'}
                </Text>
                {!!entry.invoice?.payment_mode && <Text style={styles.historyText}>Payment: {entry.invoice.payment_mode}{entry.invoice.payment_id ? ` | Ref: ${entry.invoice.payment_id}` : ''}</Text>}
              </View>
            ))}
          </View>
        )}
      </View>

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
            {update.issues_faced ? <Text style={[styles.updateNotes, { color: colors.danger }]}>Issues: {update.issues_faced}</Text> : null}
            {update.admin_reply ? <Text style={styles.adminReply}>Admin reply: {update.admin_reply}</Text> : null}
            {update.learning_notes ? (
              <View style={styles.learningBox}>
                <Text style={styles.learningLabel}>Learned · {update.learning_category || 'Other'}</Text>
                <Text style={styles.updateNotes}>{update.learning_notes}</Text>
              </View>
            ) : null}
            {Number(update.service_charge || 0) > 0 ? (
              <Text style={styles.money}>Service charge: Rs {Number(update.service_charge).toFixed(2)}</Text>
            ) : null}
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
              style={[styles.input, { height: 140, textAlignVertical: 'top' }]}
              value={updateForm.visit_notes}
              onChangeText={(text) => setUpdateForm((prev) => ({ ...prev, visit_notes: text }))}
              placeholder="What was done on site?"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <Text style={styles.label}>Doubts / Issues Faced</Text>
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
              value={updateForm.issues_faced}
              onChangeText={(text) => setUpdateForm((prev) => ({ ...prev, issues_faced: text }))}
              placeholder="Pending doubts, blockers, or site issues"
              placeholderTextColor={colors.textMuted}
              multiline
            />

            <View style={styles.subCard}>
              <Text style={styles.sectionTitle}>What I Learned</Text>
              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.learningCategories}>
                {LEARNING_CATEGORIES.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[styles.categoryChip, updateForm.learning_category === category && styles.categoryChipActive]}
                    onPress={() => setUpdateForm((prev) => ({ ...prev, learning_category: category }))}
                  >
                    <Text style={[styles.categoryChipText, updateForm.learning_category === category && styles.categoryChipTextActive]}>{category}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                style={[styles.input, { height: 110, textAlignVertical: 'top' }]}
                value={updateForm.learning_notes}
                onChangeText={(text) => setUpdateForm((prev) => ({ ...prev, learning_notes: text }))}
                placeholder="New method, product knowledge, diagnosis, or customer handling learned"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>

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
              <Text style={styles.sectionTitle}>Service Charge</Text>
              <Text style={styles.label}>Service Charge (Rs)</Text>
              <TextInput
                style={styles.input}
                value={updateForm.service_charge}
                onChangeText={(text) => setUpdateForm((prev) => ({ ...prev, service_charge: text }))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.subCard}>
              <Text style={styles.label}>Hardware Used</Text>
              <Text style={styles.label}>Model Number / Item Name</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.rowInput]}
                  placeholder="Type model number or item name"
                  value={modelInput}
                  onFocus={loadInventorySuggestions}
                  onChangeText={(text) => {
                    setModelInput(text);
                    setFoundItem(null);
                    setModelOptions([]);
                  }}
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity style={[styles.findBtn, { backgroundColor: colors.info }]} onPress={() => openScanner('model')}>
                  <Text style={styles.findBtnText}>Scan</Text>
                </TouchableOpacity>
              </View>
              {modelInput.trim().length > 0 ? (
                <View style={styles.suggestionBox}>
                  {inventorySuggestions
                    .filter((item) => {
                      const q = modelInput.trim().toLowerCase();
                      return (
                        String(item.model_number || '').toLowerCase().includes(q) ||
                        String(item.item_name || '').toLowerCase().includes(q) ||
                        String(item.barcode || '').toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 6)
                    .map((item) => (
                      <TouchableOpacity
                        key={`known-suggest-${item.barcode}`}
                        style={styles.suggestionItem}
                        activeOpacity={0.75}
                        onPress={() => {
                          setModelInput(item.model_number || item.item_name || item.barcode || '');
                          setSerialInput('');
                          setFoundItem(null);
                          setModelOptions([]);
                        }}
                      >
                        <Text style={styles.suggestionTitle}>{item.model_number || item.item_name || item.barcode}</Text>
                        <Text style={styles.suggestionMeta}>
                          {item.item_name}{item.barcode ? ` | ${item.barcode}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              ) : null}
              <Text style={styles.label}>Serial Number</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.rowInput]}
                  placeholder="Type serial number (optional)"
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

              {modelOptions.length > 0 ? (
                <View style={styles.foundCard}>
                  <Text style={styles.foundName}>
                    {serialInput.trim() ? `Select item for serial ${serialInput.trim()}` : 'Select matching item'}
                  </Text>
                  {modelOptions.map((item) => (
                    <TouchableOpacity
                      key={item.barcode}
                      style={styles.modelOption}
                      activeOpacity={0.75}
                      onPress={() => selectModelOption(item)}
                    >
                      <Text style={styles.modelOptionTitle}>{item.model_number || 'No model number'}</Text>
                      <Text style={styles.foundStock}>
                        {item.item_name} | Stock: {item.current_quantity} {item.unit_type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

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
              {manualItemForm.item_name.trim().length > 0 ? (
                <View style={styles.suggestionBox}>
                  {inventorySuggestions
                    .filter((item) => String(item.item_name || '').toLowerCase().includes(manualItemForm.item_name.trim().toLowerCase()))
                    .slice(0, 6)
                    .map((item) => (
                      <TouchableOpacity
                        key={`manual-suggest-${item.barcode}`}
                        style={styles.suggestionItem}
                        activeOpacity={0.75}
                        onPress={() => setManualItemForm((prev) => ({
                          ...prev,
                          item_name: item.item_name || prev.item_name,
                          model_number: item.model_number || prev.model_number,
                        }))}
                      >
                        <Text style={styles.suggestionTitle}>{item.item_name}</Text>
                        {!!item.model_number && <Text style={styles.suggestionMeta}>Model: {item.model_number}</Text>}
                      </TouchableOpacity>
                    ))}
                </View>
              ) : null}
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
                  placeholder="Model number (optional)"
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

function InfoRow({ label, value, styles }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = formatDate(value);
  const time = String(value).match(/[T\s](\d{2}):(\d{2})/);
  return time ? `${date} ${time[1]}:${time[2]}` : date;
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

const createStyles = (colors) => StyleSheet.create({
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
  contactActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  contactBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface2,
  },
  contactBtnText: { fontSize: 12, fontWeight: '800' },
  actions: { paddingHorizontal: spacing.base, paddingBottom: spacing.md, gap: spacing.sm },
  invoiceActions: { flexDirection: 'row', paddingHorizontal: spacing.base, paddingBottom: spacing.md, gap: spacing.sm },
  invoiceBtn: { flex: 1, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.accentDim, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  invoiceBtnText: { color: colors.accent, fontWeight: '800', fontSize: 12 },
  whatsappBtn: { borderColor: colors.success, backgroundColor: `${colors.success}18` },
  whatsappBtnText: { color: colors.success },
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
  adminReply: { fontSize: 12, color: colors.info, backgroundColor: colors.infoDim, padding: spacing.sm, borderRadius: radius.sm, marginTop: spacing.sm },
  learningBox: { backgroundColor: `${colors.success}12`, borderLeftWidth: 2, borderLeftColor: colors.success, padding: spacing.sm, marginTop: spacing.sm },
  learningLabel: { color: colors.success, fontSize: 11, fontWeight: '800' },
  money: { fontSize: 12, color: colors.warning, marginTop: 4 },
  updateTime: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  noUpdates: { color: colors.textMuted, textAlign: 'center', padding: spacing.base },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyCount: { color: colors.textMuted, fontSize: 11 },
  historyToggle: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  historyItem: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, marginTop: spacing.md },
  historyTitleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  historyJobId: { color: colors.accent, fontWeight: '800', fontSize: 12, flex: 1 },
  historyDate: { color: colors.textMuted, fontSize: 10 },
  historyService: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 5, textTransform: 'capitalize' },
  historyText: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  historyInvoice: { color: colors.success, fontSize: 12, fontWeight: '700', marginTop: 8 },
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
  modelOption: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  learningCategories: { gap: spacing.xs, paddingBottom: spacing.md },
  categoryChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface2 },
  categoryChipActive: { borderColor: colors.success, backgroundColor: `${colors.success}18` },
  categoryChipText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  categoryChipTextActive: { color: colors.success },
  modelOptionTitle: { color: colors.accent, fontWeight: '800', fontSize: 13, marginBottom: 2 },
  suggestionBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  suggestionTitle: { color: colors.text, fontWeight: '700', fontSize: 13 },
  suggestionMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
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
