import { useState, useEffect, useRef, useContext, useMemo } from 'react';
import { storage, app } from '../firebase.js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { B, f1, inp, btnP, btnS, btnD } from '../components/brand/tokens.js';
import { MobileCtx } from '../hooks/useMobile.js';
import { Modal } from '../components/primitives/Modal.jsx';
import { FF } from '../components/primitives/FF.jsx';
import { Badge } from '../components/primitives/Badge.jsx';
import { useConfirm } from '../components/primitives/ConfirmDialog.jsx';
import { UndoToast } from '../components/primitives/UndoToast.jsx';
import { resizeImageForUpload } from '../utils/imageResize.js';
import { printLabel, printInventory } from '../utils/print.js';
import { exportItemsCSV } from '../utils/csv.js';
import { localDateStr } from '../utils/date.js';
import { canManageItem } from '../utils/roleHelpers.js';
import { ITEM_STATUS } from '../utils/constants.js';
// qrcode imported dynamically in the QR-generation effect below — keeps it out of the main bundle.

function generateId(description, existingIds) {
  const skip = new Set(['a','an','the','of','in','for','and','or','to']);
  const words = description.trim().split(/\s+/).filter(w => !skip.has(w.toLowerCase()));
  if (!words.length) return '';
  const prefix = words[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
  if (prefix.length < 2) return '';
  const re = new RegExp('^' + prefix + '-(\\d+)$', 'i');
  let max = 0;
  for (const id of existingIds) {
    const m = String(id).match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefix + '-' + String(max + 1).padStart(3, '0');
}

export function ItemsPage({ store, userProfile, initialItemId, scannedItemId, onScannedItemConsumed }) {
  const { items, supplies, settings, config, activityLog, addItem, addSupply, updateItem, checkOutItem, returnItem, retireItem, markRepair, markRepaired, deleteItem, publicRequests, dismissPublicRequest, updateSettings } = store;
  const _isMobile = useContext(MobileCtx);
  const activeItems = useMemo(() => items.filter(i => i.status !== ITEM_STATUS.DISPOSED), [items]);
  const disposedItems = useMemo(() => items.filter(i => i.status === ITEM_STATUS.DISPOSED), [items]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => localStorage.getItem('inv_statusFilter') || 'all');
  const [locationFilter, setLocationFilter] = useState(() => localStorage.getItem('inv_locationFilter') || 'all');
  const [ministryFilter, setMinistryFilter] = useState(() => localStorage.getItem('inv_ministryFilter') || 'all');
  const [showDisposed, setShowDisposed] = useState(false);

  function setLocation(v) { setLocationFilter(v); localStorage.setItem('inv_locationFilter', v); }
  function setMinistry(v) { setMinistryFilter(v); localStorage.setItem('inv_ministryFilter', v); }
  function setStatus(v) { setStatusFilter(v); localStorage.setItem('inv_statusFilter', v); }

  // Role helpers (needed in useEffect dep arrays — must be before any useEffect)
  const isAdmin = userProfile?.role === "admin";
  const isManager = userProfile?.role === "manager";

  // Modals — single state: { type: 'add'|'edit'|'checkout'|'return'|'repair'|'retire'|'detail', item: obj|null }
  const [activeModal, setActiveModal] = useState(null);
  const [detailQrUrl, setDetailQrUrl] = useState('');
  const showAdd      = activeModal?.type === 'add';
  const showEdit     = activeModal?.type === 'edit'     ? activeModal.item : null;
  const showCheckOut = activeModal?.type === 'checkout' ? activeModal.item : null;
  const showReturn   = activeModal?.type === 'return'   ? activeModal.item : null;
  const showRepair   = activeModal?.type === 'repair'   ? activeModal.item : null;
  const showRetire   = activeModal?.type === 'retire'   ? activeModal.item : null;
  const showDetail   = activeModal?.type === 'detail'   ? activeModal.item : null;

  // Bulk selection (needed in useEffect dep arrays — must be before any useEffect)
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkModal, setBulkModal] = useState(null); // 'coWarn'|'co'|'retWarn'|'ret'|'loc'
  const [bulkData, setBulkData] = useState({ coItems: [], retItems: [], skipped: 0, retCondition: 'Good', newLoc: '' });
  const bulkCoItems      = bulkData.coItems;
  const bulkRetItems     = bulkData.retItems;
  const bulkSkipped      = bulkData.skipped;
  const bulkRetCondition = bulkData.retCondition;
  const bulkNewLoc       = bulkData.newLoc;

  useEffect(() => {
    if (!showDetail) { setDetailQrUrl(''); return; }
    const itemUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '') + '?item=' + encodeURIComponent(showDetail.itemId);
    let cancelled = false;
    import('qrcode').then(({ default: QRCode }) => {
      if (cancelled) return;
      QRCode.toDataURL(itemUrl, { width: 200, margin: 2 }).then((u) => { if (!cancelled) setDetailQrUrl(u); }).catch(() => { if (!cancelled) setDetailQrUrl(''); });
    }).catch(() => { if (!cancelled) setDetailQrUrl(''); });
    return () => { cancelled = true; };
  }, [showDetail?.itemId]);

  // Deep-link: open item from ?item= URL param
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!initialItemId || deepLinked.current || !items.length) return;
    const found = items.find(i => i.itemId === initialItemId);
    if (found) { setActiveModal({ type: 'detail', item: found }); deepLinked.current = true; }
  }, [initialItemId, items]);

  // Scanner: open item from camera scan
  useEffect(() => {
    if (!scannedItemId || !items.length) return;
    const found = items.find(i => i.itemId === scannedItemId);
    if (found) { setActiveModal({ type: 'detail', item: found }); }
    else { flash(`No item found with ID "${scannedItemId}"`); }
    onScannedItemConsumed?.();
  }, [scannedItemId, items]);

  // Keyboard shortcuts: N = new item, / = focus search, Esc = close modal
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        if (bulkModal) { setBulkModal(null); return; }
        if (bulkMode) { setBulkMode(false); setSelectedIds(new Set()); return; }
        if (activeModal) { setActiveModal(null); return; }
        return;
      }
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!activeModal && (isAdmin || isManager)) {
          setItemForm(emptyItem); setPhotoFile(null); setPhotoPreview(null); setShowFinancial(false); setIdTouched(false); setActiveModal({ type: 'add', item: null });
        }
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeModal, bulkModal, bulkMode, isAdmin, isManager]);

  // Forms
  const emptyItem = { itemId:"", description:"", location:"", ministry:"", status:ITEM_STATUS.AVAILABLE, condition:"Good", notes:"", tags:[], purchaseDate:"", purchasePrice:"", warrantyExpiry:"", estimatedValue:"" };
  const [itemForm, setItemForm] = useState(emptyItem);
  const [idTouched, setIdTouched] = useState(false);
  const [coForm, setCoForm] = useState({ person:"", purpose:"", ministry:"", date:"", returnDate:"" });
  const [retForm, setRetForm] = useState({ condition:"Good", notes:"" });
  const [repairForm, setRepairForm] = useState({ issue:"", handler:"", expectedDate:"" });
  const [retireForm, setRetireForm] = useState({ reason:"Broken", date:"", notes:"", recoveryValue:"" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [undo, setUndo] = useState(null);
  const { confirm, ConfirmHost } = useConfirm();
  const [showMoveToSupply, setShowMoveToSupply] = useState(null);
  const [moveSupplyForm, setMoveSupplyForm] = useState({ supplyId:"", quantity:"0", minQuantity:"5", unit:"each" });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [showFinancial, setShowFinancial] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const searchRef = useRef(null);

  const locations = settings?.locations || [];
  const ministries = settings?.ministries || [];
  const tagOptions = settings?.tags || [];
  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || "Unknown";

  // Filter logic
  const displayItems = useMemo(() => (showDisposed ? disposedItems : activeItems).filter(item => {
    if (search && !item.description?.toLowerCase().includes(search.toLowerCase()) && !item.itemId?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (locationFilter !== "all" && item.location !== locationFilter) return false;
    if (ministryFilter !== "all" && item.ministry !== ministryFilter) return false;
    return true;
  }), [showDisposed, disposedItems, activeItems, search, statusFilter, locationFilter, ministryFilter]);

  // Helpers
  function flash(text, isError = false) { setMsg({ text, isError }); setTimeout(() => setMsg(null), 5000); }
  const today = localDateStr(new Date());

  // ── AI Item Identification ──
  async function handleIdentify() {
    if (!photoFile) return;
    setIdentifying(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(photoFile);
      });
      const identify = httpsCallable(getFunctions(app), 'identifyItem');
      const result = await identify({ imageBase64: base64, mediaType: photoFile.type || 'image/jpeg' });
      if (result.data?.description) {
        const desc = result.data.description;
        setItemForm(f => {
          const u = { ...f, description: desc };
          if (!idTouched) u.itemId = generateId(desc, items.map(i => i.itemId));
          return u;
        });
      } else {
        flash('Could not identify item — try again or enter manually.');
      }
    } catch {
      flash('Could not identify item — try again or enter manually.');
    }
    setIdentifying(false);
  }

  function exitBulkMode() { setBulkMode(false); setSelectedIds(new Set()); }
  function toggleSelect(docId) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(docId) ? n.delete(docId) : n.add(docId); return n; });
  }

  // ── Bulk Checkout ──
  function startBulkCheckout() {
    const sel = displayItems.filter(i => selectedIds.has(i._docId));
    const coable = sel.filter(i => i.status === 'Available');
    setBulkData({ coItems: coable, retItems: [], skipped: sel.length - coable.length, retCondition: 'Good', newLoc: '' });
    setCoForm({ person:"", purpose:"", ministry:"", date:today, returnDate:"" });
    if (sel.length - coable.length > 0) setBulkModal('coWarn');
    else setBulkModal('co');
  }
  async function handleBulkCheckout() {
    if (!coForm.person.trim()) { flash('Please enter who is checking out the items.'); return; }
    if (coForm.returnDate && coForm.date && coForm.returnDate < coForm.date) { flash('Return date cannot be before checkout date.'); return; }
    if (!await confirm({
      title: 'Check out items?',
      message: `Check out ${bulkCoItems.length} item${bulkCoItems.length !== 1 ? 's' : ''}?`,
      confirmLabel: 'Check out',
    })) return;
    setSaving(true);
    await Promise.all(bulkCoItems.map(item =>
      checkOutItem(item._docId, { itemId:item.itemId, person:coForm.person.trim(), purpose:coForm.purpose.trim(), ministry:coForm.ministry, date:coForm.date, returnDate:coForm.returnDate }, userId, userName)
    ));
    setSaving(false);
    setBulkModal(null);
    exitBulkMode();
    flash(`${bulkCoItems.length} item${bulkCoItems.length !== 1 ? 's' : ''} checked out.`);
  }

  // ── Bulk Return ──
  function startBulkReturn() {
    const sel = displayItems.filter(i => selectedIds.has(i._docId));
    const retable = sel.filter(i => i.status === 'Checked Out' || i.status === 'In Use');
    setBulkData(d => ({ ...d, retItems: retable, skipped: sel.length - retable.length, retCondition: 'Good' }));
    if (sel.length - retable.length > 0) setBulkModal('retWarn');
    else setBulkModal('ret');
  }
  async function handleBulkReturn() {
    if (!await confirm({
      title: 'Return items?',
      message: `Return ${bulkRetItems.length} item${bulkRetItems.length !== 1 ? 's' : ''}?`,
      confirmLabel: 'Return',
    })) return;
    setSaving(true);
    await Promise.all(bulkRetItems.map(item =>
      returnItem(item._docId, { itemId:item.itemId, condition:bulkRetCondition, person:item.assignedTo||'' }, userId, userName)
    ));
    setSaving(false);
    setBulkModal(null);
    exitBulkMode();
    flash(`${bulkRetItems.length} item${bulkRetItems.length !== 1 ? 's' : ''} returned.`);
  }

  // ── Bulk Location ──
  async function handleBulkLocation() {
    if (!bulkNewLoc) { flash('Please select a location.'); return; }
    const sel = displayItems.filter(i => selectedIds.has(i._docId));
    if (!await confirm({
      title: 'Move items?',
      message: `Change location for ${sel.length} item${sel.length !== 1 ? 's' : ''} to "${bulkNewLoc}"?`,
      confirmLabel: 'Move',
    })) return;
    setSaving(true);
    await Promise.all(sel.map(item =>
      updateItem(item._docId, { location:bulkNewLoc }, userId, userName)
    ));
    setSaving(false);
    setBulkModal(null);
    exitBulkMode();
    flash(`${sel.length} item${sel.length !== 1 ? 's' : ''} moved to ${bulkNewLoc}.`);
  }

  // ── Bulk Export ──
  function handleBulkExport() { exportItemsCSV(items.filter(i => selectedIds.has(i._docId))); }

  // ── Add Item ──
  async function handleAdd() {
    if (!itemForm.itemId.trim() || !itemForm.description.trim()) return;
    if (itemForm.itemId.trim().length < 3) { flash("Item ID must be at least 3 characters."); return; }
    const duplicate = items.find(i => i.itemId === itemForm.itemId.trim());
    if (duplicate) { flash(`Item ID "${itemForm.itemId.trim()}" already exists. Use a unique ID.`); return; }
    setSaving(true);
    let photoUrl = "";
    if (photoFile) {
      try {
        const resized = await resizeImageForUpload(photoFile);
        const sRef = storageRef(storage, `churches/${userProfile.churchId}/items/${itemForm.itemId.trim()}-${Date.now()}`);
        await uploadBytes(sRef, resized, { contentType: 'image/jpeg' });
        photoUrl = await getDownloadURL(sRef);
      } catch {
        setPhotoFile(null);
        setPhotoPreview(null);
        setSaving(false);
        flash('Photo upload failed. Remove the photo or try a smaller image, then save again.');
        return;
      }
    }
    await addItem({
      itemId: itemForm.itemId.trim(),
      description: itemForm.description.trim(),
      location: itemForm.location,
      ministry: itemForm.ministry,
      status: ITEM_STATUS.AVAILABLE,
      condition: itemForm.condition || "Good",
      notes: itemForm.notes,
      tags: itemForm.tags || [],
      photoUrl,
      assignedTo: "",
      checkOutDate: "",
      expectedReturn: "",
      purchaseDate: itemForm.purchaseDate || null,
      purchasePrice: itemForm.purchasePrice !== "" ? Number(itemForm.purchasePrice) : null,
      warrantyExpiry: itemForm.warrantyExpiry || null,
      estimatedValue: itemForm.estimatedValue !== "" ? Number(itemForm.estimatedValue) : null,
    }, userId, userName);
    setActiveModal(null);
    setItemForm(emptyItem);
    setPhotoFile(null);
    setPhotoPreview(null);
    setSaving(false);
    flash("Item added to inventory!");
  }

  // ── Edit Item ──
  async function handleEdit() {
    if (!showEdit) return;
    if (itemForm.itemId.trim().length < 3) { flash("Item ID must be at least 3 characters."); return; }
    const duplicate = items.find(i => i.itemId === itemForm.itemId.trim() && i._docId !== showEdit._docId);
    if (duplicate) { flash(`Item ID "${itemForm.itemId.trim()}" is already used by another item.`); return; }
    setSaving(true);
    let photoUrl = showEdit.photoUrl || "";
    if (photoFile) {
      try {
        const resized = await resizeImageForUpload(photoFile);
        const sRef = storageRef(storage, `churches/${userProfile.churchId}/items/${itemForm.itemId.trim()}-${Date.now()}`);
        await uploadBytes(sRef, resized, { contentType: 'image/jpeg' });
        photoUrl = await getDownloadURL(sRef);
      } catch { flash('Photo upload failed — item saved without photo.'); }
    }
    await updateItem(showEdit._docId, {
      itemId: itemForm.itemId.trim(),
      description: itemForm.description.trim(),
      location: itemForm.location,
      ministry: itemForm.ministry,
      condition: itemForm.condition,
      notes: itemForm.notes,
      tags: itemForm.tags || [],
      photoUrl,
      purchaseDate: itemForm.purchaseDate || null,
      purchasePrice: itemForm.purchasePrice !== "" ? Number(itemForm.purchasePrice) : null,
      warrantyExpiry: itemForm.warrantyExpiry || null,
      estimatedValue: itemForm.estimatedValue !== "" ? Number(itemForm.estimatedValue) : null,
    }, userId, userName);
    setActiveModal(null);
    setPhotoFile(null);
    setPhotoPreview(null);
    setSaving(false);
    flash("Item updated!");
  }

  // ── Check Out ──
  async function handleCheckOut() {
    if (!showCheckOut || !coForm.person.trim()) return;
    const checkoutDate = coForm.date || today;
    if (coForm.returnDate && coForm.returnDate < checkoutDate) { flash("Return date cannot be before the check-out date."); return; }
    setSaving(true);
    await checkOutItem(showCheckOut._docId, {
      itemId: showCheckOut.itemId,
      person: coForm.person.trim(),
      purpose: coForm.purpose,
      ministry: coForm.ministry,
      date: coForm.date || today,
      returnDate: coForm.returnDate
    }, userId, userName);
    setActiveModal(null);
    setCoForm({ person:"", purpose:"", ministry:"", date:"", returnDate:"" });
    setSaving(false);
    flash("Item checked out!");
  }

  // ── Return ──
  async function handleReturn() {
    if (!showReturn) return;
    setSaving(true);
    await returnItem(showReturn._docId, {
      itemId: showReturn.itemId,
      condition: retForm.condition,
      person: showReturn.assignedTo
    }, userId, userName);
    setActiveModal(null);
    setRetForm({ condition:"Good", notes:"" });
    setSaving(false);
    flash("Item returned!");
  }

  // ── Mark Repair ──
  async function handleRepair() {
    if (!showRepair || !repairForm.issue.trim()) return;
    setSaving(true);
    await markRepair(showRepair._docId, {
      itemId: showRepair.itemId,
      issue: repairForm.issue.trim(),
      handler: repairForm.handler,
      expectedDate: repairForm.expectedDate
    }, userId, userName);
    setActiveModal(null);
    setRepairForm({ issue:"", handler:"", expectedDate:"" });
    setSaving(false);
    flash("Item sent to repair!");
  }

  // ── Mark Repaired ──
  async function handleRepaired(item) {
    setSaving(true);
    await markRepaired(item._docId, { itemId: item.itemId }, userId, userName);
    setSaving(false);
    flash("Item marked as repaired!");
  }

  // ── Retire ──
  async function handleRetire() {
    if (!showRetire) return;
    if (retireForm.recoveryValue !== "" && Number(retireForm.recoveryValue) < 0) { flash("Recovery value cannot be negative."); return; }
    const target = showRetire;
    setSaving(true);
    await retireItem(target._docId, {
      itemId: target.itemId,
      reason: retireForm.reason,
      date: retireForm.date || today,
      notes: retireForm.notes,
      recoveryValue: retireForm.recoveryValue ? Number(retireForm.recoveryValue) : null
    }, userId, userName);
    setActiveModal(null);
    setRetireForm({ reason:"Broken", date:"", notes:"", recoveryValue:"" });
    setSaving(false);
    setUndo({
      message: `${target.itemId} retired.`,
      onUndo: () => updateItem(target._docId, {
        status: target.status || 'Available',
        disposedReason: null, disposedDate: null, disposedBy: null,
        disposedNotes: null, recoveryValue: null,
      }, userId, userName),
    });
  }

  // ── Delete ──
  async function handleDeleteItem(item) {
    const ok = await confirm({
      title: 'Delete item?',
      message: <>Permanently delete <strong>{item.description}</strong> ({item.itemId}). Activity history is preserved, but the item itself cannot be recovered.</>,
      confirmLabel: 'Delete',
      danger: true,
      typeToConfirm: item.itemId,
    });
    if (!ok) return;
    await deleteItem(item._docId, item.itemId, userId, userName);
    setActiveModal(null);
    flash("Item deleted.");
  }

  // ── Move to Supplies ──
  async function handleMoveToSupply() {
    if (!showMoveToSupply) return;
    const id = moveSupplyForm.supplyId.trim();
    if (id.length < 3) { flash("Supply ID must be at least 3 characters."); return; }
    if (supplies.some(s => s.supplyId === id)) { flash("A supply with that ID already exists."); return; }
    if (Number(moveSupplyForm.quantity) < 0) { flash("Quantity cannot be negative."); return; }
    setSaving(true);
    await addSupply({
      supplyId: id,
      description: showMoveToSupply.description,
      location: showMoveToSupply.location || "",
      ministry: showMoveToSupply.ministry || "",
      tags: showMoveToSupply.tags || [],
      quantity: Number(moveSupplyForm.quantity) || 0,
      minQuantity: Number(moveSupplyForm.minQuantity) || 5,
      unit: moveSupplyForm.unit || "each",
    }, userId, userName);
    await deleteItem(showMoveToSupply._docId, showMoveToSupply.itemId, userId, userName);
    setSaving(false);
    setShowMoveToSupply(null);
    flash("Moved to supplies.");
  }

  // Open edit with pre-filled data
  function openEdit(item) {
    setItemForm({
      itemId: item.itemId || "",
      description: item.description || "",
      location: item.location || "",
      ministry: item.ministry || "",
      condition: item.condition || "Good",
      notes: item.notes || "",
      tags: item.tags || [],
      status: item.status,
      purchaseDate: item.purchaseDate || "",
      purchasePrice: item.purchasePrice ?? "",
      warrantyExpiry: item.warrantyExpiry || "",
      estimatedValue: item.estimatedValue ?? "",
    });
    setShowFinancial(!!(item.purchaseDate || item.purchasePrice != null || item.warrantyExpiry || item.estimatedValue != null));
    setPhotoFile(null);
    setPhotoPreview(item.photoUrl || null);
    setActiveModal({ type: 'edit', item });
  }

  // Duplicate item — opens Add modal pre-filled (ID cleared)
  function openDuplicate(item) {
    const desc = item.description || "";
    setIdTouched(false);
    setItemForm({
      itemId: generateId(desc, items.map(i => i.itemId)),
      description: desc,
      location: item.location || "",
      ministry: item.ministry || "",
      condition: item.condition || "Good",
      notes: item.notes || "",
      tags: item.tags || [],
      status: ITEM_STATUS.AVAILABLE,
      purchaseDate: "",
      purchasePrice: "",
      warrantyExpiry: "",
      estimatedValue: "",
    });
    setShowFinancial(!!(item.purchaseDate || item.purchasePrice != null || item.warrantyExpiry || item.estimatedValue != null));
    setPhotoFile(null);
    setPhotoPreview(null);
    setActiveModal({ type: 'add', item: null });
  }

  const [newTagInput, setNewTagInput] = useState("");

  // Tag toggle
  function toggleTag(tag) {
    setItemForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag]
    }));
  }
  function addNewItemTag() {
    const tag = newTagInput.trim();
    if (!tag || tagOptions.map(t => t.toLowerCase()).includes(tag.toLowerCase())) return;
    updateSettings({ tags: [...tagOptions, tag] });
    setItemForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    setNewTagInput("");
  }

  // Status-based action buttons
  function itemActions(item) {
    const acts = [];
    if (item.status === ITEM_STATUS.AVAILABLE) {
      acts.push(<button key="co" onClick={(e)=>{e.stopPropagation();setCoForm({ person:userName, purpose:"", ministry:item.ministry||"", date:today, returnDate:"" });setActiveModal({ type:'checkout', item });}} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>Check Out</button>);
      acts.push(<button key="rep" onClick={(e)=>{e.stopPropagation();setActiveModal({ type:'repair', item });}} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>Send to Repair</button>);
    }
    if (item.status === ITEM_STATUS.CHECKED_OUT || item.status === ITEM_STATUS.IN_USE) {
      acts.push(<button key="ret" onClick={(e)=>{e.stopPropagation();setActiveModal({ type:'return', item });}} style={{ ...btnP, padding:"6px 14px", fontSize:12, background:B.gold }}>Return</button>);
    }
    if (item.status === ITEM_STATUS.UNDER_REPAIR) {
      acts.push(<button key="fixed" onClick={(e)=>{e.stopPropagation();handleRepaired(item);}} style={{ ...btnP, padding:"6px 14px", fontSize:12 }}>Mark Repaired</button>);
    }
    if (item.status !== ITEM_STATUS.DISPOSED && canManageItem(userProfile, item)) {
      acts.push(<button key="dup" aria-label="Duplicate item" onClick={(e)=>{e.stopPropagation();openDuplicate(item);}} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>⊕ Dup</button>);
      acts.push(<button key="edit" onClick={(e)=>{e.stopPropagation();openEdit(item);}} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>Edit</button>);
    }
    return acts;
  }

  // ── Item detail row ──
  function ItemRow({ item }) {
    const isMob = useContext(MobileCtx);
    const overdue = item.status === ITEM_STATUS.CHECKED_OUT && item.expectedReturn && item.expectedReturn < today;
    return (
      <div
        onClick={()=>{ if(bulkMode) toggleSelect(item._docId); else setActiveModal(showDetail?._docId === item._docId ? null : { type:'detail', item }); }}
        style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:isMob?"12px 14px":"14px 18px", borderRadius:12, cursor:"pointer",
          background: selectedIds.has(item._docId) ? B.tealPale : overdue ? B.redPale : B.white,
          border: selectedIds.has(item._docId) ? "1.5px solid "+B.teal : overdue ? "1px solid #FECACA" : "1px solid "+B.sand,
          borderLeft: overdue ? "4px solid "+B.red : undefined,
          transition:"all 0.15s", flexWrap:"wrap", gap:10
        }}
        onMouseEnter={e=>{ if(!overdue && !selectedIds.has(item._docId)) e.currentTarget.style.borderColor=B.teal; e.currentTarget.style.boxShadow="0 2px 8px rgba(42,125,110,0.08)"; }}
        onMouseLeave={e=>{ e.currentTarget.style.borderColor=selectedIds.has(item._docId)?B.teal:overdue?"#FECACA":B.sand; if(overdue) e.currentTarget.style.borderLeftColor=B.red; e.currentTarget.style.boxShadow="none"; }}
      >
        {bulkMode && (
          <input type="checkbox" aria-label={`Select ${item.description || 'item'}`} checked={selectedIds.has(item._docId)} onChange={()=>toggleSelect(item._docId)} onClick={e=>e.stopPropagation()} style={{ width:16, height:16, cursor:"pointer", flexShrink:0, accentColor:B.teal }} />
        )}
        <div style={{ display:"flex", alignItems:"center", gap:12, flex:1, minWidth:0 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:B.tealPale, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>📋</div>
          <div style={{ minWidth:0 }}>
            <div title={item.description || "Unnamed"} style={{ fontWeight:600, fontSize:14, color:B.navy, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.description || "Unnamed"}</div>
            <div style={{ fontSize:12, color:B.textLight, display:"flex", gap:8, flexWrap:"wrap", marginTop:2 }}>
              <span style={{ fontFamily:"monospace", letterSpacing:1 }}>{item.itemId}</span>
              {item.location && !isMob && <span>📍 {item.location}</span>}
              {item.assignedTo && <span>👤 {item.assignedTo}</span>}
              {overdue && <span style={{ color:B.red, fontWeight:700 }}>OVERDUE</span>}
            </div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", flexShrink:0 }}>
          <Badge status={item.status} />
          {/* On mobile, all actions are in the detail modal — tap the row to open */}
          {!isMob && itemActions(item)}
        </div>
      </div>
    );
  }

  // Status counts for filter bar
  const counts = {
    all: activeItems.length,
    [ITEM_STATUS.AVAILABLE]:    activeItems.filter(i=>i.status===ITEM_STATUS.AVAILABLE).length,
    [ITEM_STATUS.CHECKED_OUT]:  activeItems.filter(i=>i.status===ITEM_STATUS.CHECKED_OUT).length,
    [ITEM_STATUS.IN_USE]:       activeItems.filter(i=>i.status===ITEM_STATUS.IN_USE).length,
    [ITEM_STATUS.UNDER_REPAIR]: activeItems.filter(i=>i.status===ITEM_STATUS.UNDER_REPAIR).length,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:0 }}>All Items</h2>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {activeItems.length > 0 && !bulkMode && <button aria-label="Export inventory as CSV" onClick={()=>exportItemsCSV(activeItems)} style={{ ...btnS, fontSize:13, padding:"9px 18px" }}>⬇ Export CSV</button>}
          {activeItems.length > 0 && !bulkMode && <button onClick={()=>printInventory(activeItems, config?.churchName)} style={{ ...btnS, fontSize:13, padding:"9px 18px" }}>🖨 Print</button>}
          {activeItems.length > 0 && !bulkMode && <button aria-label="Select items for bulk actions" onClick={()=>{setBulkMode(true);setSelectedIds(new Set());}} style={{ ...btnS, fontSize:13, padding:"9px 18px" }}>☑ Select</button>}
          {!bulkMode && (isAdmin || isManager) && <button onClick={()=>{setItemForm(emptyItem);setPhotoFile(null);setPhotoPreview(null);setIdTouched(false);setActiveModal({ type:'add', item:null });}} style={btnP}>+ Add Item</button>}
        </div>
      </div>

      {/* Success message */}
      {msg && <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:msg.isError?'#FEE8E8':B.tealPale, border:`1px solid ${msg.isError?'#FECACA':B.teal}`, borderRadius:10, padding:"10px 16px", marginBottom:16, color:msg.isError?B.red:B.teal, fontWeight:600, fontSize:13, fontFamily:f1 }}><span>{msg.text}</span><button onClick={()=>setMsg(null)} style={{ border:'none', background:'none', cursor:'pointer', color:'inherit', fontSize:16, lineHeight:1, marginLeft:8, padding:'0 2px', fontWeight:700 }}>&times;</button></div>}

      {/* Public Requests Panel — admin only */}
      {isAdmin && publicRequests?.length > 0 && (
        <div style={{ background:B.goldLight, border:"1px solid "+B.gold, borderRadius:14, padding:"16px 20px", marginBottom:16 }}>
          <div style={{ fontFamily:f1, fontSize:15, fontWeight:700, color:B.navy, marginBottom:12 }}>
            📥 Item Requests ({publicRequests.length})
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {publicRequests.map(req => (
              <div key={req._docId} style={{ background:B.white, borderRadius:10, padding:"12px 16px", border:"1px solid "+B.gold, display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:14, color:B.navy }}>{req.itemDescription}</div>
                  <div style={{ fontSize:12, color:B.textMid, marginTop:4 }}>
                    From: <strong>{req.name}</strong>
                    {req.email && <> · {req.email}</>}
                    {req.phone && <> · {req.phone}</>}
                    {req.dateNeeded && <> · Needed by: {req.dateNeeded}</>}
                    {req.urgency && req.urgency !== 'Low' && (
                      <span style={{ marginLeft:6, padding:"1px 8px", borderRadius:20, background:req.urgency==='High'?B.redPale:B.goldLight, color:req.urgency==='High'?B.red:B.navy, fontWeight:600, fontSize:11 }}>{req.urgency}</span>
                    )}
                  </div>
                  {req.notes && <div style={{ fontSize:12, color:B.textLight, marginTop:4 }}>{req.notes}</div>}
                  {req.submittedAt && <div style={{ fontSize:11, color:B.textLight, marginTop:4 }}>{req.submittedAt.split("T")[0]}</div>}
                </div>
                <button onClick={async ()=>{
                  const ok = await confirm({
                    title: 'Dismiss request?',
                    message: <>Dismiss the request from <strong>{req.name}</strong>?</>,
                    confirmLabel: 'Dismiss',
                  });
                  if (!ok) return;
                  await dismissPublicRequest(req._docId);
                }} style={{ ...btnS, fontSize:12, padding:"5px 12px", flexShrink:0 }}>Dismiss</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div style={{ background:B.white, borderRadius:14, padding:"16px 20px", border:"1px solid "+B.sand, marginBottom:16, boxShadow:"0 1px 3px rgba(27,42,74,0.06)" }}>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
          <div style={{ flex:"1 1 220px", position:"relative" }}>
            <input
              ref={searchRef}
              style={{...inp, paddingLeft:36}}
              placeholder="Search by name or ID..."
              value={search} onChange={e=>setSearch(e.target.value)}
            />
            <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", fontSize:14, color:B.textLight }}>🔍</span>
          </div>
          <select value={statusFilter} onChange={e=>setStatus(e.target.value)} style={{...inp, width:"auto", flex:"0 1 180px"}}>
            <option value="all">All Statuses ({counts.all})</option>
            <option value={ITEM_STATUS.AVAILABLE}>Available ({counts[ITEM_STATUS.AVAILABLE]})</option>
            <option value={ITEM_STATUS.CHECKED_OUT}>Checked Out ({counts[ITEM_STATUS.CHECKED_OUT]})</option>
            <option value={ITEM_STATUS.UNDER_REPAIR}>Under Repair ({counts[ITEM_STATUS.UNDER_REPAIR]})</option>
          </select>
          {locations.length > 0 && (
            <select value={locationFilter} onChange={e=>setLocation(e.target.value)} style={{...inp, width:"auto", flex:"0 1 180px"}}>
              <option value="all">All Locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          {ministries.length > 0 && (
            <select value={ministryFilter} onChange={e=>setMinistry(e.target.value)} style={{...inp, width:"auto", flex:"0 1 180px"}}>
              <option value="all">All Ministries</option>
              {ministries.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkMode && (
        <div style={{ background:B.navy, borderRadius:12, padding:"12px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
            <input
              type="checkbox"
              aria-label="Select all visible items"
              checked={displayItems.length > 0 && displayItems.every(i => selectedIds.has(i._docId))}
              onChange={e => setSelectedIds(e.target.checked ? new Set(displayItems.map(i => i._docId)) : new Set())}
              style={{ width:15, height:15, accentColor:B.teal, cursor:"pointer" }}
            />
            <span style={{ color:"rgba(255,255,255,0.75)", fontFamily:f1, fontSize:12 }}>All</span>
          </label>
          <span style={{ color:"#fff", fontFamily:f1, fontWeight:600, fontSize:13, flex:1 }}>
            {selectedIds.size > 0 ? `${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""} selected` : "Select items below"}
          </span>
          {selectedIds.size > 0 && <>
            <button onClick={startBulkCheckout} style={{ ...btnS, fontSize:12, padding:"6px 12px" }}>Check Out</button>
            <button onClick={startBulkReturn} style={{ ...btnS, fontSize:12, padding:"6px 12px" }}>↩ Return</button>
            {locations.length > 0 && (isAdmin || isManager) && <button onClick={()=>{setBulkData(d=>({...d,newLoc:''}));setBulkModal('loc');}} style={{ ...btnS, fontSize:12, padding:"6px 12px" }}>📍 Location</button>}
            <button aria-label="Export selected items as CSV" onClick={handleBulkExport} style={{ ...btnS, fontSize:12, padding:"6px 12px" }}>⬇ Export</button>
          </>}
          <button onClick={exitBulkMode} style={{ background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:12, padding:"6px 12px", fontFamily:f1, fontWeight:600 }}>Cancel</button>
        </div>
      )}

      {/* Item List */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {displayItems.length === 0 ? (
          <div style={{ background:B.white, borderRadius:18, padding:"48px 32px", border:"1px solid "+B.sand, textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📋</div>
            <h3 style={{ fontFamily:f1, color:B.navy, margin:"0 0 8px", fontSize:18 }}>
              {activeItems.length === 0 ? "No items yet" : search ? "No items match your search" : "No items match your filters"}
            </h3>
            <p style={{ color:B.textLight, fontSize:14 }}>
              {activeItems.length === 0 ? ((isAdmin || isManager) ? "Add your first inventory item to get started." : "No items yet. Ask an admin or manager to add inventory.") : search ? "Try a different search term or clear the search." : "Try adjusting your filters."}
            </p>
          </div>
        ) : displayItems.map(item => <ItemRow key={item._docId} item={item} />)}
      </div>

      {/* Disposed toggle */}
      {disposedItems.length > 0 && (
        <div style={{ marginTop:20, textAlign:"center" }}>
          <button onClick={()=>setShowDisposed(!showDisposed)} style={{ ...btnS, fontSize:13, color:B.textLight }}>
            {showDisposed ? "← Back to active items" : `Show retired items (${disposedItems.length})`}
          </button>
        </div>
      )}

      {/* Detail Expand */}
      {showDetail && (
        <Modal open={true} onClose={()=>setActiveModal(null)} title={showDetail.description || "Item Details"}>
          {/* Photo */}
          {showDetail.photoUrl && (
            <div style={{ marginBottom:16, textAlign:"center" }}>
              <img src={showDetail.photoUrl} alt={showDetail.description} style={{ maxWidth:"100%", maxHeight:220, borderRadius:10, border:"1px solid "+B.sand, objectFit:"contain" }} />
            </div>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Item ID</span><div style={{ fontFamily:"monospace", fontSize:14, marginTop:2 }}>{showDetail.itemId}</div></div>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Status</span><div style={{ marginTop:4 }}><Badge status={showDetail.status}/></div></div>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Location</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.location || "—"}</div></div>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Ministry</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.ministry || "—"}</div></div>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Condition</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.condition || "—"}</div></div>
            <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Assigned To</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.assignedTo || "—"}</div></div>
            {showDetail.checkOutDate && <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Checked Out</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.checkOutDate}</div></div>}
            {showDetail.expectedReturn && <div><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Expected Return</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.expectedReturn}</div></div>}
            {showDetail.repairIssue && <div style={{ gridColumn:"1/-1" }}><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Repair Issue</span><div style={{ fontSize:14, marginTop:2 }}>{showDetail.repairIssue}</div></div>}
          </div>
          {showDetail.tags?.length > 0 && (
            <div style={{ marginTop:14 }}>
              <span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Tags</span>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
                {showDetail.tags.map(t => <span key={t} style={{ padding:"3px 10px", borderRadius:20, background:B.warmGray, fontSize:12, color:B.textMid, fontFamily:f1, fontWeight:500 }}>{t}</span>)}
              </div>
            </div>
          )}
          {showDetail.notes && <div style={{ marginTop:14 }}><span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1 }}>Notes</span><div style={{ fontSize:14, marginTop:2, color:B.textMid }}>{showDetail.notes}</div></div>}

          {/* Financial fields */}
          {(showDetail.purchaseDate || showDetail.purchasePrice != null || showDetail.warrantyExpiry) && (
            <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid "+B.sand }}>
              <span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", fontFamily:f1, display:"block", marginBottom:8 }}>Financial &amp; Warranty</span>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, fontSize:13 }}>
                {showDetail.purchaseDate && <div><span style={{ color:B.textLight }}>Purchased:</span> {showDetail.purchaseDate}</div>}
                {showDetail.purchasePrice != null && <div><span style={{ color:B.textLight }}>Orig. Cost:</span> ${Number(showDetail.purchasePrice).toLocaleString()}</div>}
                {showDetail.warrantyExpiry && (
                  <div style={{ color: new Date(showDetail.warrantyExpiry) < new Date() ? B.red : B.teal, fontWeight:600 }}>
                    Warranty {new Date(showDetail.warrantyExpiry) < new Date() ? "EXPIRED" : "expires"}: {showDetail.warrantyExpiry}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* QR Code */}
          {(() => {
            const itemUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '') + '?item=' + encodeURIComponent(showDetail.itemId);
            return (
              <div style={{ marginTop:18, paddingTop:16, borderTop:"1px solid "+B.sand }}>
                <div style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:10 }}>QR Code — Scan to open this item</div>
                <div style={{ display:"flex", alignItems:"flex-start", gap:16, flexWrap:"wrap" }}>
                  {detailQrUrl && <img src={detailQrUrl} alt={`QR for ${showDetail.itemId}`} style={{ width:110, height:110, borderRadius:8, border:"1px solid "+B.sand, flexShrink:0 }} />}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, color:B.textMid, marginBottom:8, wordBreak:"break-all", lineHeight:1.5 }}>{itemUrl}</div>
                    {detailQrUrl && (
                      <a
                        href={detailQrUrl}
                        download={`qr-${showDetail.itemId}.png`}
                        style={{ ...btnS, fontSize:11, padding:"5px 12px", textDecoration:"none", display:"inline-block", color:B.textDark }}>
                        ↓ Download QR
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Item History */}
          {(() => {
            const history = activityLog.filter(l => l.itemId === showDetail.itemId);
            if (!history.length) return null;
            const icons = { check_out:"📤", return:"↩️", add_item:"➕", dispose:"🗑️", mark_repair:"🔧", mark_repaired:"✅" };
            const labels = { check_out:"Checked Out", return:"Returned", add_item:"Added", dispose:"Retired", mark_repair:"Sent to Repair", mark_repaired:"Repair Complete" };
            return (
              <div style={{ marginTop:18, paddingTop:16, borderTop:"1px solid "+B.sand }}>
                <div style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:"uppercase", letterSpacing:.8, fontFamily:f1, marginBottom:8 }}>History ({history.length})</div>
                <div style={{ maxHeight:200, overflowY:"auto", borderRadius:8, border:"1px solid "+B.sand }}>
                  {history.slice(0, 50).map((l, i) => (
                    <div key={l._docId} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderBottom:i<history.length-1?"1px solid "+B.sand:"none", background:i%2===0?B.white:B.warmGray }}>
                      <span style={{ fontSize:14, flexShrink:0 }}>{icons[l.action]||"📋"}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <span style={{ fontSize:12, fontWeight:600, color:B.textDark }}>{labels[l.action]||l.action.replace(/_/g," ")}</span>
                        {l.details?.person && <span style={{ fontSize:12, color:B.textMid }}> · {l.details.person}</span>}
                        {l.details?.condition && <span style={{ fontSize:12, color:B.textMid }}> · {l.details.condition}</span>}
                        <span style={{ fontSize:11, color:B.textLight }}> · {l.performedByName}</span>
                      </div>
                      <span style={{ fontSize:11, color:B.textLight, flexShrink:0 }}>{l.timestamp?.split("T")[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div style={{ display:"flex", gap:8, marginTop:20, flexWrap:"wrap" }}>
            {itemActions(showDetail)}
            <button onClick={()=>printLabel(showDetail, config?.churchName)} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>🖨 Print Label</button>
            {canManageItem(userProfile, showDetail) && showDetail.status !== ITEM_STATUS.DISPOSED && (
              <button aria-label="Duplicate item" onClick={()=>openDuplicate(showDetail)} style={{ ...btnS, padding:"6px 14px", fontSize:12 }}>⊕ Duplicate</button>
            )}
            {canManageItem(userProfile, showDetail) && showDetail.status !== ITEM_STATUS.DISPOSED && (
              <button onClick={()=>{setRetireForm({ reason:"Broken", date:today, notes:"", recoveryValue:"" });setActiveModal({ type:'retire', item:showDetail });}} style={{ ...btnD, padding:"6px 14px", fontSize:12 }}>Retire</button>
            )}
            {isAdmin && (
              <button onClick={()=>handleDeleteItem(showDetail)} style={{ ...btnD, padding:"6px 14px", fontSize:12, background:"#7f1d1d", borderColor:"#7f1d1d" }}>Delete</button>
            )}
          </div>
          {isAdmin && showDetail?.status !== ITEM_STATUS.DISPOSED && (
            <div style={{ marginTop:8 }}>
              <button type="button" onClick={()=>{ setMoveSupplyForm({ supplyId:"", quantity:"0", minQuantity:"5", unit:"each" }); setShowMoveToSupply(showDetail); setActiveModal(null); }} style={{ background:"none", border:"none", color:B.textLight, fontSize:12, cursor:"pointer", fontFamily:f1 }}>
                Move to Supplies →
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* ═══ MOVE TO SUPPLIES MODAL ═══ */}
      {showMoveToSupply && (
        <Modal open={!!showMoveToSupply} onClose={()=>setShowMoveToSupply(null)} title={`Move to Supplies: ${showMoveToSupply?.description||""}`}>
          <p style={{ fontSize:13, color:B.textMid, marginBottom:16 }}>
            Description, location, ministry, and tags will carry over. The inventory record will be permanently deleted.
          </p>
          <FF label="Supply ID" required>
            <input style={inp} value={moveSupplyForm.supplyId} onChange={e=>setMoveSupplyForm({...moveSupplyForm, supplyId:e.target.value})} placeholder="e.g. BATT-AA (min 3 chars)" autoFocus/>
          </FF>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            <FF label="Starting Qty"><input style={inp} type="number" min="0" value={moveSupplyForm.quantity} onChange={e=>setMoveSupplyForm({...moveSupplyForm, quantity:e.target.value})}/></FF>
            <FF label="Min Qty (alert)"><input style={inp} type="number" min="0" value={moveSupplyForm.minQuantity} onChange={e=>setMoveSupplyForm({...moveSupplyForm, minQuantity:e.target.value})}/></FF>
            <FF label="Unit"><select style={inp} value={moveSupplyForm.unit} onChange={e=>setMoveSupplyForm({...moveSupplyForm, unit:e.target.value})}>
              <option value="each">Each</option><option value="pack">Pack</option><option value="box">Box</option><option value="roll">Roll</option><option value="ream">Ream</option><option value="case">Case</option><option value="gallon">Gallon</option><option value="bottle">Bottle</option>
            </select></FF>
          </div>
          <button onClick={handleMoveToSupply} disabled={saving||moveSupplyForm.supplyId.trim().length < 3} style={{ ...btnP, width:"100%", opacity:(saving||moveSupplyForm.supplyId.trim().length < 3)?.5:1, marginTop:4 }}>
            {saving ? "Moving…" : "Move to Supplies"}
          </button>
        </Modal>
      )}

      {/* ═══ ADD ITEM MODAL ═══ */}
      <Modal open={showAdd} onClose={()=>setActiveModal(null)} title="Add New Item">
        <FF label="Description"><input style={inp} value={itemForm.description} onChange={e=>{const d=e.target.value;setItemForm(f=>{const u={...f,description:d};if(!idTouched)u.itemId=generateId(d,items.map(i=>i.itemId));return u;});}} placeholder="e.g. Wireless Microphone A" autoFocus/></FF>
        <FF label="Item ID"><input style={{...inp, fontFamily:"monospace", letterSpacing:1}} value={itemForm.itemId} onChange={e=>{setIdTouched(true);setItemForm({...itemForm,itemId:e.target.value.toUpperCase()});}} placeholder="Auto-filled from description"/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Location"><select style={inp} value={itemForm.location} onChange={e=>setItemForm({...itemForm, location:e.target.value})}>
            <option value="">— Select —</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select></FF>
          <FF label="Ministry"><select style={inp} value={itemForm.ministry} onChange={e=>setItemForm({...itemForm, ministry:e.target.value})}>
            <option value="">— Select —</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF>
        </div>
        <FF label="Condition"><select style={inp} value={itemForm.condition} onChange={e=>setItemForm({...itemForm, condition:e.target.value})}>
          <option value="New">New</option><option value="Good">Good</option><option value="Fair">Fair</option><option value="Poor">Poor</option>
        </select></FF>
        <FF label="Tags">
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: tagOptions.length > 0 ? 8 : 0 }}>
            {tagOptions.map(t => (
              <button key={t} type="button" onClick={()=>toggleTag(t)}
                style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontFamily:f1, fontWeight:500, cursor:"pointer",
                  border: itemForm.tags.includes(t) ? "1px solid "+B.teal : "1px solid "+B.sand,
                  background: itemForm.tags.includes(t) ? B.tealPale : B.white,
                  color: itemForm.tags.includes(t) ? B.teal : B.textMid
                }}>{t}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <input style={{ ...inp, flex:1, fontSize:12, padding:"5px 10px" }} placeholder="New tag…" value={newTagInput} onChange={e=>setNewTagInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){e.preventDefault();addNewItemTag();}}} />
            <button type="button" onClick={addNewItemTag} style={{ ...btnS, padding:"5px 12px", fontSize:12, whiteSpace:"nowrap" }}>+ Add</button>
          </div>
        </FF>
        <FF label="Notes"><textarea style={{...inp, minHeight:60, resize:"vertical"}} value={itemForm.notes} onChange={e=>setItemForm({...itemForm, notes:e.target.value})} placeholder="Optional notes..."/></FF>
        <div style={{ marginBottom:12 }}>
          <button type="button" onClick={()=>setShowFinancial(v=>!v)} style={{ background:"none", border:"none", cursor:"pointer", color:B.teal, fontWeight:600, fontSize:13, fontFamily:f1, padding:0, display:"flex", alignItems:"center", gap:4 }}>
            <span>{showFinancial ? "▾" : "▸"}</span> Financial &amp; Warranty (optional)
          </button>
          {showFinancial && (
            <div style={{ marginTop:10, padding:"14px 16px", background:B.warmGray, borderRadius:10 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <FF label="Purchase Date"><input style={inp} type="date" value={itemForm.purchaseDate} onChange={e=>setItemForm({...itemForm, purchaseDate:e.target.value})}/></FF>
                <FF label="Purchase Price ($)"><input style={inp} type="number" min="0" step="0.01" value={itemForm.purchasePrice} onChange={e=>setItemForm({...itemForm, purchasePrice:e.target.value})} placeholder="0.00"/></FF>
                <FF label="Warranty Expiry"><input style={inp} type="date" value={itemForm.warrantyExpiry} onChange={e=>setItemForm({...itemForm, warrantyExpiry:e.target.value})}/></FF>
                <FF label="Current Value Override ($)"><input style={inp} type="number" min="0" step="0.01" value={itemForm.estimatedValue} onChange={e=>setItemForm({...itemForm, estimatedValue:e.target.value})} placeholder="Auto-calculated"/></FF>
              </div>
              <p style={{ margin:"8px 0 0", fontSize:11, color:B.textLight }}>Current value is auto-estimated from purchase price (straight-line, 5-yr). Enter an override to use a specific value.</p>
            </div>
          )}
        </div>
        <FF label="Photo (optional)">
          {photoPreview && (
            <div style={{ marginBottom:8, position:"relative", display:"inline-block" }}>
              <img src={photoPreview} alt="Preview" style={{ width:120, height:80, objectFit:"cover", borderRadius:8, border:"1px solid "+B.sand, display:"block" }} />
              <button type="button" onClick={()=>{setPhotoFile(null);setPhotoPreview(null);}} style={{ position:"absolute", top:-6, right:-6, width:20, height:20, borderRadius:"50%", background:B.red, color:"#fff", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
          )}
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <input type="file" accept="image/*" id="photo-add" style={{ display:"none" }} onChange={e=>{const f=e.target.files[0];if(f){setPhotoFile(f);setPhotoPreview(URL.createObjectURL(f));setIdentifying(false);}}}/>
            <label htmlFor="photo-add" style={{ ...btnS, display:"inline-block", cursor:"pointer", padding:"7px 16px", fontSize:13 }}>{photoPreview?"📷 Change Photo":"📷 Add Photo"}</label>
            {photoFile && (
              <button type="button" onClick={handleIdentify} disabled={identifying} style={{ ...btnS, fontSize:13, padding:"7px 16px", opacity:identifying?.6:1 }}>
                {identifying ? "Identifying…" : "✨ Identify Item"}
              </button>
            )}
          </div>
        </FF>
        <button onClick={handleAdd} disabled={saving||itemForm.itemId.trim().length<3||!itemForm.description.trim()} style={{ ...btnP, width:"100%", opacity:(saving||itemForm.itemId.trim().length<3||!itemForm.description.trim())?.5:1, marginTop:4 }}>
          {saving ? "Saving..." : "Add Item"}
        </button>
      </Modal>

      {/* ═══ EDIT ITEM MODAL ═══ */}
      <Modal open={!!showEdit} onClose={()=>setActiveModal(null)} title="Edit Item">
        <FF label="Item ID"><input style={{...inp, fontFamily:"monospace", letterSpacing:1}} value={itemForm.itemId} onChange={e=>setItemForm({...itemForm, itemId:e.target.value.toUpperCase()})} placeholder="e.g. MIC-001"/></FF>
        <FF label="Description"><input style={inp} value={itemForm.description} onChange={e=>setItemForm({...itemForm, description:e.target.value})} placeholder="Description"/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Location"><select style={inp} value={itemForm.location} onChange={e=>setItemForm({...itemForm, location:e.target.value})}>
            <option value="">— Select —</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select></FF>
          <FF label="Ministry"><select style={inp} value={itemForm.ministry} onChange={e=>setItemForm({...itemForm, ministry:e.target.value})}>
            <option value="">— Select —</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF>
        </div>
        <FF label="Condition"><select style={inp} value={itemForm.condition} onChange={e=>setItemForm({...itemForm, condition:e.target.value})}>
          <option value="New">New</option><option value="Good">Good</option><option value="Fair">Fair</option><option value="Poor">Poor</option>
        </select></FF>
        <FF label="Tags">
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom: tagOptions.length > 0 ? 8 : 0 }}>
            {tagOptions.map(t => (
              <button key={t} type="button" onClick={()=>toggleTag(t)}
                style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontFamily:f1, fontWeight:500, cursor:"pointer",
                  border: itemForm.tags.includes(t) ? "1px solid "+B.teal : "1px solid "+B.sand,
                  background: itemForm.tags.includes(t) ? B.tealPale : B.white,
                  color: itemForm.tags.includes(t) ? B.teal : B.textMid
                }}>{t}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <input style={{ ...inp, flex:1, fontSize:12, padding:"5px 10px" }} placeholder="New tag…" value={newTagInput} onChange={e=>setNewTagInput(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){e.preventDefault();addNewItemTag();}}} />
            <button type="button" onClick={addNewItemTag} style={{ ...btnS, padding:"5px 12px", fontSize:12, whiteSpace:"nowrap" }}>+ Add</button>
          </div>
        </FF>
        <FF label="Notes"><textarea style={{...inp, minHeight:60, resize:"vertical"}} value={itemForm.notes} onChange={e=>setItemForm({...itemForm, notes:e.target.value})} placeholder="Optional notes..."/></FF>
        <div style={{ marginBottom:12 }}>
          <button type="button" onClick={()=>setShowFinancial(v=>!v)} style={{ background:"none", border:"none", cursor:"pointer", color:B.teal, fontWeight:600, fontSize:13, fontFamily:f1, padding:0, display:"flex", alignItems:"center", gap:4 }}>
            <span>{showFinancial ? "▾" : "▸"}</span> Financial &amp; Warranty (optional)
          </button>
          {showFinancial && (
            <div style={{ marginTop:10, padding:"14px 16px", background:B.warmGray, borderRadius:10 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <FF label="Purchase Date"><input style={inp} type="date" value={itemForm.purchaseDate} onChange={e=>setItemForm({...itemForm, purchaseDate:e.target.value})}/></FF>
                <FF label="Purchase Price ($)"><input style={inp} type="number" min="0" step="0.01" value={itemForm.purchasePrice} onChange={e=>setItemForm({...itemForm, purchasePrice:e.target.value})} placeholder="0.00"/></FF>
                <FF label="Warranty Expiry"><input style={inp} type="date" value={itemForm.warrantyExpiry} onChange={e=>setItemForm({...itemForm, warrantyExpiry:e.target.value})}/></FF>
                <FF label="Current Value Override ($)"><input style={inp} type="number" min="0" step="0.01" value={itemForm.estimatedValue} onChange={e=>setItemForm({...itemForm, estimatedValue:e.target.value})} placeholder="Auto-calculated"/></FF>
              </div>
              <p style={{ margin:"8px 0 0", fontSize:11, color:B.textLight }}>Current value is auto-estimated from purchase price (straight-line, 5-yr). Enter an override to use a specific value.</p>
            </div>
          )}
        </div>
        <FF label="Photo (optional)">
          {photoPreview && (
            <div style={{ marginBottom:8, position:"relative", display:"inline-block" }}>
              <img src={photoPreview} alt="Preview" style={{ width:120, height:80, objectFit:"cover", borderRadius:8, border:"1px solid "+B.sand, display:"block" }} />
              <button type="button" onClick={()=>{setPhotoFile(null);setPhotoPreview(null);}} style={{ position:"absolute", top:-6, right:-6, width:20, height:20, borderRadius:"50%", background:B.red, color:"#fff", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
          )}
          <div><input type="file" accept="image/*" id="photo-edit" style={{ display:"none" }} onChange={e=>{const f=e.target.files[0];if(f){setPhotoFile(f);setPhotoPreview(URL.createObjectURL(f));}}}/><label htmlFor="photo-edit" style={{ ...btnS, display:"inline-block", cursor:"pointer", padding:"7px 16px", fontSize:13 }}>{photoPreview?"📷 Change Photo":"📷 Add Photo"}</label></div>
        </FF>
        <button onClick={handleEdit} disabled={saving} style={{ ...btnP, width:"100%", opacity:saving?.5:1, marginTop:4 }}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </Modal>

      {/* ═══ CHECK OUT MODAL ═══ */}
      <Modal open={!!showCheckOut} onClose={()=>setActiveModal(null)} title={`Check Out: ${showCheckOut?.description||""}`}>
        <FF label="Who's taking it?"><input style={inp} value={coForm.person} onChange={e=>setCoForm({...coForm, person:e.target.value})} placeholder="Person's name"/></FF>
        <FF label="Purpose"><input style={inp} value={coForm.purpose} onChange={e=>setCoForm({...coForm, purpose:e.target.value})} placeholder="e.g. Sunday worship, youth retreat"/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Ministry"><select style={inp} value={coForm.ministry} onChange={e=>setCoForm({...coForm, ministry:e.target.value})}>
            <option value="">— Select —</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF>
          <FF label="Check-out Date"><input style={inp} type="date" value={coForm.date} onChange={e=>setCoForm({...coForm, date:e.target.value})}/></FF>
        </div>
        <FF label="Expected Return"><input style={inp} type="date" value={coForm.returnDate} onChange={e=>setCoForm({...coForm, returnDate:e.target.value})}/></FF>
        <button onClick={handleCheckOut} disabled={saving||!coForm.person.trim()} style={{ ...btnP, width:"100%", opacity:(saving||!coForm.person.trim())?.5:1, marginTop:4 }}>
          {saving ? "Processing..." : "Check Out Item"}
        </button>
      </Modal>

      {/* ═══ RETURN MODAL ═══ */}
      <Modal open={!!showReturn} onClose={()=>setActiveModal(null)} title={`Return: ${showReturn?.description||""}`}>
        <div style={{ background:B.warmGray, borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:B.textMid }}>
          Checked out to <strong>{showReturn?.assignedTo}</strong> {showReturn?.checkOutDate && `on ${showReturn.checkOutDate}`}
        </div>
        <FF label="Condition on Return"><select style={inp} value={retForm.condition} onChange={e=>setRetForm({...retForm, condition:e.target.value})}>
          <option value="Good">Good — No issues</option>
          <option value="Fair">Fair — Minor wear</option>
          <option value="Poor">Poor — Needs attention</option>
          <option value="Damaged">Damaged — Needs repair</option>
        </select></FF>
        <button onClick={handleReturn} disabled={saving} style={{ ...btnP, width:"100%", opacity:saving?.5:1, marginTop:4 }}>
          {saving ? "Processing..." : "Return Item"}
        </button>
      </Modal>

      {/* ═══ REPAIR MODAL ═══ */}
      <Modal open={!!showRepair} onClose={()=>setActiveModal(null)} title={`Send to Repair: ${showRepair?.description||""}`}>
        <FF label="What's the issue?"><textarea style={{...inp, minHeight:60, resize:"vertical"}} value={repairForm.issue} onChange={e=>setRepairForm({...repairForm, issue:e.target.value})} placeholder="Describe the problem..."/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Handler / Vendor"><input style={inp} value={repairForm.handler} onChange={e=>setRepairForm({...repairForm, handler:e.target.value})} placeholder="Who's fixing it?"/></FF>
          <FF label="Expected Repair Date"><input style={inp} type="date" value={repairForm.expectedDate} onChange={e=>setRepairForm({...repairForm, expectedDate:e.target.value})}/></FF>
        </div>
        <button onClick={handleRepair} disabled={saving||!repairForm.issue.trim()} style={{ ...btnP, width:"100%", opacity:(saving||!repairForm.issue.trim())?.5:1, marginTop:4 }}>
          {saving ? "Processing..." : "Send to Repair"}
        </button>
      </Modal>

      {/* ═══ RETIRE MODAL ═══ */}
      <Modal open={!!showRetire} onClose={()=>setActiveModal(null)} title={`Retire: ${showRetire?.description||""}`}>
        <div style={{ background:B.redPale, borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:B.red, fontWeight:500 }}>
          This item will be moved to the retired list and removed from active inventory.
        </div>
        <FF label="Reason"><select style={inp} value={retireForm.reason} onChange={e=>setRetireForm({...retireForm, reason:e.target.value})}>
          <option value="Broken">Broken beyond repair</option>
          <option value="Obsolete">Obsolete / Replaced</option>
          <option value="Lost">Lost or Missing</option>
          <option value="Donated">Donated</option>
          <option value="Sold">Sold</option>
          <option value="Other">Other</option>
        </select></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Retirement Date"><input style={inp} type="date" value={retireForm.date} onChange={e=>setRetireForm({...retireForm, date:e.target.value})}/></FF>
          <FF label="Recovery Value ($)"><input style={inp} type="number" value={retireForm.recoveryValue} onChange={e=>setRetireForm({...retireForm, recoveryValue:e.target.value})} placeholder="0.00"/></FF>
        </div>
        <FF label="Notes"><textarea style={{...inp, minHeight:60, resize:"vertical"}} value={retireForm.notes} onChange={e=>setRetireForm({...retireForm, notes:e.target.value})} placeholder="Optional details..."/></FF>
        <button onClick={handleRetire} disabled={saving} style={{ ...btnD, width:"100%", opacity:saving?.5:1, marginTop:4 }}>
          {saving ? "Processing..." : "Retire Item"}
        </button>
      </Modal>

      {/* ═══ BULK CHECKOUT WARNING ═══ */}
      <Modal open={bulkModal === 'coWarn'} onClose={()=>setBulkModal(null)} title="Some items will be skipped">
        <div style={{ background:B.goldLight, borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:"#96750E", fontWeight:500 }}>
          {bulkSkipped} item{bulkSkipped !== 1 ? "s" : ""} cannot be checked out (not Available) and will be skipped. Continue with {bulkCoItems.length} item{bulkCoItems.length !== 1 ? "s" : ""}?
        </div>
        {bulkCoItems.length === 0
          ? <p style={{ color:B.textLight, fontSize:13, textAlign:"center" }}>No Available items in your selection.</p>
          : <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <button onClick={()=>setBulkModal('co')} style={{ ...btnP, flex:1 }}>Continue ({bulkCoItems.length})</button>
              <button onClick={()=>setBulkModal(null)} style={{ ...btnS, flex:1 }}>Cancel</button>
            </div>
        }
      </Modal>

      {/* ═══ BULK CHECKOUT FORM ═══ */}
      <Modal open={bulkModal === 'co'} onClose={()=>setBulkModal(null)} title={`Check Out ${bulkCoItems.length} Item${bulkCoItems.length !== 1 ? "s" : ""}`}>
        <div style={{ background:B.tealPale, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:12, color:B.teal, fontFamily:f1 }}>
          These details apply to all selected items.
        </div>
        <FF label="Who's taking them?"><input style={inp} value={coForm.person} onChange={e=>setCoForm({...coForm, person:e.target.value})} placeholder="Person's name"/></FF>
        <FF label="Purpose"><input style={inp} value={coForm.purpose} onChange={e=>setCoForm({...coForm, purpose:e.target.value})} placeholder="e.g. Sunday worship"/></FF>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <FF label="Ministry"><select style={inp} value={coForm.ministry} onChange={e=>setCoForm({...coForm, ministry:e.target.value})}>
            <option value="">— Select —</option>
            {ministries.map(m => <option key={m} value={m}>{m}</option>)}
          </select></FF>
          <FF label="Check-out Date"><input style={inp} type="date" value={coForm.date} onChange={e=>setCoForm({...coForm, date:e.target.value})}/></FF>
        </div>
        <FF label="Expected Return"><input style={inp} type="date" value={coForm.returnDate} onChange={e=>setCoForm({...coForm, returnDate:e.target.value})}/></FF>
        <button onClick={handleBulkCheckout} disabled={saving||!coForm.person.trim()} style={{ ...btnP, width:"100%", opacity:(saving||!coForm.person.trim())?.5:1, marginTop:4 }}>
          {saving ? "Processing..." : `Check Out ${bulkCoItems.length} Item${bulkCoItems.length !== 1 ? "s" : ""}`}
        </button>
      </Modal>

      {/* ═══ BULK RETURN WARNING ═══ */}
      <Modal open={bulkModal === 'retWarn'} onClose={()=>setBulkModal(null)} title="Some items will be skipped">
        <div style={{ background:B.goldLight, borderRadius:10, padding:"12px 16px", marginBottom:16, fontSize:13, color:"#96750E", fontWeight:500 }}>
          {bulkSkipped} item{bulkSkipped !== 1 ? "s" : ""} cannot be returned (not Checked Out or In Use) and will be skipped. Continue with {bulkRetItems.length} item{bulkRetItems.length !== 1 ? "s" : ""}?
        </div>
        {bulkRetItems.length === 0
          ? <p style={{ color:B.textLight, fontSize:13, textAlign:"center" }}>No returnable items in your selection.</p>
          : <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <button onClick={()=>setBulkModal('ret')} style={{ ...btnP, flex:1 }}>Continue ({bulkRetItems.length})</button>
              <button onClick={()=>setBulkModal(null)} style={{ ...btnS, flex:1 }}>Cancel</button>
            </div>
        }
      </Modal>

      {/* ═══ BULK RETURN FORM ═══ */}
      <Modal open={bulkModal === 'ret'} onClose={()=>setBulkModal(null)} title={`Return ${bulkRetItems.length} Item${bulkRetItems.length !== 1 ? "s" : ""}`}>
        <div style={{ background:B.tealPale, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:12, color:B.teal, fontFamily:f1 }}>
          This condition applies to all items being returned.
        </div>
        <FF label="Condition on Return"><select style={inp} value={bulkRetCondition} onChange={e=>setBulkData(d=>({...d,retCondition:e.target.value}))}>
          <option value="Good">Good — No issues</option>
          <option value="Fair">Fair — Minor wear</option>
          <option value="Poor">Poor — Needs attention</option>
          <option value="Damaged">Damaged — Needs repair</option>
        </select></FF>
        <button onClick={handleBulkReturn} disabled={saving} style={{ ...btnP, width:"100%", opacity:saving?.5:1, marginTop:4 }}>
          {saving ? "Processing..." : `Return ${bulkRetItems.length} Item${bulkRetItems.length !== 1 ? "s" : ""}`}
        </button>
      </Modal>

      {/* ═══ BULK LOCATION MODAL ═══ */}
      <Modal open={bulkModal === 'loc'} onClose={()=>setBulkModal(null)} title={`Change Location (${selectedIds.size} item${selectedIds.size !== 1 ? "s" : ""})`}>
        <FF label="Move to Location"><select style={inp} value={bulkNewLoc} onChange={e=>setBulkData(d=>({...d,newLoc:e.target.value}))}>
          <option value="">— Select location —</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select></FF>
        <button onClick={handleBulkLocation} disabled={saving||!bulkNewLoc} style={{ ...btnP, width:"100%", opacity:(saving||!bulkNewLoc)?.5:1, marginTop:4 }}>
          {saving ? "Moving..." : `Move ${selectedIds.size} Item${selectedIds.size !== 1 ? "s" : ""}`}
        </button>
      </Modal>

      <ConfirmHost />
      {undo && <UndoToast {...undo} onDismiss={() => setUndo(null)} />}
    </div>
  );
}
