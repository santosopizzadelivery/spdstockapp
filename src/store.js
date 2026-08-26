import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Setiap key disimpan sebagai satu dokumen di: users/{uid}/appdata/{key}
// Struktur ini sengaja dipisah per-uid supaya Firestore Security Rules bisa
// membatasi: seorang user cuma bisa baca/tulis dokumen di bawah uid-nya sendiri.

export async function loadKey(uid, key, fallback) {
  try {
    const ref = doc(db, 'users', uid, 'appdata', key);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().value !== undefined) return snap.data().value;
    return fallback;
  } catch (e) {
    console.error('Gagal memuat', key, e);
    return fallback;
  }
}

export async function saveKey(uid, key, value) {
  try {
    const ref = doc(db, 'users', uid, 'appdata', key);
    await setDoc(ref, { value, updatedAt: new Date().toISOString() });
    return true;
  } catch (e) {
    console.error('Gagal menyimpan', key, e);
    return false;
  }
}
