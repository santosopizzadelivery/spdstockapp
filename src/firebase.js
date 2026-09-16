import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// GANTI SEMUA NILAI DI BAWAH INI dengan config dari Firebase Console kamu:
// Firebase Console -> Project Settings -> General -> Your apps -> SDK setup and configuration
const firebaseConfig = {
  apiKey: AIzaSyBumPcPd5UTrPS9Gvv5tHyL5EGKCFx36Ds,
  authDomain: spd-daily.firebaseapp.com,
  projectId: spd-dail,
  storageBucket: spd-daily.firebasestorage.app,
  messagingSenderId: 703651117945,
  appId: 1:703651117945:web:af0a84c389ba4e684acda8,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
