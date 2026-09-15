import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';

export async function uploadProductImage(uid, itemId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `products/${uid}/${itemId}-${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

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
