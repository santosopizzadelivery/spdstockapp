import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// GANTI SEMUA NILAI DI BAWAH INI dengan config dari Firebase Console kamu:
// Firebase Console -> Project Settings -> General -> Your apps -> SDK setup and configuration
const firebaseConfig = {
  apiKey: 'GANTI_API_KEY',
  authDomain: 'GANTI.firebaseapp.com',
  projectId: 'GANTI',
  storageBucket: 'GANTI.appspot.com',
  messagingSenderId: 'GANTI',
  appId: 'GANTI',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
