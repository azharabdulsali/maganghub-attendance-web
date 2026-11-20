# Jadwal Kerja Mingguan (`/work-schedule`)

> Status: aktif. Bagian dari fitur jadwal kerja per pengguna.

## Apa ini

Setiap pengguna dapat menetapkan sendiri hari mana dalam seminggu ia bekerja.
Sebelum fitur ini, "hari kerja" selalu berarti Senin–Jumat dan dihitung otomatis
dari tanggal. Kini keputusan kirim, kalender, date picker, pengingat, dan panel
admin semuanya mengikuti jadwal masing-masing pengguna.

## Cara pakai

1. Buka **Jadwal Kerja** di menu samping (grup "Persiapan", di bawah
   Kredensial Monev).
2. Centang hari-hari kerja Anda (bisa termasuk Sabtu/Minggu).
3. Simpan. Tombol **Senin–Jumat** mengembalikan pilihan ke bawaan.

## Aturan yang mengikat

- **Penomoran hari ISO-8601**: `1=Senin … 7=Minggu`, tersimpan apa adanya di
  kolom `WorkSchedule.days` (`int[]`, tabel `work_schedules`). Konversi dari
  `getUTCDay()` JS hanya ada di satu tempat (`isoWeekdayOf`).
- **Tidak boleh kosong.** Pengguna tanpa hari kerja berarti laporan tak pernah
  bisa dikirim; jika mau berhenti, matikan otomasi (jangan simpan jadwal
  kosong). Ditegakkan di `workScheduleSchema` (Zod) dan di form.
- **Gagal-lunak wajib.** Bila baris jadwal tidak ada atau DB gagal dibaca,
  perilaku jatuh ke default Senin–Jumat — **bukan** "tanpa hari kerja sama
  sekali" yang diam-diam mematikan manual, cron, dan dispatcher. Pagar ini
  ada di `isWorkDayOf` dan `loadWorkSchedule`, dan diuji di
  `work-schedule.test.ts` + `report-policy.test.ts`.
- **Satu aturan untuk semua pemanggil.** `isHoliday` / `isWorkingDay` /
  `decide()` di `report-policy.ts` menerima `workDays` sebagai argumen opsional;
  jalur kirim (`performSubmit`) memuatnya dari DB dan meneruskannya.
- **Server-only repo.** Akses DB hanya lewat `src/lib/work-schedule-repo.ts`
  (`loadWorkSchedule`, `loadWorkScheduleState`, `saveWorkSchedule`); komponen
  klien menerima data sebagai prop, jangan impor repo dari klien.
- **Jadwal bukan rahasia** — boleh dikembalikan penuh ke klien (beda dari
  password Monev). Body PUT tidak memuat `userId`; selalu dari sesi.
- **Kalender & picker**: tanggal di luar jadwal pengguna ditandai `OFF`
  (bukan lagi `WEEKEND`) di `holidayKindOf`, dan nonaktif di `<DatePicker>`
  lewat prop `workDays` — memakai `isWorkingDay` yang sama dengan jalur kirim.
- **Libur admin & akhir pekan**: sejak ada jadwal per pengguna, admin BOLEH
  mendaftarkan libur pada Sabtu/Minggu (`validateHolidayInput` tidak menolak
  akhir pekan lagi; `<DatePicker unrestricted>` di `/admin/holidays`). Tanpa
  ini, pengguna berjadwal Sabtu tetap dikirim pada libur nasional yang jatuh
  di Sabtu.

## Berkas terkait

| Berkas | Peran |
| :--- | :--- |
| `src/lib/work-schedule.ts` | Aturan murni + label hari (teruji) |
| `src/lib/work-schedule-repo.ts` | Akses DB (server-only, gagal-lunak saat baca) |
| `src/lib/report-policy.ts` | `decide()`/`isHoliday` menerima `workDays` |
| `src/app/api/work-schedule/route.ts` | GET (dengan `exists`) & PUT (rate limit `workSchedule`) |
| `src/app/(app)/work-schedule/` | Halaman + form UI |
| `src/components/ui/date-picker.tsx` | Prop `workDays` + `unrestricted` |

## Prasyarat deploy

Model `WorkSchedule` ada di `prisma/schema.prisma`; jalankan
`npm run db:push` (membuat tabel `work_schedules`) **sebelum** deploy kode yang
memakainya. Tanpa itu, semua pembacaan jatuh gagal-lunak ke Senin–Jumat dan
penyimpanan jadwal gagal dengan pesan ramah.
