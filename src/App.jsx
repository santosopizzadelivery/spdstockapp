import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  Home, Package, Receipt, History, Plus, Minus, X, Pencil, Trash2,
  AlertTriangle, Flame, TrendingUp, Save, Check, Calendar, Loader2, LogOut, Lock
} from 'lucide-react';
import { auth } from './firebase';
import { loadKey, saveKey } from './store';

const COLORS = {
  bg: '#1C1410',
  surface: '#251C15',
  surfaceLight: '#2F251C',
  border: '#3D3025',
  primary: '#C1391F',
  primaryLight: '#E0532F',
  secondary: '#7A9A57',
  warning: '#D9A441',
  text: '#F2E9DC',
  textMuted: '#A8998A',
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const rupiah = (n) => `Rp${Math.round(n || 0).toLocaleString('id-ID')}`;
const fmtDate = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const TABS = [
  { id: 'ringkasan', label: 'Ringkasan', icon: Home },
  { id: 'stok', label: 'Stok', icon: Package },
  { id: 'penjualan', label: 'Penjualan', icon: Receipt },
  { id: 'riwayat', label: 'Riwayat', icon: History },
];

const CATEGORIES = ['Pizza', 'Minuman', 'Pelengkap', 'Lainnya'];

/* ---------------- ROOT: AUTH GATE ---------------- */
export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: COLORS.primary }} />
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  return <MainApp uid={user.uid} email={user.email} />;
}

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError('Email atau password salah.');
    }
    setBusy(false);
  };

  return (
    <div className="h-screen flex items-center justify-center px-6 font-sans" style={{ background: COLORS.bg, color: COLORS.text }}>
      <form onSubmit={submit} className="w-full max-w-xs space-y-4">
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: COLORS.primary }}>
            <Flame className="w-6 h-6" style={{ color: COLORS.text }} />
          </div>
          <h1 className="font-display text-lg font-semibold">Stok & Rekap Harian</h1>
          <p className="text-xs" style={{ color: COLORS.textMuted }}>Santoso Pizza Delivery</p>
        </div>
        <div className="rounded-lg px-3 py-2 border" style={{ borderColor: COLORS.border, background: COLORS.surface }}>
          <label className="text-[10px] block" style={{ color: COLORS.textMuted }}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent outline-none text-sm py-1"
            style={{ color: COLORS.text }}
          />
        </div>
        <div className="rounded-lg px-3 py-2 border" style={{ borderColor: COLORS.border, background: COLORS.surface }}>
          <label className="text-[10px] block" style={{ color: COLORS.textMuted }}>Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-transparent outline-none text-sm py-1"
            style={{ color: COLORS.text }}
          />
        </div>
        {error && <p className="text-xs" style={{ color: COLORS.primaryLight }}>{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5"
          style={{ background: COLORS.primary, color: COLORS.text, opacity: busy ? 0.7 : 1 }}
        >
          <Lock className="w-3.5 h-3.5" /> {busy ? 'Memproses...' : 'Masuk'}
        </button>
        <p className="text-[11px] text-center" style={{ color: COLORS.textMuted }}>
          Akun dibuat manual lewat Firebase Console — tidak ada pendaftaran di sini.
        </p>
      </form>
    </div>
  );
}

