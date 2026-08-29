import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  Home, Package, Receipt, History, Plus, Minus, X, Pencil, Trash2,
  AlertTriangle, Flame, TrendingUp, Save, Check, Calendar, Loader2, LogOut, Lock, ChefHat, Layers, Factory, ChevronUp, ChevronDown, LayoutDashboard, Target as TargetIcon, Users, Gauge, Wallet, Store, UserCheck, Truck
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
const getMargin = (r) => (typeof r.margin === 'number' ? r.margin : r.total);

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'stok', label: 'Stok', icon: Package },
  { id: 'penjualan', label: 'Penjualan', icon: Receipt },
  { id: 'keuangan', label: 'Keuangan', icon: Wallet },
  { id: 'riwayat', label: 'Riwayat', icon: History },
];
const CATEGORIES = ['Pizza', 'Minuman', 'Pelengkap', 'Lainnya'];

/* ---------------- HELPERS: resep, HPP, dua tingkat (raw & base) ---------------- */
const ingSourceType = (ing) => ing.sourceType || 'raw';
const ingSourceId = (ing) => ing.sourceId || ing.rawMaterialId;

function computeBaseUnitCost(base, rawMaterials) {
  const batchCost = (base.recipe || []).reduce((sum, ing) => {
    const rm = rawMaterials.find((r) => r.id === ingSourceId(ing));
    return sum + (ing.qty || 0) * (rm ? rm.purchasePrice || 0 : 0);
  }, 0);
  const yieldQty = base.yieldQty || 1;
  return yieldQty > 0 ? batchCost / yieldQty : 0;
}

function computeRecipeHpp(recipe, rawMaterials, baseStock) {
  return (recipe || []).reduce((sum, ing) => {
    const type = ingSourceType(ing);
    const id = ingSourceId(ing);
    if (type === 'base') {
      const b = (baseStock || []).find((x) => x.id === id);
      return sum + (ing.qty || 0) * (b ? computeBaseUnitCost(b, rawMaterials) : 0);
    }
    const rm = rawMaterials.find((r) => r.id === id);
    return sum + (ing.qty || 0) * (rm ? rm.purchasePrice || 0 : 0);
  }, 0);
}

function computeMakeablePortions(recipe, rawMaterials, baseStock) {
  if (!recipe || recipe.length === 0) return 0;
  let min = Infinity;
  for (const ing of recipe) {
    const qty = ing.qty || 0;
    if (qty <= 0) continue;
    const type = ingSourceType(ing);
    const id = ingSourceId(ing);
    let available;
    if (type === 'base') {
      const b = (baseStock || []).find((x) => x.id === id);
      available = b ? b.currentStock : 0;
    } else {
      const rm = rawMaterials.find((r) => r.id === id);
      available = rm ? rm.currentStock : 0;
    }
    const possible = Math.floor(available / qty);
    if (possible < min) min = possible;
  }
  return min === Infinity ? 0 : min;
}
function isMenuLow(item, rawMaterials, baseStock) {
  if (item.recipeBased) {
    const makeable = computeMakeablePortions(item.recipe, rawMaterials, baseStock);
    return (item.minStock > 0 && makeable <= item.minStock) || makeable <= 0;
  }
  return (item.minStock > 0 && item.currentStock <= item.minStock) || item.currentStock <= 0;
}
function menuHpp(item, rawMaterials, baseStock) {
  return item.recipeBased ? computeRecipeHpp(item.recipe, rawMaterials, baseStock) : item.purchasePrice || 0;
}

/* ---------------- HELPERS: Target Bulanan (Laba Kotor) & Gaji ---------------- */
function computeTargetStats(employees, bufferAmount, salesRecords) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthRecords = salesRecords.filter((r) => r.date.startsWith(monthPrefix));
  const realisasi = monthRecords.reduce((s, r) => s + getMargin(r), 0);
  const totalGaji = employees.reduce((s, e) => s + (e.salary || 0), 0);
  const targetBulanan = totalGaji + (bufferAmount || 0);
  const targetHarianRataRata = daysInMonth > 0 ? targetBulanan / daysInMonth : 0;
  const expectedByToday = targetHarianRataRata * dayOfMonth;
  const progressPercent = targetBulanan > 0 ? (realisasi / targetBulanan) * 100 : 0;
  const sisaTarget = Math.max(0, targetBulanan - realisasi);
  const sisaHari = Math.max(1, daysInMonth - dayOfMonth + 1);
  const rataRataDibutuhkan = sisaTarget / sisaHari;
  const paceDiff = realisasi - expectedByToday;
  return { daysInMonth, dayOfMonth, realisasi, totalGaji, targetBulanan, targetHarianRataRata, expectedByToday, progressPercent, sisaTarget, sisaHari, rataRataDibutuhkan, paceDiff };
}

/* ---------------- HELPERS: minggu Minggu-Sabtu (komisi afiliator) ---------------- */
function weekStartISO(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay()); // mundur ke hari Minggu
  return d.toISOString().slice(0, 10);
}
function weekRangeLabel(startISO) {
  const start = new Date(startISO + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
}
function computeAffiliateCommission(boxQty, combined) {
  return (boxQty || 0) * (5000 + (combined ? 3000 : 0));
}

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
          <img src="/logo.png" alt="SPD" className="w-16 h-16 rounded-2xl object-contain" />
          <h1 className="font-display text-lg font-semibold">Stok & Rekap Harian</h1>
          <p className="text-xs" style={{ color: COLORS.textMuted }}>Santoso Pizza Delivery</p>
        </div>
        <div className="rounded-lg px-3 py-2 border" style={{ borderColor: COLORS.border, background: COLORS.surface }}>
          <label className="text-[10px] block" style={{ color: COLORS.textMuted }}>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent outline-none text-sm py-1" style={{ color: COLORS.text }} />
        </div>
        <div className="rounded-lg px-3 py-2 border" style={{ borderColor: COLORS.border, background: COLORS.surface }}>
          <label className="text-[10px] block" style={{ color: COLORS.textMuted }}>Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-transparent outline-none text-sm py-1" style={{ color: COLORS.text }} />
        </div>
        {error && <p className="text-xs" style={{ color: COLORS.primaryLight }}>{error}</p>}
        <button type="submit" disabled={busy} className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.primary, color: COLORS.text, opacity: busy ? 0.7 : 1 }}>
          <Lock className="w-3.5 h-3.5" /> {busy ? 'Memproses...' : 'Masuk'}
        </button>
        <p className="text-[11px] text-center" style={{ color: COLORS.textMuted }}>Akun dibuat manual lewat Firebase Console — tidak ada pendaftaran di sini.</p>
      </form>
    </div>
  );
}

