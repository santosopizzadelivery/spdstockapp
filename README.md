# Stok & Rekap Harian — SPD

Aplikasi ini versi "berdiri sendiri" dari aplikasi stok yang sebelumnya dibuat di Claude.
Bedanya: data disimpan di Firebase (bukan di Claude), bisa dibuka dari HP dan laptop dengan
data yang sama, dan cuma bisa diakses pakai 1 akun login yang kamu buat sendiri.

Total waktu setup: kira-kira 20–30 menit, sekali saja. Setelah itu tinggal pakai.

---

## Langkah 1 — Buat project Firebase (gratis)

1. Buka https://console.firebase.google.com, login pakai akun Google kamu.
2. Klik **Add project** → kasih nama bebas, misalnya `spd-stok` → lanjut terus pakai default → **Create project**.

## Langkah 2 — Aktifkan login (Authentication)

1. Di sidebar kiri project Firebase kamu, klik **Build → Authentication** → **Get started**.
2. Di tab **Sign-in method**, klik **Email/Password** → aktifkan (toggle **Enable**) → **Save**.
3. Pindah ke tab **Users** → klik **Add user**.
4. Isi email dan password yang mau kamu pakai untuk login ke aplikasi ini nanti. **Ini satu-satunya akun yang bisa masuk** — catat baik-baik.

## Langkah 3 — Aktifkan database (Firestore)

1. Di sidebar, klik **Build → Firestore Database** → **Create database**.
2. Pilih **Start in production mode** → pilih lokasi server (pilih yang paling dekat, misal `asia-southeast2 (Jakarta)`) → **Enable**.
3. Setelah database dibuat, klik tab **Rules** di atas, hapus semua isinya, ganti dengan isi file `firestore.rules` yang ada di folder project ini → **Publish**.
   Rule ini memastikan hanya akun kamu (uid kamu) yang bisa baca/tulis datanya — sekalipun orang lain tahu link aplikasinya, tanpa email+password yang kamu buat di Langkah 2, mereka tidak akan bisa masuk maupun melihat data.

## Langkah 4 — Ambil config Firebase, masukkan ke kode

1. Di Firebase Console, klik ikon gerigi (⚙️) di sidebar kiri atas → **Project settings**.
2. Scroll ke bagian **Your apps** → klik ikon **</>** (Web) → kasih nickname bebas → **Register app** (tidak perlu centang Firebase Hosting).
3. Firebase akan kasih kode berisi `firebaseConfig = {...}`. Copy nilai-nilainya.
4. Buka file `src/firebase.js` di project ini, ganti semua nilai `GANTI_...` dengan nilai asli dari Firebase kamu.

## Langkah 5 — Push kode ke GitHub

Kalau belum punya akun GitHub, daftar dulu gratis di https://github.com.

Di komputer kamu (folder project ini), jalankan:
```
git init
git add .
git commit -m "Setup awal"
```
Lalu buat repository baru (kosong) di https://github.com/new, dan ikuti instruksi "push an existing repository" yang muncul di halaman itu (biasanya berupa 2–3 baris `git remote add origin ...` dan `git push`).

## Langkah 6 — Deploy ke Netlify (gratis)

1. Daftar/login di https://app.netlify.com (bisa langsung pakai akun GitHub kamu).
2. Klik **Add new site → Import an existing project** → pilih **GitHub** → pilih repo yang baru kamu push.
3. Netlify akan otomatis mendeteksi ini project Vite. Pastikan pengaturannya:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Klik **Deploy site**. Tunggu 1–2 menit.
5. Setelah selesai, Netlify kasih URL seperti `https://nama-acak.netlify.app`. Ini alamat aplikasi kamu. Boleh diganti nama subdomain-nya lewat **Site settings → Change site name**.

## Langkah 7 — Pakai aplikasinya

1. Buka URL Netlify tadi dari HP atau laptop.
2. Login pakai email & password yang kamu buat di Langkah 2.
3. Data yang kamu masukkan otomatis tersinkron — buka dari HP atau laptop, hasilnya sama.
4. Di HP: buka lewat Chrome/Safari → menu **"Tambahkan ke Layar Utama" / "Add to Home Screen"** → ikonnya akan muncul seperti aplikasi biasa.

---

## Kalau nanti mau ubah tampilan/fitur

Edit file di folder `src/`, lalu `git add . && git commit -m "..." && git push` — Netlify otomatis build ulang dan update situsnya setiap kali kamu push ke GitHub.

## Troubleshooting

- **"Email atau password salah"**: pastikan user-nya sudah ditambahkan di Langkah 2 tab Users, dan Email/Password provider sudah di-enable.
- **Data tidak muncul / error di console browser soal "permission-denied"**: cek lagi Firestore Rules di Langkah 3, pastikan sudah ter-publish dengan benar.
- **Halaman blank setelah deploy**: cek tab **Deploys** di Netlify, lihat log build-nya — biasanya karena `src/firebase.js` belum diisi config asli.