/* ---------------- MAIN APP (setelah login) ---------------- */
function MainApp({ uid, email }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('ringkasan');

  const [rawMaterials, setRawMaterials] = useState([]);
  const [finishedStock, setFinishedStock] = useState([]);
  const [salesRecords, setSalesRecords] = useState([]);

  useEffect(() => {
    (async () => {
      const [rm, fs, sr] = await Promise.all([
        loadKey(uid, 'raw-materials', []),
        loadKey(uid, 'finished-stock', []),
        loadKey(uid, 'sales-records', []),
      ]);
      setRawMaterials(rm);
      setFinishedStock(fs);
      setSalesRecords(sr);
      setLoading(false);
    })();
  }, [uid]);

  const persist = useCallback(async (key, setter, value) => {
    setter(value);
    setSaving(true);
    await saveKey(uid, key, value);
    setSaving(false);
  }, [uid]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: COLORS.primary }} />
          <span className="text-sm" style={{ color: COLORS.textMuted }}>Memuat data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col font-sans" style={{ background: COLORS.bg, color: COLORS.text }}>
      <Header saving={saving} email={email} />

      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-6 max-w-md w-full mx-auto">
        {activeTab === 'ringkasan' && (
          <Ringkasan rawMaterials={rawMaterials} finishedStock={finishedStock} salesRecords={salesRecords} />
        )}
        {activeTab === 'stok' && (
          <StokTab
            rawMaterials={rawMaterials}
            finishedStock={finishedStock}
            onSaveRaw={(v) => persist('raw-materials', setRawMaterials, v)}
            onSaveFinished={(v) => persist('finished-stock', setFinishedStock, v)}
          />
        )}
        {activeTab === 'penjualan' && (
          <PenjualanTab
            finishedStock={finishedStock}
            salesRecords={salesRecords}
            onSaveSales={(v) => persist('sales-records', setSalesRecords, v)}
            onSaveFinished={(v) => persist('finished-stock', setFinishedStock, v)}
          />
        )}
        {activeTab === 'riwayat' && (
          <RiwayatTab
            salesRecords={salesRecords}
            onSaveSales={(v) => persist('sales-records', setSalesRecords, v)}
            onResetAll={async () => {
              await persist('raw-materials', setRawMaterials, []);
              await persist('finished-stock', setFinishedStock, []);
              await persist('sales-records', setSalesRecords, []);
            }}
          />
        )}
      </main>

      <nav className="shrink-0 flex border-t max-w-md w-full mx-auto" style={{ borderColor: COLORS.border, background: COLORS.surface }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors"
              style={{ color: active ? COLORS.primaryLight : COLORS.textMuted }}
            >
              <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[11px] font-medium">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Header({ saving, email }) {
  return (
    <header
      className="shrink-0 px-4 py-3.5 flex items-center justify-between max-w-md w-full mx-auto"
      style={{ borderBottom: `1px solid ${COLORS.border}`, background: `linear-gradient(180deg, ${COLORS.surfaceLight}, ${COLORS.bg})` }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: COLORS.primary }}>
          <Flame className="w-4.5 h-4.5" style={{ color: COLORS.text }} />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-base font-semibold leading-tight truncate" style={{ color: COLORS.text }}>
            Stok & Rekap Harian
          </h1>
          <p className="text-[11px] leading-tight truncate" style={{ color: COLORS.textMuted }}>{email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-[10px] w-10 text-right" style={{ color: saving ? COLORS.warning : 'transparent' }}>
          {saving ? 'saving' : 'ok'}
        </span>
        <button onClick={() => signOut(auth)} style={{ color: COLORS.textMuted }} aria-label="Keluar">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

function Card({ children, className = '' }) {
  return (
    <div
      className={`rounded-2xl p-4 ${className}`}
      style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <h2 className="font-display text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: COLORS.textMuted }}>
      {children}
    </h2>
  );
}

/* ---------------- RINGKASAN ---------------- */
function Ringkasan({ rawMaterials, finishedStock, salesRecords }) {
  const today = todayISO();
  const todayRecord = salesRecords.find((r) => r.date === today);
  const todayTotal = todayRecord ? todayRecord.total : 0;
  const todayItems = todayRecord ? todayRecord.items.reduce((s, i) => s + Number(i.qty || 0), 0) : 0;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAgoISO = weekAgo.toISOString().slice(0, 10);
  const weekTotal = salesRecords
    .filter((r) => r.date >= weekAgoISO && r.date <= today)
    .reduce((s, r) => s + r.total, 0);

  const lowRaw = rawMaterials.filter((m) => (m.minStock > 0 && m.currentStock <= m.minStock) || m.currentStock <= 0);
  const lowFinished = finishedStock.filter((m) => (m.minStock > 0 && m.currentStock <= m.minStock) || m.currentStock <= 0);
  const lowItems = [...lowRaw.map((m) => ({ ...m, group: 'Bahan Baku' })), ...lowFinished.map((m) => ({ ...m, group: m.category || 'Menu Jadi' }))];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="flex items-center gap-1.5 mb-1" style={{ color: COLORS.textMuted }}>
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-[11px]">Omzet hari ini</span>
          </div>
          <p className="font-display text-xl font-semibold" style={{ color: COLORS.text }}>{rupiah(todayTotal)}</p>
          <p className="text-[11px] mt-0.5" style={{ color: COLORS.textMuted }}>{todayItems} item terjual</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1" style={{ color: COLORS.textMuted }}>
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[11px]">Omzet 7 hari</span>
          </div>
          <p className="font-display text-xl font-semibold" style={{ color: COLORS.text }}>{rupiah(weekTotal)}</p>
          <p className="text-[11px] mt-0.5" style={{ color: COLORS.textMuted }}>{salesRecords.filter((r) => r.date >= weekAgoISO).length} hari tercatat</p>
        </Card>
      </div>

      <div>
        <SectionLabel>Peringatan Stok</SectionLabel>
        {lowItems.length === 0 ? (
          <Card>
            <p className="text-sm" style={{ color: COLORS.textMuted }}>Semua stok masih aman. Belum ada yang menipis.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {lowItems.map((m) => (
              <div
                key={m.group + m.id}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
                style={{ background: 'rgba(217,164,65,0.08)', border: `1px solid ${COLORS.warning}55` }}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: COLORS.warning }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: COLORS.text }}>{m.name}</p>
                  <p className="text-[11px]" style={{ color: COLORS.textMuted }}>{m.group}</p>
                </div>
                <p className="text-sm font-semibold shrink-0" style={{ color: COLORS.warning }}>
                  {m.currentStock} {m.unit || ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- STOK TAB (shared for bahan baku & menu jadi) ---------------- */
function StokTab({ rawMaterials, finishedStock, onSaveRaw, onSaveFinished }) {
  const [sub, setSub] = useState('bahan');
  const isBahan = sub === 'bahan';
  const list = isBahan ? rawMaterials : finishedStock;
  const onSave = isBahan ? onSaveRaw : onSaveFinished;
  const [form, setForm] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('Semua');

  const displayedList = isBahan || categoryFilter === 'Semua' ? list : list.filter((i) => (i.category || 'Lainnya') === categoryFilter);

  const openNew = () => setForm({ editingId: null, name: '', unit: isBahan ? 'kg' : 'pcs', currentStock: '', minStock: '', category: 'Pizza' });
  const openEdit = (item) => setForm({ editingId: item.id, name: item.name, unit: item.unit, currentStock: String(item.currentStock), minStock: String(item.minStock), category: item.category || 'Lainnya' });

  const submitForm = () => {
    if (!form.name.trim()) return;
    const payload = {
      id: form.editingId || genId(),
      name: form.name.trim(),
      unit: form.unit.trim() || (isBahan ? 'kg' : 'pcs'),
      currentStock: parseFloat(form.currentStock) || 0,
      minStock: parseFloat(form.minStock) || 0,
      ...(isBahan ? {} : { category: form.category || 'Lainnya' }),
    };
    if (form.editingId) {
      onSave(list.map((i) => (i.id === form.editingId ? payload : i)));
    } else {
      onSave([...list, payload]);
    }
    setForm(null);
  };

  const adjust = (item, delta) => {
    const next = Math.max(0, item.currentStock + delta);
    onSave(list.map((i) => (i.id === item.id ? { ...i, currentStock: next } : i)));
  };

  const remove = (id) => onSave(list.filter((i) => i.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl p-1" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
        {[{ id: 'bahan', label: 'Bahan Baku' }, { id: 'pizza', label: 'Menu Jadi' }].map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
            style={sub === t.id ? { background: COLORS.primary, color: COLORS.text } : { color: COLORS.textMuted }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!isBahan && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {['Semua', ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className="px-3 py-1.5 rounded-full text-xs font-medium shrink-0"
              style={categoryFilter === c ? { background: COLORS.secondary, color: COLORS.bg } : { background: COLORS.surface, color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {displayedList.length === 0 && !form && (
        <Card>
          <p className="text-sm" style={{ color: COLORS.textMuted }}>
            Belum ada {isBahan ? 'bahan baku' : 'menu'} yang dicatat. Tambahkan item pertama.
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {displayedList.map((item) => {
          const low = (item.minStock > 0 && item.currentStock <= item.minStock) || item.currentStock <= 0;
          return (
            <div key={item.id} className="rounded-xl px-3.5 py-3" style={{ background: COLORS.surface, border: `1px solid ${low ? COLORS.warning + '66' : COLORS.border}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate" style={{ color: COLORS.text }}>{item.name}</p>
                    {!isBahan && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: COLORS.surfaceLight, color: COLORS.textMuted }}>
                        {item.category || 'Lainnya'}
                      </span>
                    )}
                  </div>
                  {item.minStock > 0 && (
                    <p className="text-[11px]" style={{ color: COLORS.textMuted }}>Min. stok: {item.minStock} {item.unit}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded-md" style={{ color: COLORS.textMuted }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remove(item.id)} className="p-1.5 rounded-md" style={{ color: COLORS.primaryLight }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2.5">
                <div className="flex items-center gap-2">
                  <button onClick={() => adjust(item, -1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COLORS.surfaceLight, color: COLORS.text }}>
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-base font-semibold w-16 text-center font-display" style={{ color: low ? COLORS.warning : COLORS.text }}>
                    {item.currentStock} {item.unit}
                  </span>
                  <button onClick={() => adjust(item, 1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COLORS.surfaceLight, color: COLORS.text }}>
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {low && <AlertTriangle className="w-4 h-4" style={{ color: COLORS.warning }} />}
              </div>
            </div>
          );
        })}
      </div>

      {!form && (
        <button
          onClick={openNew}
          className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
          style={{ background: COLORS.surfaceLight, color: COLORS.text, border: `1px dashed ${COLORS.border}` }}
        >
          <Plus className="w-4 h-4" /> Tambah {isBahan ? 'Bahan Baku' : 'Menu'}
        </button>
      )}

      {form && (
        <Card>
          <SectionLabel>{form.editingId ? 'Edit Item' : 'Item Baru'}</SectionLabel>
          <div className="space-y-2.5">
            <Field label="Nama">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={isBahan ? 'Contoh: Keju Mozarella' : 'Contoh: Pizza Beef BBQ / Es Teh Manis'}
                className="w-full bg-transparent outline-none text-sm py-2"
                style={{ color: COLORS.text }}
              />
            </Field>
            {!isBahan && (
              <Field label="Kategori">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-transparent outline-none text-sm py-2"
                  style={{ color: COLORS.text }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} style={{ background: COLORS.surface }}>{c}</option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-3 gap-2.5">
              <Field label="Satuan">
                <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} />
              </Field>
              <Field label="Stok Saat Ini">
                <input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} />
              </Field>
              <Field label="Stok Minimum">
                <input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} />
              </Field>
            </div>
          </div>
          <div className="flex gap-2 mt-3.5">
            <button onClick={() => setForm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: COLORS.surfaceLight, color: COLORS.textMuted }}>
              Batal
            </button>
            <button onClick={submitForm} className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.primary, color: COLORS.text }}>
              <Check className="w-4 h-4" /> Simpan
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="rounded-lg px-3 border" style={{ borderColor: COLORS.border, background: COLORS.bg }}>
      <label className="text-[10px] block pt-1.5" style={{ color: COLORS.textMuted }}>{label}</label>
      {children}
    </div>
  );
}

/* ---------------- PENJUALAN TAB ---------------- */
function PenjualanTab({ finishedStock, salesRecords, onSaveSales, onSaveFinished }) {
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState([{ id: genId(), name: '', qty: '', price: '' }]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const existing = salesRecords.find((r) => r.date === date);
    if (existing) {
      setItems(existing.items.map((i) => ({ id: genId(), name: i.name, qty: String(i.qty), price: String(i.price) })));
      setNotes(existing.notes || '');
    } else {
      setItems([{ id: genId(), name: '', qty: '', price: '' }]);
      setNotes('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const updateItem = (id, field, value) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };
  const addRow = () => setItems([...items, { id: genId(), name: '', qty: '', price: '' }]);
  const removeRow = (id) => setItems(items.filter((i) => i.id !== id));

  const total = items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0), 0);

  const save = () => {
    const cleanItems = items
      .filter((i) => i.name.trim() && parseFloat(i.qty) > 0)
      .map((i) => ({ name: i.name.trim(), qty: parseFloat(i.qty) || 0, price: parseFloat(i.price) || 0 }));
    if (cleanItems.length === 0) return;

    const prevRecord = salesRecords.find((r) => r.date === date);
    const record = {
      id: prevRecord ? prevRecord.id : genId(),
      date,
      items: cleanItems,
      total: cleanItems.reduce((s, i) => s + i.qty * i.price, 0),
      notes: notes.trim(),
      updatedAt: new Date().toISOString(),
    };
    const nextRecords = prevRecord
      ? salesRecords.map((r) => (r.id === prevRecord.id ? record : r))
      : [...salesRecords, record];
    onSaveSales(nextRecords);

    const prevQty = {};
    (prevRecord ? prevRecord.items : []).forEach((i) => {
      const key = i.name.trim().toLowerCase();
      prevQty[key] = (prevQty[key] || 0) + i.qty;
    });
    const newQty = {};
    cleanItems.forEach((i) => {
      const key = i.name.toLowerCase();
      newQty[key] = (newQty[key] || 0) + i.qty;
    });
    const names = new Set([...Object.keys(prevQty), ...Object.keys(newQty)]);
    let nextFinished = finishedStock;
    names.forEach((key) => {
      const delta = (newQty[key] || 0) - (prevQty[key] || 0);
      if (delta === 0) return;
      nextFinished = nextFinished.map((f) =>
        f.name.trim().toLowerCase() === key ? { ...f, currentStock: Math.max(0, f.currentStock - delta) } : f
      );
    });
    if (nextFinished !== finishedStock) onSaveFinished(nextFinished);
  };

  const existingForDate = salesRecords.find((r) => r.date === date);

  return (
    <div className="space-y-4">
      <Card>
        <SectionLabel>Tanggal</SectionLabel>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-transparent outline-none text-sm py-1"
          style={{ color: COLORS.text, colorScheme: 'dark' }}
        />
        {existingForDate && (
          <p className="text-[11px] mt-1.5" style={{ color: COLORS.warning }}>Tanggal ini sudah ada catatan — akan ditimpa (edit) saat disimpan.</p>
        )}
      </Card>

      <div>
        <SectionLabel>Item Terjual</SectionLabel>
        <div className="space-y-2">
          {items.map((item) => {
            const subtotal = (parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0);
            return (
              <div key={item.id} className="rounded-xl p-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={item.name}
                    onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                    list="pizza-names"
                    placeholder="Nama item (pizza / minuman / lainnya)"
                    className="flex-1 bg-transparent outline-none text-sm min-w-0"
                    style={{ color: COLORS.text }}
                  />
                  <button onClick={() => removeRow(item.id)} style={{ color: COLORS.textMuted }}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 items-end">
                  <Field label="Qty">
                    <input type="number" value={item.qty} onChange={(e) => updateItem(item.id, 'qty', e.target.value)} className="w-full bg-transparent outline-none text-sm py-1.5" style={{ color: COLORS.text }} />
                  </Field>
                  <Field label="Harga satuan">
                    <input type="number" value={item.price} onChange={(e) => updateItem(item.id, 'price', e.target.value)} className="w-full bg-transparent outline-none text-sm py-1.5" style={{ color: COLORS.text }} />
                  </Field>
                  <div className="text-right pb-1.5">
                    <p className="text-[10px]" style={{ color: COLORS.textMuted }}>Subtotal</p>
                    <p className="text-sm font-semibold font-display" style={{ color: COLORS.secondary }}>{rupiah(subtotal)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <datalist id="pizza-names">
          {finishedStock.map((f) => <option key={f.id} value={f.name} />)}
        </datalist>

        <button onClick={addRow} className="w-full mt-2 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.surfaceLight, color: COLORS.text, border: `1px dashed ${COLORS.border}` }}>
          <Plus className="w-4 h-4" /> Tambah Item
        </button>
      </div>

      <Card>
        <SectionLabel>Catatan (opsional)</SectionLabel>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: hujan deras, order sepi" className="w-full bg-transparent outline-none text-sm py-1" style={{ color: COLORS.text }} />
      </Card>

      <div className="flex items-center justify-between rounded-2xl px-4 py-3.5" style={{ background: COLORS.primary }}>
        <span className="text-sm font-medium" style={{ color: COLORS.text }}>Total Omzet</span>
        <span className="font-display text-lg font-semibold" style={{ color: COLORS.text }}>{rupiah(total)}</span>
      </div>

      <button onClick={save} className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: COLORS.secondary, color: COLORS.bg }}>
        <Save className="w-4 h-4" /> Simpan Rekap Hari Ini
      </button>
    </div>
  );
}

/* ---------------- RIWAYAT TAB ---------------- */
function RiwayatTab({ salesRecords, onSaveSales, onResetAll }) {
  const [expanded, setExpanded] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const sorted = [...salesRecords].sort((a, b) => (a.date < b.date ? 1 : -1));

  const remove = (id) => {
    onSaveSales(salesRecords.filter((r) => r.id !== id));
    if (expanded === id) setExpanded(null);
  };

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <Card>
          <p className="text-sm" style={{ color: COLORS.textMuted }}>Belum ada riwayat penjualan.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => {
            const isOpen = expanded === r.id;
            return (
              <div key={r.id} className="rounded-xl overflow-hidden" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                <button onClick={() => setExpanded(isOpen ? null : r.id)} className="w-full flex items-center justify-between px-3.5 py-3">
                  <div className="text-left">
                    <p className="text-sm font-medium" style={{ color: COLORS.text }}>{fmtDate(r.date)}</p>
                    <p className="text-[11px]" style={{ color: COLORS.textMuted }}>{r.items.length} jenis item</p>
                  </div>
                  <p className="font-display text-sm font-semibold" style={{ color: COLORS.secondary }}>{rupiah(r.total)}</p>
                </button>
                {isOpen && (
                  <div className="px-3.5 pb-3.5 border-t" style={{ borderColor: COLORS.border }}>
                    <div className="mt-2.5 space-y-1.5">
                      {r.items.map((i, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span style={{ color: COLORS.text }}>{i.name} <span style={{ color: COLORS.textMuted }}>×{i.qty}</span></span>
                          <span style={{ color: COLORS.textMuted }}>{rupiah(i.qty * i.price)}</span>
                        </div>
                      ))}
                    </div>
                    {r.notes && <p className="text-[11px] mt-2 italic" style={{ color: COLORS.textMuted }}>"{r.notes}"</p>}
                    <button onClick={() => remove(r.id)} className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: COLORS.primaryLight }}>
                      <Trash2 className="w-3.5 h-3.5" /> Hapus catatan ini
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-4 border-t" style={{ borderColor: COLORS.border }}>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)} className="text-xs" style={{ color: COLORS.textMuted }}>
            Hapus semua data (stok & riwayat)
          </button>
        ) : (
          <div className="rounded-xl p-3" style={{ background: 'rgba(193,57,31,0.1)', border: `1px solid ${COLORS.primary}66` }}>
            <p className="text-xs mb-2" style={{ color: COLORS.text }}>Yakin hapus semua data stok dan riwayat penjualan? Tidak bisa dibatalkan.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReset(false)} className="flex-1 py-2 rounded-lg text-xs" style={{ background: COLORS.surfaceLight, color: COLORS.textMuted }}>Batal</button>
              <button onClick={() => { onResetAll(); setConfirmReset(false); }} className="flex-1 py-2 rounded-lg text-xs font-medium" style={{ background: COLORS.primary, color: COLORS.text }}>Ya, hapus semua</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