/* ---------------- MAIN APP ---------------- */
function MainApp({ uid, email }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');

  const [rawMaterials, setRawMaterials] = useState([]);
  const [baseStock, setBaseStock] = useState([]);
  const [finishedStock, setFinishedStock] = useState([]);
  const [salesRecords, setSalesRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [targetSettings, setTargetSettings] = useState({ bufferAmount: 0 });
  const [channels, setChannels] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [affiliateSales, setAffiliateSales] = useState([]);

  useEffect(() => {
    (async () => {
      const [rm, bs, fs, sr, emp, ts, ch, aff, affSales] = await Promise.all([
        loadKey(uid, 'raw-materials', []),
        loadKey(uid, 'base-stock', []),
        loadKey(uid, 'finished-stock', []),
        loadKey(uid, 'sales-records', []),
        loadKey(uid, 'employees', []),
        loadKey(uid, 'target-settings', { bufferAmount: 0 }),
        loadKey(uid, 'channels', []),
        loadKey(uid, 'affiliates', []),
        loadKey(uid, 'affiliate-sales', []),
      ]);
      setRawMaterials(rm);
      setBaseStock(bs);
      setFinishedStock(fs);
      setSalesRecords(sr);
      setEmployees(emp);
      setTargetSettings(ts);
      setChannels(ch);
      setAffiliates(aff);
      setAffiliateSales(affSales);
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

  const saveRaw = (v) => persist('raw-materials', setRawMaterials, v);
  const saveBase = (v) => persist('base-stock', setBaseStock, v);
  const saveFinished = (v) => persist('finished-stock', setFinishedStock, v);
  const saveSales = (v) => persist('sales-records', setSalesRecords, v);
  const saveEmployees = (v) => persist('employees', setEmployees, v);
  const saveTargetSettings = (v) => persist('target-settings', setTargetSettings, v);
  const saveChannels = (v) => persist('channels', setChannels, v);
  const saveAffiliates = (v) => persist('affiliates', setAffiliates, v);
  const saveAffiliateSales = (v) => persist('affiliate-sales', setAffiliateSales, v);

  return (
    <div className="h-screen flex flex-col font-sans" style={{ background: COLORS.bg, color: COLORS.text }}>
      <Header saving={saving} email={email} />
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-6 max-w-md w-full mx-auto">
        {activeTab === 'dashboard' && (
          <Dashboard rawMaterials={rawMaterials} baseStock={baseStock} finishedStock={finishedStock} salesRecords={salesRecords} employees={employees} targetSettings={targetSettings} />
        )}
        {activeTab === 'stok' && (
          <StokTab
            rawMaterials={rawMaterials} baseStock={baseStock} finishedStock={finishedStock}
            onSaveRaw={saveRaw} onSaveBase={saveBase} onSaveFinished={saveFinished}
          />
        )}
        {activeTab === 'penjualan' && (
          <PenjualanTab
            rawMaterials={rawMaterials} baseStock={baseStock} finishedStock={finishedStock} salesRecords={salesRecords} channels={channels}
            onSaveSales={saveSales} onSaveFinished={saveFinished} onSaveRaw={saveRaw} onSaveBase={saveBase} onSaveChannels={saveChannels}
          />
        )}
        {activeTab === 'keuangan' && (
          <KeuanganTab
            employees={employees} targetSettings={targetSettings} salesRecords={salesRecords}
            onSaveEmployees={saveEmployees} onSaveTargetSettings={saveTargetSettings}
            affiliates={affiliates} affiliateSales={affiliateSales} onSaveAffiliates={saveAffiliates} onSaveAffiliateSales={saveAffiliateSales}
          />
        )}
        {activeTab === 'riwayat' && (
          <RiwayatTab
            salesRecords={salesRecords} onSaveSales={saveSales}
            onResetAll={async () => {
              await persist('raw-materials', setRawMaterials, []);
              await persist('base-stock', setBaseStock, []);
              await persist('finished-stock', setFinishedStock, []);
              await persist('sales-records', setSalesRecords, []);
              await persist('employees', setEmployees, []);
              await persist('target-settings', setTargetSettings, { bufferAmount: 0 });
              await persist('channels', setChannels, []);
              await persist('affiliates', setAffiliates, []);
              await persist('affiliate-sales', setAffiliateSales, []);
            }}
          />
        )}
      </main>
      <nav className="shrink-0 flex border-t max-w-md w-full mx-auto" style={{ borderColor: COLORS.border, background: COLORS.surface }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors" style={{ color: active ? COLORS.primaryLight : COLORS.textMuted }}>
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
    <header className="shrink-0 px-4 py-3.5 flex items-center justify-between max-w-md w-full mx-auto" style={{ borderBottom: `1px solid ${COLORS.border}`, background: `linear-gradient(180deg, ${COLORS.surfaceLight}, ${COLORS.bg})` }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <img src="/logo.png" alt="SPD" className="w-8 h-8 rounded-lg object-contain shrink-0" />
        <div className="min-w-0">
          <h1 className="font-display text-base font-semibold leading-tight truncate" style={{ color: COLORS.text }}>Stok & Rekap Harian</h1>
          <p className="text-[11px] leading-tight truncate" style={{ color: COLORS.textMuted }}>{email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-[10px] w-10 text-right" style={{ color: saving ? COLORS.warning : 'transparent' }}>{saving ? 'saving' : 'ok'}</span>
        <button onClick={() => signOut(auth)} style={{ color: COLORS.textMuted }} aria-label="Keluar"><LogOut className="w-4 h-4" /></button>
      </div>
    </header>
  );
}

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl p-4 ${className}`} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>{children}</div>;
}
function SectionLabel({ children }) {
  return <h2 className="font-display text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: COLORS.textMuted }}>{children}</h2>;
}
function Field({ label, children }) {
  return (
    <div className="rounded-lg px-3 border" style={{ borderColor: COLORS.border, background: COLORS.bg }}>
      <label className="text-[10px] block pt-1.5" style={{ color: COLORS.textMuted }}>{label}</label>
      {children}
    </div>
  );
}
function ReorderButtons({ index, total, onMoveUp, onMoveDown }) {
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      <button onClick={onMoveUp} disabled={index === 0} className="p-0.5 rounded disabled:opacity-30" style={{ color: COLORS.textMuted }}><ChevronUp className="w-3.5 h-3.5" /></button>
      <button onClick={onMoveDown} disabled={index === total - 1} className="p-0.5 rounded disabled:opacity-30" style={{ color: COLORS.textMuted }}><ChevronDown className="w-3.5 h-3.5" /></button>
    </div>
  );
}

/* ---------------- DASHBOARD ---------------- */
function Dashboard({ rawMaterials, baseStock, finishedStock, salesRecords, employees, targetSettings }) {
  const today = todayISO();
  const todayRecords = salesRecords.filter((r) => r.date === today);
  const todayTotal = todayRecords.reduce((s, r) => s + r.total, 0);
  const todayMargin = todayRecords.reduce((s, r) => s + getMargin(r), 0);
  const todayItems = todayRecords.reduce((s, r) => s + r.items.reduce((s2, i) => s2 + Number(i.qty || 0), 0), 0);
  const todayByChannel = {};
  todayRecords.forEach((r) => { const c = r.channel || 'Tanpa channel'; todayByChannel[c] = (todayByChannel[c] || 0) + r.total; });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAgoISO = weekAgo.toISOString().slice(0, 10);
  const weekRecords = salesRecords.filter((r) => r.date >= weekAgoISO && r.date <= today);
  const weekTotal = weekRecords.reduce((s, r) => s + r.total, 0);
  const weekMargin = weekRecords.reduce((s, r) => s + getMargin(r), 0);

  const t = computeTargetStats(employees, targetSettings.bufferAmount, salesRecords);
  const monthLabel = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const lowRaw = rawMaterials.filter((m) => (m.minStock > 0 && m.currentStock <= m.minStock) || m.currentStock <= 0);
  const lowBase = baseStock.filter((m) => (m.minStock > 0 && m.currentStock <= m.minStock) || m.currentStock <= 0);
  const lowFinished = finishedStock.filter((m) => isMenuLow(m, rawMaterials, baseStock));
  const lowItems = [
    ...lowRaw.map((m) => ({ id: m.id, name: m.name, unit: m.unit, display: m.currentStock, group: 'Bahan Baku' })),
    ...lowBase.map((m) => ({ id: m.id, name: m.name, unit: m.unit, display: m.currentStock, group: 'Base' })),
    ...lowFinished.map((m) => ({
      id: m.id, name: m.name,
      unit: m.recipeBased ? (m.unit || 'porsi') : m.unit,
      display: m.recipeBased ? computeMakeablePortions(m.recipe, rawMaterials, baseStock) : m.currentStock,
      group: m.category || 'Menu Jadi',
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="flex items-center gap-1.5 mb-1" style={{ color: COLORS.textMuted }}><TrendingUp className="w-3.5 h-3.5" /><span className="text-[11px]">Omzet hari ini</span></div>
          <p className="font-display text-xl font-semibold" style={{ color: COLORS.text }}>{rupiah(todayTotal)}</p>
          <p className="text-[11px] mt-0.5" style={{ color: COLORS.textMuted }}>{todayItems} item terjual</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1" style={{ color: COLORS.textMuted }}><ChefHat className="w-3.5 h-3.5" /><span className="text-[11px]">Laba kotor hari ini</span></div>
          <p className="font-display text-xl font-semibold" style={{ color: COLORS.secondary }}>{rupiah(todayMargin)}</p>
          <p className="text-[11px] mt-0.5" style={{ color: COLORS.textMuted }}>Omzet − HPP bahan</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1" style={{ color: COLORS.textMuted }}><Calendar className="w-3.5 h-3.5" /><span className="text-[11px]">Omzet 7 hari</span></div>
          <p className="font-display text-lg font-semibold" style={{ color: COLORS.text }}>{rupiah(weekTotal)}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1" style={{ color: COLORS.textMuted }}><ChefHat className="w-3.5 h-3.5" /><span className="text-[11px]">Laba kotor 7 hari</span></div>
          <p className="font-display text-lg font-semibold" style={{ color: COLORS.secondary }}>{rupiah(weekMargin)}</p>
        </Card>
      </div>

      {Object.keys(todayByChannel).length > 0 && (
        <div>
          <SectionLabel>Omzet Hari Ini per Channel</SectionLabel>
          <Card>
            <div className="space-y-1.5">
              {Object.entries(todayByChannel).map(([ch, val]) => (
                <div key={ch} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5" style={{ color: COLORS.text }}><Store className="w-3.5 h-3.5" style={{ color: COLORS.textMuted }} />{ch}</span>
                  <span className="font-display font-semibold" style={{ color: COLORS.secondary }}>{rupiah(val)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <div>
        <SectionLabel>Target Gaji Bulan Ini · {monthLabel}</SectionLabel>
        <Card>
          {t.targetBulanan <= 0 ? (
            <p className="text-sm" style={{ color: COLORS.textMuted }}>Belum ada data karyawan/buffer — atur di tab Target.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs" style={{ color: COLORS.textMuted }}>Realisasi: {rupiah(t.realisasi)} / {rupiah(t.targetBulanan)}</span>
                <span className="text-sm font-display font-semibold" style={{ color: COLORS.secondary }}>{t.progressPercent.toFixed(0)}%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: COLORS.surfaceLight }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, t.progressPercent)}%`, background: COLORS.secondary }} />
              </div>
              <p className="text-[11px] mt-2" style={{ color: t.paceDiff >= 0 ? COLORS.secondary : COLORS.warning }}>
                {t.paceDiff >= 0 ? `Di atas jalur +${rupiah(t.paceDiff)}` : `Di bawah jalur −${rupiah(Math.abs(t.paceDiff))}`} dari target harian rata-rata (hari ke-{t.dayOfMonth}/{t.daysInMonth})
              </p>
            </>
          )}
        </Card>
      </div>

      <div>
        <SectionLabel>Peringatan Stok</SectionLabel>
        {lowItems.length === 0 ? (
          <Card><p className="text-sm" style={{ color: COLORS.textMuted }}>Semua stok masih aman. Belum ada yang menipis.</p></Card>
        ) : (
          <div className="space-y-2">
            {lowItems.map((m) => (
              <div key={m.group + m.id} className="flex items-center gap-3 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(217,164,65,0.08)', border: `1px solid ${COLORS.warning}55` }}>
                <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: COLORS.warning }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: COLORS.text }}>{m.name}</p>
                  <p className="text-[11px]" style={{ color: COLORS.textMuted }}>{m.group}</p>
                </div>
                <p className="text-sm font-semibold shrink-0" style={{ color: COLORS.warning }}>{m.display} {m.unit || ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- STOK TAB (3 tingkat: Bahan Baku / Base / Menu Jadi) ---------------- */
function StokTab({ rawMaterials, baseStock, finishedStock, onSaveRaw, onSaveBase, onSaveFinished }) {
  const [sub, setSub] = useState('bahan');
  const [form, setForm] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('Semua');
  const [producing, setProducing] = useState(null); // { itemId, batches }

  const subMeta = {
    bahan: { list: rawMaterials, onSave: onSaveRaw },
    base: { list: baseStock, onSave: onSaveBase },
    pizza: { list: finishedStock, onSave: onSaveFinished },
  };
  const { list, onSave } = subMeta[sub];
  const displayedList = sub !== 'pizza' || categoryFilter === 'Semua' ? list : list.filter((i) => (i.category || 'Lainnya') === categoryFilter);

  const openNew = () => {
    if (sub === 'bahan') setForm({ editingId: null, name: '', unit: 'kg', currentStock: '', minStock: '', purchasePrice: '' });
    else if (sub === 'base') setForm({ editingId: null, name: '', unit: 'pcs', currentStock: '', minStock: '', yieldQty: '1', recipe: [] });
    else setForm({ editingId: null, name: '', unit: 'pcs', category: 'Pizza', sellingPrice: '', recipeBased: false, recipe: [], currentStock: '', minStock: '', purchasePrice: '' });
  };

  const openEdit = (item) => {
    if (sub === 'bahan') {
      setForm({ editingId: item.id, name: item.name, unit: item.unit, currentStock: String(item.currentStock), minStock: String(item.minStock), purchasePrice: String(item.purchasePrice || '') });
    } else if (sub === 'base') {
      setForm({
        editingId: item.id, name: item.name, unit: item.unit, currentStock: String(item.currentStock), minStock: String(item.minStock),
        yieldQty: String(item.yieldQty || 1),
        recipe: (item.recipe || []).map((r) => ({ rowId: genId(), rawMaterialId: ingSourceId(r), qty: String(r.qty) })),
      });
    } else {
      setForm({
        editingId: item.id, name: item.name, unit: item.unit, category: item.category || 'Lainnya', sellingPrice: String(item.sellingPrice || ''),
        recipeBased: !!item.recipeBased,
        recipe: (item.recipe || []).map((r) => ({ rowId: genId(), sourceType: ingSourceType(r), sourceId: ingSourceId(r), qty: String(r.qty) })),
        currentStock: String(item.currentStock || ''), minStock: String(item.minStock || ''), purchasePrice: String(item.purchasePrice || ''),
      });
    }
  };

  const submitForm = () => {
    if (!form.name.trim()) return;
    let payload;
    if (sub === 'bahan') {
      payload = { id: form.editingId || genId(), name: form.name.trim(), unit: form.unit.trim() || 'kg', currentStock: parseFloat(form.currentStock) || 0, minStock: parseFloat(form.minStock) || 0, purchasePrice: parseFloat(form.purchasePrice) || 0 };
    } else if (sub === 'base') {
      payload = {
        id: form.editingId || genId(), name: form.name.trim(), unit: form.unit.trim() || 'pcs',
        currentStock: parseFloat(form.currentStock) || 0, minStock: parseFloat(form.minStock) || 0,
        yieldQty: parseFloat(form.yieldQty) || 1,
        recipe: form.recipe.filter((r) => r.rawMaterialId && parseFloat(r.qty) > 0).map((r) => ({ rawMaterialId: r.rawMaterialId, qty: parseFloat(r.qty) || 0 })),
      };
    } else {
      const base = { id: form.editingId || genId(), name: form.name.trim(), unit: form.unit.trim() || 'pcs', category: form.category || 'Lainnya', sellingPrice: parseFloat(form.sellingPrice) || 0 };
      if (form.recipeBased) {
        payload = {
          ...base, recipeBased: true,
          recipe: form.recipe.filter((r) => r.sourceId && parseFloat(r.qty) > 0).map((r) => ({ sourceType: r.sourceType || 'raw', sourceId: r.sourceId, qty: parseFloat(r.qty) || 0 })),
          minStock: parseFloat(form.minStock) || 0,
        };
      } else {
        payload = { ...base, recipeBased: false, currentStock: parseFloat(form.currentStock) || 0, minStock: parseFloat(form.minStock) || 0, purchasePrice: parseFloat(form.purchasePrice) || 0 };
      }
    }
    onSave(form.editingId ? list.map((i) => (i.id === form.editingId ? payload : i)) : [...list, payload]);
    setForm(null);
  };

  const adjust = (item, delta) => {
    const next = Math.max(0, item.currentStock + delta);
    onSave(list.map((i) => (i.id === item.id ? { ...i, currentStock: next } : i)));
  };
  const remove = (id) => onSave(list.filter((i) => i.id !== id));

  const canReorder = displayedList.length === list.length; // urutan cuma dijamin benar kalau tidak sedang difilter kategori
  const moveItem = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= list.length) return;
    const newList = [...list];
    [newList[index], newList[newIndex]] = [newList[newIndex], newList[index]];
    onSave(newList);
  };

  // --- recipe row helpers (dipakai form Base: raw-only, & form Menu Jadi: raw+base) ---
  const addBaseRecipeRow = () => setForm({ ...form, recipe: [...form.recipe, { rowId: genId(), rawMaterialId: '', qty: '' }] });
  const updateBaseRecipeRow = (rowId, field, value) => setForm({ ...form, recipe: form.recipe.map((r) => (r.rowId === rowId ? { ...r, [field]: value } : r)) });
  const removeBaseRecipeRow = (rowId) => setForm({ ...form, recipe: form.recipe.filter((r) => r.rowId !== rowId) });

  const addMenuRecipeRow = () => setForm({ ...form, recipe: [...form.recipe, { rowId: genId(), sourceType: 'raw', sourceId: '', qty: '' }] });
  const updateMenuRecipeRow = (rowId, field, value) => setForm({
    ...form,
    recipe: form.recipe.map((r) => (r.rowId === rowId ? (field === 'sourceType' ? { ...r, sourceType: value, sourceId: '' } : { ...r, [field]: value }) : r)),
  });
  const removeMenuRecipeRow = (rowId) => setForm({ ...form, recipe: form.recipe.filter((r) => r.rowId !== rowId) });

  const previewBaseBatchCost = sub === 'base' && form ? form.recipe.reduce((s, r) => { const rm = rawMaterials.find((x) => x.id === r.rawMaterialId); return s + (parseFloat(r.qty) || 0) * (rm ? rm.purchasePrice || 0 : 0); }, 0) : 0;
  const previewBaseUnitCost = sub === 'base' && form ? previewBaseBatchCost / (parseFloat(form.yieldQty) || 1) : 0;

  const previewMenuHpp = sub === 'pizza' && form
    ? computeRecipeHpp(form.recipe.filter((r) => r.sourceId).map((r) => ({ sourceType: r.sourceType, sourceId: r.sourceId, qty: parseFloat(r.qty) || 0 })), rawMaterials, baseStock)
    : 0;
  const previewSell = form ? parseFloat(form.sellingPrice) || 0 : 0;

  // --- produksi batch base ---
  const startProduce = (item) => setProducing({ itemId: item.id, batches: '1' });
  const confirmProduce = () => {
    const item = baseStock.find((b) => b.id === producing.itemId);
    const batches = parseFloat(producing.batches) || 0;
    if (!item || batches <= 0) return;
    const nextRaw = rawMaterials.map((rm) => {
      const ing = (item.recipe || []).find((r) => ingSourceId(r) === rm.id);
      if (!ing) return rm;
      return { ...rm, currentStock: Math.max(0, rm.currentStock - ing.qty * batches) };
    });
    onSaveRaw(nextRaw);
    onSaveBase(baseStock.map((b) => (b.id === item.id ? { ...b, currentStock: b.currentStock + (b.yieldQty || 1) * batches } : b)));
    setProducing(null);
  };

  const SUB_TABS = [{ id: 'bahan', label: 'Bahan Baku' }, { id: 'base', label: 'Base' }, { id: 'pizza', label: 'Menu Jadi' }];

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl p-1" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
        {SUB_TABS.map((t) => (
          <button key={t.id} onClick={() => { setSub(t.id); setForm(null); setProducing(null); }} className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors" style={sub === t.id ? { background: COLORS.primary, color: COLORS.text } : { color: COLORS.textMuted }}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'pizza' && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {['Semua', ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setCategoryFilter(c)} className="px-3 py-1.5 rounded-full text-xs font-medium shrink-0" style={categoryFilter === c ? { background: COLORS.secondary, color: COLORS.bg } : { background: COLORS.surface, color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>
              {c}
            </button>
          ))}
        </div>
      )}
      {sub === 'pizza' && !canReorder && (
        <p className="text-[10px] px-1" style={{ color: COLORS.textMuted }}>Pilih "Semua" di atas untuk bisa mengatur urutan.</p>
      )}

      {displayedList.length === 0 && !form && (
        <Card><p className="text-sm" style={{ color: COLORS.textMuted }}>Belum ada {sub === 'bahan' ? 'bahan baku' : sub === 'base' ? 'base' : 'menu'} yang dicatat. Tambahkan item pertama.</p></Card>
      )}

      <div className="space-y-2">
        {displayedList.map((item, idx) => {
          if (sub === 'bahan') {
            const low = (item.minStock > 0 && item.currentStock <= item.minStock) || item.currentStock <= 0;
            return (
              <div key={item.id} className="rounded-xl px-3.5 py-3" style={{ background: COLORS.surface, border: `1px solid ${low ? COLORS.warning + '66' : COLORS.border}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: COLORS.text }}>{item.name}</p>
                    <p className="text-[11px]" style={{ color: COLORS.textMuted }}>Beli: {rupiah(item.purchasePrice)}/{item.unit}{item.minStock > 0 ? ` · Min. ${item.minStock} ${item.unit}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canReorder && <ReorderButtons index={idx} total={list.length} onMoveUp={() => moveItem(idx, -1)} onMoveDown={() => moveItem(idx, 1)} />}
                    <button onClick={() => openEdit(item)} className="p-1.5 rounded-md" style={{ color: COLORS.textMuted }}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(item.id)} className="p-1.5 rounded-md" style={{ color: COLORS.primaryLight }}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => adjust(item, -1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COLORS.surfaceLight, color: COLORS.text }}><Minus className="w-3.5 h-3.5" /></button>
                    <span className="text-base font-semibold w-16 text-center font-display" style={{ color: low ? COLORS.warning : COLORS.text }}>{item.currentStock} {item.unit}</span>
                    <button onClick={() => adjust(item, 1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COLORS.surfaceLight, color: COLORS.text }}><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  {low && <AlertTriangle className="w-4 h-4" style={{ color: COLORS.warning }} />}
                </div>
              </div>
            );
          }

          if (sub === 'base') {
            const low = (item.minStock > 0 && item.currentStock <= item.minStock) || item.currentStock <= 0;
            const unitCost = computeBaseUnitCost(item, rawMaterials);
            const isProducingThis = producing && producing.itemId === item.id;
            return (
              <div key={item.id} className="rounded-xl px-3.5 py-3" style={{ background: COLORS.surface, border: `1px solid ${low ? COLORS.warning + '66' : COLORS.border}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: COLORS.text }}>{item.name}</p>
                    <p className="text-[11px]" style={{ color: COLORS.textMuted }}>Biaya: {rupiah(unitCost)}/{item.unit} · Hasil {item.yieldQty || 1} {item.unit}/resep</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <ReorderButtons index={idx} total={list.length} onMoveUp={() => moveItem(idx, -1)} onMoveDown={() => moveItem(idx, 1)} />
                    <button onClick={() => openEdit(item)} className="p-1.5 rounded-md" style={{ color: COLORS.textMuted }}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(item.id)} className="p-1.5 rounded-md" style={{ color: COLORS.primaryLight }}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => adjust(item, -1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COLORS.surfaceLight, color: COLORS.text }}><Minus className="w-3.5 h-3.5" /></button>
                    <span className="text-base font-semibold w-16 text-center font-display" style={{ color: low ? COLORS.warning : COLORS.text }}>{item.currentStock} {item.unit}</span>
                    <button onClick={() => adjust(item, 1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COLORS.surfaceLight, color: COLORS.text }}><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <button onClick={() => startProduce(item)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium" style={{ background: COLORS.secondary, color: COLORS.bg }}><Factory className="w-3.5 h-3.5" /> Produksi</button>
                </div>
                {isProducingThis && (
                  <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: COLORS.border }}>
                    <div className="flex items-center gap-2">
                      <Field label="Jumlah resep/batch">
                        <input type="number" value={producing.batches} onChange={(e) => setProducing({ ...producing, batches: e.target.value })} className="w-full bg-transparent outline-none text-sm py-1.5" style={{ color: COLORS.text }} />
                      </Field>
                    </div>
                    <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                      Menghasilkan {(item.yieldQty || 1) * (parseFloat(producing.batches) || 0)} {item.unit}. Bahan yang dipakai:{' '}
                      {(item.recipe || []).map((ing) => {
                        const rm = rawMaterials.find((r) => r.id === ingSourceId(ing));
                        return rm ? `${rm.name} ${(ing.qty * (parseFloat(producing.batches) || 0))}${rm.unit}` : null;
                      }).filter(Boolean).join(', ')}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => setProducing(null)} className="flex-1 py-2 rounded-lg text-xs" style={{ background: COLORS.surfaceLight, color: COLORS.textMuted }}>Batal</button>
                      <button onClick={confirmProduce} className="flex-1 py-2 rounded-lg text-xs font-medium" style={{ background: COLORS.primary, color: COLORS.text }}>Konfirmasi Produksi</button>
                    </div>
                  </div>
                )}
              </div>
            );
          }

          // sub === 'pizza'
          const low = isMenuLow(item, rawMaterials, baseStock);
          const makeable = item.recipeBased ? computeMakeablePortions(item.recipe, rawMaterials, baseStock) : null;
          const hpp = menuHpp(item, rawMaterials, baseStock);
          const margin = (item.sellingPrice || 0) - hpp;
          return (
            <div key={item.id} className="rounded-xl px-3.5 py-3" style={{ background: COLORS.surface, border: `1px solid ${low ? COLORS.warning + '66' : COLORS.border}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate" style={{ color: COLORS.text }}>{item.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: COLORS.surfaceLight, color: COLORS.textMuted }}>{item.category || 'Lainnya'}</span>
                    {item.recipeBased && <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5" style={{ background: COLORS.surfaceLight, color: COLORS.secondary }}><ChefHat className="w-2.5 h-2.5" /> Resep</span>}
                  </div>
                  <p className="text-[11px]" style={{ color: COLORS.textMuted }}>
                    Jual: {rupiah(item.sellingPrice)} · HPP: {rupiah(hpp)} · <span style={{ color: margin >= 0 ? COLORS.secondary : COLORS.primaryLight }}>Margin: {rupiah(margin)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canReorder && <ReorderButtons index={idx} total={list.length} onMoveUp={() => moveItem(idx, -1)} onMoveDown={() => moveItem(idx, 1)} />}
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded-md" style={{ color: COLORS.textMuted }}><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(item.id)} className="p-1.5 rounded-md" style={{ color: COLORS.primaryLight }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {!item.recipeBased ? (
                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => adjust(item, -1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COLORS.surfaceLight, color: COLORS.text }}><Minus className="w-3.5 h-3.5" /></button>
                    <span className="text-base font-semibold w-16 text-center font-display" style={{ color: low ? COLORS.warning : COLORS.text }}>{item.currentStock} {item.unit}</span>
                    <button onClick={() => adjust(item, 1)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: COLORS.surfaceLight, color: COLORS.text }}><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  {low && <AlertTriangle className="w-4 h-4" style={{ color: COLORS.warning }} />}
                </div>
              ) : (
                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-sm" style={{ color: COLORS.textMuted }}>Bisa dibuat: <span className="font-display font-semibold" style={{ color: low ? COLORS.warning : COLORS.text }}>{makeable} {item.unit || 'porsi'}</span></span>
                  {low && <AlertTriangle className="w-4 h-4" style={{ color: COLORS.warning }} />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!form && (
        <button onClick={openNew} className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.surfaceLight, color: COLORS.text, border: `1px dashed ${COLORS.border}` }}>
          <Plus className="w-4 h-4" /> Tambah {sub === 'bahan' ? 'Bahan Baku' : sub === 'base' ? 'Base' : 'Menu'}
        </button>
      )}

      {form && (
        <Card>
          <SectionLabel>{form.editingId ? 'Edit Item' : 'Item Baru'}</SectionLabel>
          <div className="space-y-2.5">
            <Field label="Nama">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={sub === 'bahan' ? 'Contoh: Tepung Terigu' : sub === 'base' ? 'Contoh: Base Pizza' : 'Contoh: Chicken Sausage Party'} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} />
            </Field>

            {sub === 'pizza' && (
              <Field label="Kategori">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }}>
                  {CATEGORIES.map((c) => <option key={c} value={c} style={{ background: COLORS.surface }}>{c}</option>)}
                </select>
              </Field>
            )}

            <Field label="Satuan">
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={sub === 'bahan' ? 'gram / ml / pcs' : 'pcs / porsi'} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} />
            </Field>
            {sub === 'bahan' && <p className="text-[10px] px-1 -mt-1.5" style={{ color: COLORS.textMuted }}>Pakai satuan sekecil mungkin (mis. gram) kalau bahan ini dipakai di resep Base — supaya presisi tanpa konversi.</p>}

            {sub === 'bahan' && (
              <div className="grid grid-cols-3 gap-2.5">
                <Field label="Stok Saat Ini"><input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
                <Field label="Stok Minimum"><input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
                <Field label="Harga Beli"><input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
              </div>
            )}

            {sub === 'base' && (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  <Field label="Stok Saat Ini"><input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
                  <Field label="Stok Minimum"><input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
                  <Field label="Hasil/Resep"><input type="number" value={form.yieldQty} onChange={(e) => setForm({ ...form, yieldQty: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
                </div>
                <SectionLabel>Resep (dari Bahan Baku)</SectionLabel>
                <div className="space-y-2">
                  {form.recipe.length === 0 && <p className="text-xs px-1" style={{ color: COLORS.textMuted }}>Belum ada bahan di resep ini.</p>}
                  {form.recipe.map((row) => (
                    <div key={row.rowId} className="flex items-center gap-2">
                      <select value={row.rawMaterialId} onChange={(e) => updateBaseRecipeRow(row.rowId, 'rawMaterialId', e.target.value)} className="flex-1 min-w-0 rounded-lg px-2 py-2 text-sm border" style={{ background: COLORS.bg, borderColor: COLORS.border, color: COLORS.text }}>
                        <option value="" style={{ background: COLORS.surface }}>Pilih bahan baku</option>
                        {rawMaterials.map((rm) => <option key={rm.id} value={rm.id} style={{ background: COLORS.surface }}>{rm.name} ({rm.unit})</option>)}
                      </select>
                      <input type="number" value={row.qty} onChange={(e) => updateBaseRecipeRow(row.rowId, 'qty', e.target.value)} placeholder="Qty" className="w-20 rounded-lg px-2 py-2 text-sm border" style={{ background: COLORS.bg, borderColor: COLORS.border, color: COLORS.text }} />
                      <button onClick={() => removeBaseRecipeRow(row.rowId)} style={{ color: COLORS.textMuted }}><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
                {rawMaterials.length === 0 && <p className="text-xs px-1" style={{ color: COLORS.warning }}>Belum ada bahan baku — tambahkan dulu di tab Bahan Baku.</p>}
                <button onClick={addBaseRecipeRow} className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.surfaceLight, color: COLORS.text, border: `1px dashed ${COLORS.border}` }}><Plus className="w-3.5 h-3.5" /> Tambah Bahan</button>
                <div className="rounded-lg px-3 py-2 text-xs flex items-center justify-between" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <span style={{ color: COLORS.textMuted }}>Biaya total/resep: {rupiah(previewBaseBatchCost)}</span>
                  <span style={{ color: COLORS.text }}>Biaya/{form.unit || 'pcs'}: {rupiah(previewBaseUnitCost)}</span>
                </div>
              </>
            )}

            {sub === 'pizza' && (
              <>
                <Field label="Harga Jual"><input type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
                <button type="button" onClick={() => setForm({ ...form, recipeBased: !form.recipeBased })} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm" style={{ borderColor: COLORS.border, background: form.recipeBased ? 'rgba(122,154,87,0.12)' : COLORS.bg }}>
                  <span className="flex items-center gap-1.5" style={{ color: COLORS.text }}><ChefHat className="w-4 h-4" /> Item ini dibuat dari resep</span>
                  <span className="w-9 h-5 rounded-full relative transition-colors" style={{ background: form.recipeBased ? COLORS.secondary : COLORS.border }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: form.recipeBased ? '18px' : '2px' }} />
                  </span>
                </button>

                {form.recipeBased ? (
                  <>
                    <div className="space-y-2">
                      {form.recipe.length === 0 && <p className="text-xs px-1" style={{ color: COLORS.textMuted }}>Belum ada bahan di resep ini.</p>}
                      {form.recipe.map((row) => {
                        const options = row.sourceType === 'base' ? baseStock : rawMaterials;
                        return (
                          <div key={row.rowId} className="rounded-lg p-2 border space-y-1.5" style={{ borderColor: COLORS.border, background: COLORS.bg }}>
                            <div className="flex items-center gap-2">
                              <select value={row.sourceType} onChange={(e) => updateMenuRecipeRow(row.rowId, 'sourceType', e.target.value)} className="rounded-lg px-2 py-1.5 text-xs border shrink-0" style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.text }}>
                                <option value="raw">Bahan Baku</option>
                                <option value="base">Base</option>
                              </select>
                              <select value={row.sourceId} onChange={(e) => updateMenuRecipeRow(row.rowId, 'sourceId', e.target.value)} className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs border" style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.text }}>
                                <option value="" style={{ background: COLORS.surface }}>Pilih item</option>
                                {options.map((o) => <option key={o.id} value={o.id} style={{ background: COLORS.surface }}>{o.name} ({o.unit})</option>)}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                              <input type="number" value={row.qty} onChange={(e) => updateMenuRecipeRow(row.rowId, 'qty', e.target.value)} placeholder="Qty" className="flex-1 rounded-lg px-2 py-1.5 text-xs border" style={{ background: COLORS.surface, borderColor: COLORS.border, color: COLORS.text }} />
                              <button onClick={() => removeMenuRecipeRow(row.rowId)} style={{ color: COLORS.textMuted }}><X className="w-4 h-4" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={addMenuRecipeRow} className="w-full py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.surfaceLight, color: COLORS.text, border: `1px dashed ${COLORS.border}` }}><Plus className="w-3.5 h-3.5" /> Tambah Bahan</button>
                    <Field label="Stok Minimum (porsi, untuk alert)"><input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
                    <div className="rounded-lg px-3 py-2 text-xs flex items-center justify-between" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                      <span style={{ color: COLORS.textMuted }}>HPP per porsi: {rupiah(previewMenuHpp)}</span>
                      <span style={{ color: previewSell - previewMenuHpp >= 0 ? COLORS.secondary : COLORS.primaryLight }}>Margin: {rupiah(previewSell - previewMenuHpp)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2.5">
                      <Field label="Stok Saat Ini"><input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
                      <Field label="Stok Minimum"><input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
                      <Field label="Harga Beli"><input type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
                    </div>
                    <div className="rounded-lg px-3 py-2 text-xs flex items-center justify-between" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                      <span style={{ color: COLORS.textMuted }}>HPP: {rupiah(parseFloat(form.purchasePrice) || 0)}</span>
                      <span style={{ color: previewSell - (parseFloat(form.purchasePrice) || 0) >= 0 ? COLORS.secondary : COLORS.primaryLight }}>Margin: {rupiah(previewSell - (parseFloat(form.purchasePrice) || 0))}</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2 mt-3.5">
            <button onClick={() => setForm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: COLORS.surfaceLight, color: COLORS.textMuted }}>Batal</button>
            <button onClick={submitForm} className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.primary, color: COLORS.text }}><Check className="w-4 h-4" /> Simpan</button>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ---------------- PENJUALAN TAB ---------------- */
function PenjualanTab({ rawMaterials, baseStock, finishedStock, salesRecords, channels, onSaveSales, onSaveFinished, onSaveRaw, onSaveBase, onSaveChannels }) {
  const [date, setDate] = useState(todayISO());
  const [channel, setChannel] = useState('');
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [showManageChannels, setShowManageChannels] = useState(false);
  const [items, setItems] = useState([{ id: genId(), name: '', qty: '', price: '' }]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!channel && channels.length > 0) setChannel(channels[0].name);
  }, [channels, channel]);

  useEffect(() => {
    if (!channel) return;
    const existing = salesRecords.find((r) => r.date === date && r.channel === channel);
    if (existing) {
      setItems(existing.items.map((i) => ({ id: genId(), name: i.name, qty: String(i.qty), price: String(i.price) })));
      setNotes(existing.notes || '');
    } else {
      setItems([{ id: genId(), name: '', qty: '', price: '' }]);
      setNotes('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, channel]);

  const addChannel = () => {
    if (!newChannelName.trim()) return;
    const name = newChannelName.trim();
    onSaveChannels([...channels, { id: genId(), name }]);
    setChannel(name);
    setNewChannelName('');
    setShowNewChannel(false);
  };
  const removeChannel = (id) => onSaveChannels(channels.filter((c) => c.id !== id));

  const findMenu = (name) => finishedStock.find((f) => f.name.trim().toLowerCase() === name.trim().toLowerCase());

  const updateItem = (id, field, value) => {
    setItems(items.map((i) => {
      if (i.id !== id) return i;
      const next = { ...i, [field]: value };
      if (field === 'name' && i.price === '') {
        const match = findMenu(value);
        if (match && match.sellingPrice) next.price = String(match.sellingPrice);
      }
      return next;
    }));
  };
  const addRow = () => setItems([...items, { id: genId(), name: '', qty: '', price: '' }]);
  const removeRow = (id) => setItems(items.filter((i) => i.id !== id));

  const total = items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0), 0);
  const estHpp = items.reduce((s, i) => {
    const match = findMenu(i.name || '');
    const hpp = match ? menuHpp(match, rawMaterials, baseStock) : 0;
    return s + (parseFloat(i.qty) || 0) * hpp;
  }, 0);

  const save = () => {
    if (!channel) return;
    const cleanItems = items
      .filter((i) => i.name.trim() && parseFloat(i.qty) > 0)
      .map((i) => {
        const match = findMenu(i.name);
        const hpp = match ? menuHpp(match, rawMaterials, baseStock) : 0;
        return { name: i.name.trim(), qty: parseFloat(i.qty) || 0, price: parseFloat(i.price) || 0, hpp };
      });
    if (cleanItems.length === 0) return;

    const prevRecord = salesRecords.find((r) => r.date === date && r.channel === channel);
    const totalRevenue = cleanItems.reduce((s, i) => s + i.qty * i.price, 0);
    const totalHpp = cleanItems.reduce((s, i) => s + i.qty * i.hpp, 0);
    const record = { id: prevRecord ? prevRecord.id : genId(), date, channel, items: cleanItems, total: totalRevenue, hpp: totalHpp, margin: totalRevenue - totalHpp, notes: notes.trim(), updatedAt: new Date().toISOString() };
    const nextRecords = prevRecord ? salesRecords.map((r) => (r.id === prevRecord.id ? record : r)) : [...salesRecords, record];
    onSaveSales(nextRecords);

    const prevQty = {};
    (prevRecord ? prevRecord.items : []).forEach((i) => { const key = i.name.trim().toLowerCase(); prevQty[key] = (prevQty[key] || 0) + i.qty; });
    const newQty = {};
    cleanItems.forEach((i) => { const key = i.name.toLowerCase(); newQty[key] = (newQty[key] || 0) + i.qty; });
    const names = new Set([...Object.keys(prevQty), ...Object.keys(newQty)]);

    let nextFinished = finishedStock;
    const rawDeltaMap = {};
    const baseDeltaMap = {};

    names.forEach((key) => {
      const delta = (newQty[key] || 0) - (prevQty[key] || 0);
      if (delta === 0) return;
      const match = finishedStock.find((f) => f.name.trim().toLowerCase() === key);
      if (!match) return;
      if (match.recipeBased) {
        (match.recipe || []).forEach((ing) => {
          const type = ingSourceType(ing);
          const id = ingSourceId(ing);
          if (type === 'base') baseDeltaMap[id] = (baseDeltaMap[id] || 0) + ing.qty * delta;
          else rawDeltaMap[id] = (rawDeltaMap[id] || 0) + ing.qty * delta;
        });
      } else {
        nextFinished = nextFinished.map((f) => (f.id === match.id ? { ...f, currentStock: Math.max(0, f.currentStock - delta) } : f));
      }
    });

    if (nextFinished !== finishedStock) onSaveFinished(nextFinished);
    if (Object.keys(rawDeltaMap).length > 0) {
      onSaveRaw(rawMaterials.map((rm) => (rawDeltaMap[rm.id] ? { ...rm, currentStock: Math.max(0, rm.currentStock - rawDeltaMap[rm.id]) } : rm)));
    }
    if (Object.keys(baseDeltaMap).length > 0) {
      onSaveBase(baseStock.map((b) => (baseDeltaMap[b.id] ? { ...b, currentStock: Math.max(0, b.currentStock - baseDeltaMap[b.id]) } : b)));
    }
  };

  const existingForDate = salesRecords.find((r) => r.date === date && r.channel === channel);

  return (
    <div className="space-y-4">
      <Card>
        <SectionLabel>Channel Penjualan</SectionLabel>
        {channels.length === 0 && !showNewChannel && (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: COLORS.warning }}>Belum ada channel — tambahkan dulu.</p>
            <button onClick={() => setShowNewChannel(true)} className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.surfaceLight, color: COLORS.text, border: `1px dashed ${COLORS.border}` }}>
              <Plus className="w-4 h-4" /> Tambah Channel
            </button>
          </div>
        )}
        {channels.length > 0 && !showNewChannel && (
          <select value={channel} onChange={(e) => (e.target.value === '__new__' ? setShowNewChannel(true) : setChannel(e.target.value))} className="w-full bg-transparent outline-none text-sm py-1" style={{ color: COLORS.text }}>
            {channels.map((c) => <option key={c.id} value={c.name} style={{ background: COLORS.surface }}>{c.name}</option>)}
            <option value="__new__" style={{ background: COLORS.surface }}>+ Tambah channel baru...</option>
          </select>
        )}
        {showNewChannel && (
          <div className="flex items-center gap-2">
            <input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="Nama channel (mis. Outlet HO)" className="flex-1 rounded-lg px-3 py-2 text-sm border" style={{ background: COLORS.bg, borderColor: COLORS.border, color: COLORS.text }} />
            <button onClick={addChannel} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: COLORS.primary, color: COLORS.text }}>Tambah</button>
            {channels.length > 0 && <button onClick={() => setShowNewChannel(false)} style={{ color: COLORS.textMuted }}><X className="w-4 h-4" /></button>}
          </div>
        )}
        {channels.length > 0 && (
          <button onClick={() => setShowManageChannels(!showManageChannels)} className="text-[11px] mt-2" style={{ color: COLORS.textMuted }}>{showManageChannels ? 'Tutup' : 'Kelola channel'}</button>
        )}
        {showManageChannels && (
          <div className="mt-2 space-y-1.5 pt-2 border-t" style={{ borderColor: COLORS.border }}>
            {channels.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-xs">
                <span style={{ color: COLORS.text }}>{c.name}</span>
                <button onClick={() => removeChannel(c.id)} style={{ color: COLORS.primaryLight }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionLabel>Tanggal</SectionLabel>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-transparent outline-none text-sm py-1" style={{ color: COLORS.text, colorScheme: 'dark' }} />
        {existingForDate && <p className="text-[11px] mt-1.5" style={{ color: COLORS.warning }}>Tanggal + channel ini sudah ada catatan — akan ditimpa (edit) saat disimpan.</p>}
      </Card>

      <div>
        <SectionLabel>Item Terjual</SectionLabel>
        <div className="space-y-2">
          {items.map((item) => {
            const subtotal = (parseFloat(item.qty) || 0) * (parseFloat(item.price) || 0);
            const match = findMenu(item.name || '');
            return (
              <div key={item.id} className="rounded-xl p-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                <div className="flex items-center gap-2 mb-2">
                  <input value={item.name} onChange={(e) => updateItem(item.id, 'name', e.target.value)} list="pizza-names" placeholder="Nama item (pizza / minuman / lainnya)" className="flex-1 bg-transparent outline-none text-sm min-w-0" style={{ color: COLORS.text }} />
                  <button onClick={() => removeRow(item.id)} style={{ color: COLORS.textMuted }}><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-3 gap-2 items-end">
                  <Field label="Qty"><input type="number" value={item.qty} onChange={(e) => updateItem(item.id, 'qty', e.target.value)} className="w-full bg-transparent outline-none text-sm py-1.5" style={{ color: COLORS.text }} /></Field>
                  <Field label="Harga satuan"><input type="number" value={item.price} onChange={(e) => updateItem(item.id, 'price', e.target.value)} className="w-full bg-transparent outline-none text-sm py-1.5" style={{ color: COLORS.text }} /></Field>
                  <div className="text-right pb-1.5"><p className="text-[10px]" style={{ color: COLORS.textMuted }}>Subtotal</p><p className="text-sm font-semibold font-display" style={{ color: COLORS.secondary }}>{rupiah(subtotal)}</p></div>
                </div>
                {!match && item.name.trim() && <p className="text-[10px] mt-1.5" style={{ color: COLORS.warning }}>Tidak cocok dengan menu manapun — HPP dianggap Rp0.</p>}
              </div>
            );
          })}
        </div>
        <datalist id="pizza-names">{finishedStock.map((f) => <option key={f.id} value={f.name} />)}</datalist>
        <button onClick={addRow} className="w-full mt-2 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.surfaceLight, color: COLORS.text, border: `1px dashed ${COLORS.border}` }}><Plus className="w-4 h-4" /> Tambah Item</button>
      </div>

      <Card>
        <SectionLabel>Catatan (opsional)</SectionLabel>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contoh: hujan deras, order sepi" className="w-full bg-transparent outline-none text-sm py-1" style={{ color: COLORS.text }} />
      </Card>

      <div className="rounded-2xl px-4 py-3.5 space-y-1.5" style={{ background: COLORS.primary }}>
        <div className="flex items-center justify-between"><span className="text-sm font-medium" style={{ color: COLORS.text }}>Total Omzet</span><span className="font-display text-lg font-semibold" style={{ color: COLORS.text }}>{rupiah(total)}</span></div>
        <div className="flex items-center justify-between text-xs" style={{ color: 'rgba(242,233,220,0.85)' }}><span>Estimasi HPP: {rupiah(estHpp)}</span><span>Estimasi Laba: {rupiah(total - estHpp)}</span></div>
      </div>

      <button onClick={save} disabled={!channel} className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: COLORS.secondary, color: COLORS.bg }}><Save className="w-4 h-4" /> Simpan Rekap Hari Ini</button>
    </div>
  );
}

/* ---------------- RIWAYAT TAB ---------------- */
function RiwayatTab({ salesRecords, onSaveSales, onResetAll }) {
  const [expanded, setExpanded] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const sorted = [...salesRecords].sort((a, b) => (a.date === b.date ? (a.channel || '').localeCompare(b.channel || '') : a.date < b.date ? 1 : -1));

  const remove = (id) => { onSaveSales(salesRecords.filter((r) => r.id !== id)); if (expanded === id) setExpanded(null); };

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <Card><p className="text-sm" style={{ color: COLORS.textMuted }}>Belum ada riwayat penjualan.</p></Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => {
            const isOpen = expanded === r.id;
            const margin = getMargin(r);
            return (
              <div key={r.id} className="rounded-xl overflow-hidden" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                <button onClick={() => setExpanded(isOpen ? null : r.id)} className="w-full flex items-center justify-between px-3.5 py-3">
                  <div className="text-left"><p className="text-sm font-medium" style={{ color: COLORS.text }}>{fmtDate(r.date)}</p><p className="text-[11px]" style={{ color: COLORS.textMuted }}>{r.channel ? `${r.channel} · ` : ''}{r.items.length} jenis item</p></div>
                  <div className="text-right"><p className="font-display text-sm font-semibold" style={{ color: COLORS.text }}>{rupiah(r.total)}</p><p className="text-[11px]" style={{ color: COLORS.secondary }}>Laba: {rupiah(margin)}</p></div>
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
                    <button onClick={() => remove(r.id)} className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: COLORS.primaryLight }}><Trash2 className="w-3.5 h-3.5" /> Hapus catatan ini</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="pt-4 border-t" style={{ borderColor: COLORS.border }}>
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)} className="text-xs" style={{ color: COLORS.textMuted }}>Hapus semua data (stok & riwayat)</button>
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

/* ---------------- AFFILIATE TAB (Nama Afiliator + Rekap Komisi Mingguan) ---------------- */
function AffiliateTab({ affiliates, affiliateSales, onSaveAffiliates, onSaveAffiliateSales }) {
  const [affForm, setAffForm] = useState(null); // { editingId, name }
  const [entry, setEntry] = useState({ affiliateId: '', date: todayISO(), boxQty: '', combined: false });
  const [expandedWeek, setExpandedWeek] = useState(null);

  const openNewAff = () => setAffForm({ editingId: null, name: '' });
  const openEditAff = (a) => setAffForm({ editingId: a.id, name: a.name });
  const submitAff = () => {
    if (!affForm.name.trim()) return;
    const payload = { id: affForm.editingId || genId(), name: affForm.name.trim() };
    onSaveAffiliates(affForm.editingId ? affiliates.map((a) => (a.id === affForm.editingId ? payload : a)) : [...affiliates, payload]);
    setAffForm(null);
  };
  const removeAff = (id) => onSaveAffiliates(affiliates.filter((a) => a.id !== id));

  const previewCommission = computeAffiliateCommission(parseFloat(entry.boxQty) || 0, entry.combined);
  const saveEntry = () => {
    if (!entry.affiliateId || !(parseFloat(entry.boxQty) > 0)) return;
    const boxQty = parseFloat(entry.boxQty) || 0;
    const commission = computeAffiliateCommission(boxQty, entry.combined);
    onSaveAffiliateSales([...affiliateSales, { id: genId(), affiliateId: entry.affiliateId, date: entry.date, boxQty, combined: entry.combined, commission }]);
    setEntry({ affiliateId: entry.affiliateId, date: entry.date, boxQty: '', combined: false });
  };
  const removeEntry = (id) => onSaveAffiliateSales(affiliateSales.filter((e) => e.id !== id));

  const currentWeekStart = weekStartISO(todayISO());
  const weeks = {};
  affiliateSales.forEach((e) => {
    const ws = weekStartISO(e.date);
    if (!weeks[ws]) weeks[ws] = [];
    weeks[ws].push(e);
  });
  const weekKeys = Object.keys(weeks).sort((a, b) => (a < b ? 1 : -1));

  const summarizeWeek = (entries) => {
    const byAff = {};
    entries.forEach((e) => {
      const aff = affiliates.find((a) => a.id === e.affiliateId);
      const name = aff ? aff.name : 'Afiliator dihapus';
      if (!byAff[name]) byAff[name] = { boxQty: 0, commission: 0 };
      byAff[name].boxQty += e.boxQty;
      byAff[name].commission += e.commission;
    });
    return byAff;
  };

  const currentWeekEntries = weeks[currentWeekStart] || [];
  const currentWeekSummary = summarizeWeek(currentWeekEntries);
  const currentWeekTotal = Object.values(currentWeekSummary).reduce((s, v) => s + v.commission, 0);

  return (
    <div className="space-y-4">
      <div>
        <SectionLabel>Minggu Ini · {weekRangeLabel(currentWeekStart)} (dibayar Minggu)</SectionLabel>
        <Card>
          {Object.keys(currentWeekSummary).length === 0 ? (
            <p className="text-sm" style={{ color: COLORS.textMuted }}>Belum ada penjualan afiliator minggu ini.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(currentWeekSummary).map(([name, v]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5" style={{ color: COLORS.text }}><UserCheck className="w-3.5 h-3.5" style={{ color: COLORS.textMuted }} />{name} <span style={{ color: COLORS.textMuted }}>({v.boxQty} box)</span></span>
                  <span className="font-display font-semibold" style={{ color: COLORS.secondary }}>{rupiah(v.commission)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm pt-2 border-t" style={{ borderColor: COLORS.border }}>
                <span className="font-medium" style={{ color: COLORS.text }}>Total Komisi</span>
                <span className="font-display font-semibold" style={{ color: COLORS.text }}>{rupiah(currentWeekTotal)}</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div>
        <SectionLabel>Input Penjualan Afiliator</SectionLabel>
        <Card>
          <div className="space-y-2.5">
            <Field label="Afiliator">
              <select value={entry.affiliateId} onChange={(e) => setEntry({ ...entry, affiliateId: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }}>
                <option value="" style={{ background: COLORS.surface }}>Pilih afiliator</option>
                {affiliates.map((a) => <option key={a.id} value={a.id} style={{ background: COLORS.surface }}>{a.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Tanggal"><input type="date" value={entry.date} onChange={(e) => setEntry({ ...entry, date: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text, colorScheme: 'dark' }} /></Field>
              <Field label="Jumlah Box"><input type="number" value={entry.boxQty} onChange={(e) => setEntry({ ...entry, boxQty: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
            </div>
            <button type="button" onClick={() => setEntry({ ...entry, combined: !entry.combined })} className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm" style={{ borderColor: COLORS.border, background: entry.combined ? 'rgba(122,154,87,0.12)' : COLORS.bg }}>
              <span className="flex items-center gap-1.5" style={{ color: COLORS.text }}><Truck className="w-4 h-4" /> Dikirim sekaligus (+Rp3.000/box)</span>
              <span className="w-9 h-5 rounded-full relative transition-colors" style={{ background: entry.combined ? COLORS.secondary : COLORS.border }}>
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: entry.combined ? '18px' : '2px' }} />
              </span>
            </button>
            <div className="rounded-lg px-3 py-2 text-xs flex items-center justify-between" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
              <span style={{ color: COLORS.textMuted }}>Rp{entry.combined ? '8.000' : '5.000'}/box</span>
              <span style={{ color: COLORS.secondary }}>Komisi: {rupiah(previewCommission)}</span>
            </div>
          </div>
          <button onClick={saveEntry} disabled={!entry.affiliateId || !(parseFloat(entry.boxQty) > 0)} className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: COLORS.secondary, color: COLORS.bg }}>
            <Save className="w-4 h-4" /> Catat Penjualan
          </button>
        </Card>
      </div>

      <div>
        <SectionLabel>Daftar Afiliator</SectionLabel>
        {affiliates.length === 0 && !affForm && <Card><p className="text-sm" style={{ color: COLORS.textMuted }}>Belum ada afiliator tercatat.</p></Card>}
        <div className="space-y-2">
          {affiliates.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-xl px-3.5 py-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
              <p className="text-sm font-medium" style={{ color: COLORS.text }}>{a.name}</p>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEditAff(a)} className="p-1.5 rounded-md" style={{ color: COLORS.textMuted }}><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => removeAff(a.id)} className="p-1.5 rounded-md" style={{ color: COLORS.primaryLight }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
        {!affForm && (
          <button onClick={openNewAff} className="w-full mt-2 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.surfaceLight, color: COLORS.text, border: `1px dashed ${COLORS.border}` }}><Plus className="w-4 h-4" /> Tambah Afiliator</button>
        )}
        {affForm && (
          <Card className="mt-2">
            <SectionLabel>{affForm.editingId ? 'Edit Afiliator' : 'Afiliator Baru'}</SectionLabel>
            <Field label="Nama"><input value={affForm.name} onChange={(e) => setAffForm({ ...affForm, name: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
            <div className="flex gap-2 mt-3.5">
              <button onClick={() => setAffForm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: COLORS.surfaceLight, color: COLORS.textMuted }}>Batal</button>
              <button onClick={submitAff} className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.primary, color: COLORS.text }}><Check className="w-4 h-4" /> Simpan</button>
            </div>
          </Card>
        )}
      </div>

      <div>
        <SectionLabel>Riwayat Mingguan</SectionLabel>
        {weekKeys.length === 0 ? (
          <Card><p className="text-sm" style={{ color: COLORS.textMuted }}>Belum ada riwayat.</p></Card>
        ) : (
          <div className="space-y-2">
            {weekKeys.map((ws) => {
              const isOpen = expandedWeek === ws;
              const summary = summarizeWeek(weeks[ws]);
              const total = Object.values(summary).reduce((s, v) => s + v.commission, 0);
              return (
                <div key={ws} className="rounded-xl overflow-hidden" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
                  <button onClick={() => setExpandedWeek(isOpen ? null : ws)} className="w-full flex items-center justify-between px-3.5 py-3">
                    <span className="text-sm font-medium" style={{ color: COLORS.text }}>{weekRangeLabel(ws)}{ws === currentWeekStart ? ' (minggu ini)' : ''}</span>
                    <span className="font-display text-sm font-semibold" style={{ color: COLORS.secondary }}>{rupiah(total)}</span>
                  </button>
                  {isOpen && (
                    <div className="px-3.5 pb-3.5 border-t space-y-2" style={{ borderColor: COLORS.border }}>
                      {Object.entries(summary).map(([name, v]) => (
                        <div key={name} className="flex items-center justify-between text-sm mt-2">
                          <span style={{ color: COLORS.text }}>{name} <span style={{ color: COLORS.textMuted }}>×{v.boxQty} box</span></span>
                          <span style={{ color: COLORS.textMuted }}>{rupiah(v.commission)}</span>
                        </div>
                      ))}
                      <div className="pt-2 space-y-1">
                        {weeks[ws].map((e) => {
                          const aff = affiliates.find((a) => a.id === e.affiliateId);
                          return (
                            <div key={e.id} className="flex items-center justify-between text-[11px]" style={{ color: COLORS.textMuted }}>
                              <span>{fmtDate(e.date)} · {aff ? aff.name : '-'} · {e.boxQty} box{e.combined ? ' · gabung kirim' : ''}</span>
                              <button onClick={() => removeEntry(e.id)}><Trash2 className="w-3 h-3" /></button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
function KeuanganTab({ employees, targetSettings, salesRecords, onSaveEmployees, onSaveTargetSettings, affiliates, affiliateSales, onSaveAffiliates, onSaveAffiliateSales }) {
  const [sub, setSub] = useState('gaji');
  return (
    <div className="space-y-4">
      <div className="flex rounded-xl p-1" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
        {[{ id: 'gaji', label: 'Target Gaji' }, { id: 'afiliator', label: 'Afiliator' }].map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)} className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors" style={sub === t.id ? { background: COLORS.primary, color: COLORS.text } : { color: COLORS.textMuted }}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === 'gaji' ? (
        <TargetTab employees={employees} targetSettings={targetSettings} salesRecords={salesRecords} onSaveEmployees={onSaveEmployees} onSaveTargetSettings={onSaveTargetSettings} />
      ) : (
        <AffiliateTab affiliates={affiliates} affiliateSales={affiliateSales} onSaveAffiliates={onSaveAffiliates} onSaveAffiliateSales={onSaveAffiliateSales} />
      )}
    </div>
  );
}

/* ---------------- TARGET TAB (Gaji Karyawan + Target Bulanan) ---------------- */
function TargetTab({ employees, targetSettings, salesRecords, onSaveEmployees, onSaveTargetSettings }) {
  const [empForm, setEmpForm] = useState(null); // { editingId, name, salary }
  const [bufferInput, setBufferInput] = useState(String(targetSettings.bufferAmount || ''));

  const t = computeTargetStats(employees, targetSettings.bufferAmount, salesRecords);
  const monthLabel = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const openNewEmp = () => setEmpForm({ editingId: null, name: '', salary: '' });
  const openEditEmp = (e) => setEmpForm({ editingId: e.id, name: e.name, salary: String(e.salary) });
  const submitEmp = () => {
    if (!empForm.name.trim()) return;
    const payload = { id: empForm.editingId || genId(), name: empForm.name.trim(), salary: parseFloat(empForm.salary) || 0 };
    onSaveEmployees(empForm.editingId ? employees.map((e) => (e.id === empForm.editingId ? payload : e)) : [...employees, payload]);
    setEmpForm(null);
  };
  const removeEmp = (id) => onSaveEmployees(employees.filter((e) => e.id !== id));
  const saveBuffer = () => onSaveTargetSettings({ ...targetSettings, bufferAmount: parseFloat(bufferInput) || 0 });

  return (
    <div className="space-y-4">
      <div>
        <SectionLabel>Progress Bulan Ini · {monthLabel}</SectionLabel>
        <Card>
          {t.targetBulanan <= 0 ? (
            <p className="text-sm" style={{ color: COLORS.textMuted }}>Tambahkan karyawan dan/atau buffer di bawah untuk mulai memantau target.</p>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: COLORS.textMuted }}>Target Bulanan</span>
                <span className="text-sm font-display font-semibold" style={{ color: COLORS.text }}>{rupiah(t.targetBulanan)}</span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: COLORS.surfaceLight }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, t.progressPercent)}%`, background: COLORS.secondary }} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: COLORS.textMuted }}>Realisasi: {rupiah(t.realisasi)}</span>
                <span className="font-semibold" style={{ color: COLORS.secondary }}>{t.progressPercent.toFixed(1)}%</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-lg px-3 py-2" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <p className="text-[10px]" style={{ color: COLORS.textMuted }}>Target harian rata-rata</p>
                  <p className="text-sm font-display font-semibold" style={{ color: COLORS.text }}>{rupiah(t.targetHarianRataRata)}</p>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <p className="text-[10px]" style={{ color: COLORS.textMuted }}>Sisa target</p>
                  <p className="text-sm font-display font-semibold" style={{ color: COLORS.text }}>{rupiah(t.sisaTarget)}</p>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <p className="text-[10px]" style={{ color: COLORS.textMuted }}>Butuh/hari (sisa {t.sisaHari} hari)</p>
                  <p className="text-sm font-display font-semibold" style={{ color: COLORS.text }}>{rupiah(t.rataRataDibutuhkan)}</p>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <p className="text-[10px]" style={{ color: COLORS.textMuted }}>Status vs jalur harian</p>
                  <p className="text-sm font-display font-semibold" style={{ color: t.paceDiff >= 0 ? COLORS.secondary : COLORS.warning }}>{t.paceDiff >= 0 ? `+${rupiah(t.paceDiff)}` : `−${rupiah(Math.abs(t.paceDiff))}`}</p>
                </div>
              </div>
              <p className="text-[10px] pt-1" style={{ color: COLORS.textMuted }}>Target dihitung ulang tiap bulan kalender (gajian tanggal 1), dari daftar karyawan + buffer yang aktif saat ini.</p>
            </div>
          )}
        </Card>
      </div>

      <div>
        <SectionLabel>Buffer Biaya Operasional Lain</SectionLabel>
        <Card>
          <p className="text-[11px] mb-2" style={{ color: COLORS.textMuted }}>Perkiraan listrik, gas, sewa, dll di luar gaji — ditambahkan ke Target Bulanan supaya "tercapai" berarti benar-benar cukup, bukan cuma pas-pasan buat gaji.</p>
          <div className="flex items-center gap-2">
            <input type="number" value={bufferInput} onChange={(e) => setBufferInput(e.target.value)} placeholder="0" className="flex-1 rounded-lg px-3 py-2 text-sm border" style={{ background: COLORS.bg, borderColor: COLORS.border, color: COLORS.text }} />
            <button onClick={saveBuffer} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: COLORS.primary, color: COLORS.text }}>Simpan</button>
          </div>
        </Card>
      </div>

      <div>
        <SectionLabel>Daftar Karyawan · Total Gaji: {rupiah(t.totalGaji)}</SectionLabel>
        {employees.length === 0 && !empForm && (
          <Card><p className="text-sm" style={{ color: COLORS.textMuted }}>Belum ada karyawan tercatat.</p></Card>
        )}
        <div className="space-y-2">
          {employees.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-xl px-3.5 py-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: COLORS.text }}>{e.name}</p>
                <p className="text-[11px]" style={{ color: COLORS.textMuted }}>{rupiah(e.salary)}/bulan</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEditEmp(e)} className="p-1.5 rounded-md" style={{ color: COLORS.textMuted }}><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => removeEmp(e.id)} className="p-1.5 rounded-md" style={{ color: COLORS.primaryLight }}><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>

        {!empForm && (
          <button onClick={openNewEmp} className="w-full mt-2 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.surfaceLight, color: COLORS.text, border: `1px dashed ${COLORS.border}` }}>
            <Plus className="w-4 h-4" /> Tambah Karyawan
          </button>
        )}

        {empForm && (
          <Card className="mt-2">
            <SectionLabel>{empForm.editingId ? 'Edit Karyawan' : 'Karyawan Baru'}</SectionLabel>
            <div className="space-y-2.5">
              <Field label="Nama"><input value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
              <Field label="Gaji per Bulan"><input type="number" value={empForm.salary} onChange={(e) => setEmpForm({ ...empForm, salary: e.target.value })} className="w-full bg-transparent outline-none text-sm py-2" style={{ color: COLORS.text }} /></Field>
            </div>
            <div className="flex gap-2 mt-3.5">
              <button onClick={() => setEmpForm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: COLORS.surfaceLight, color: COLORS.textMuted }}>Batal</button>
              <button onClick={submitEmp} className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: COLORS.primary, color: COLORS.text }}><Check className="w-4 h-4" /> Simpan</button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
