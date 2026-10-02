// src/lib/guides.ts: satu sumber kebenaran untuk artikel panduan publik
// (audit C-1). Dipakai DUA tempat sekaligus:
//   1. halaman /panduan dan /panduan/[slug] (isi yang dibaca pengguna);
//   2. JSON-LD Article/HowTo yang dirender dari data yang SAMA.
//
// Kenapa satu file data, bukan JSX langsung di halaman: supaya metadata
// (title/description/date/slug) dan isi yang terlihat mustahil berbeda. Ini
// prinsip yang sama dengan FAQ_ITEMS di site.ts, yang dipakai bersama oleh
// tampilan dan schema FAQPage.
//
// ATURAN ISI (lihat ai-writing-detection.md):
//   - Hanya menulis fakta yang ada di kode aplikasi ini. Angka yang disebut
//     (100 karakter, 5000 karakter, 30 hari, 6 jam) bisa ditelusuri ke
//     report-rules.ts, validate.ts, dan docs/MONEV-API.md.
//   - Tidak menyebut fitur yang tidak ada (AI, integrasi GitHub, ekstensi
//     browser).
//   - Bahasa lugas, tanpa pembuka basa-basi, tanpa em dash dekoratif.
//   - Menyebut batasan secara jujur, termasuk bahwa laporan tetap ditulis
//     oleh pengguna, bukan oleh aplikasi.

export type GuideBlock =
  | { jenis: "paragraf"; teks: string }
  | { jenis: "daftar"; judul?: string; item: readonly string[] }
  | { jenis: "langkah"; judul: string; item: readonly string[] }
  | { jenis: "catatan"; judul: string; teks: string }
  | { jenis: "tabel"; kepala: readonly string[]; baris: readonly (readonly string[])[] }
  | {
      /** Tangkapan layar langkah, dengan teks alt deskriptif (wajib). */
      jenis: "gambar";
      /** Path publik, mis. "/panduan/devtools-1-buka.webp". */
      src: string;
      /** Teks alt untuk pembaca layar & cadangan bila gambar gagal dimuat. */
      alt: string;
      /** Keterangan singkat di bawah gambar (opsional). */
      keterangan?: string;
      /** Dimensi intrinsik agar tata letak tidak melompat saat gambar dimuat. */
      lebar: number;
      tinggi: number;
    };

export type GuideSection = {
  id: string;
  judul: string;
  blok: readonly GuideBlock[];
};

export type Guide = {
  /** Segmen URL: /panduan/<slug>. Hanya huruf kecil dan tanda hubung. */
  slug: string;
  /** Judul artikel, dipakai sebagai <h1> dan judul dokumen. */
  judul: string;
  /** Ringkasan untuk kartu hub dan meta description (idealnya < 155 kar.). */
  ringkas: string;
  /** Tanggal terbit, format ISO supaya bisa dipakai di JSON-LD datePublished. */
  terbit: string;
  /** Perkiraan waktu baca, dihitung kasar dari jumlah kata. */
  menitBaca: number;
  /** Kata kunci pencarian utama yang dijawab artikel ini. */
  kataKunci: readonly string[];
  /**
   * Judul halaman langkah demi langkah untuk JSON-LD HowTo. Hanya artikel
   * yang memang berbentuk langkah berurutan yang mengisinya; sisanya
   * dirender sebagai Article biasa.
   */
  howTo?: string;
  section: readonly GuideSection[];
};

export const GUIDES: readonly Guide[] = [
  {
    slug: "cara-absensi-monev-maganghub",
    judul: "Cara Absensi Monev MagangHub Kemnaker: Alur Lengkap",
    ringkas:
      "Urutan langkah dari menyiapkan template sampai laporan terkirim ke portal Monev, tanpa mengetik ulang tiap hari.",
    terbit: "2026-02-05",
    menitBaca: 7,
    kataKunci: [
      "cara absensi maganghub kemnaker",
      "absensi monev magang",
      "laporan harian magang kemnaker",
      "presensi magang online",
    ],
    howTo: "Cara absensi Monev MagangHub Kemnaker",
    section: [
      {
        id: "ringkasan-alur",
        judul: "Alur singkat",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Portal Monev MagangHub Kemnaker meminta kehadiran harian " +
              "beserta tiga kolom laporan: Uraian Aktivitas, Pembelajaran, " +
              "dan Kendala. Isinya tetap Anda yang menulis. Yang " +
              "diotomatiskan hanyalah pengulangan: teks yang sama disusun " +
              "ulang dan dikirim pada tanggal yang benar, tanpa Anda buka " +
              "portal tiap hari.",
          },
          {
            jenis: "langkah",
            judul: "Empat langkah besar",
            item: [
              "Daftar akun aplikasi, lalu login ke dashboard.",
              "Simpan email dan password Monev Anda di menu Kredensial.",
              "Isi tiga kolom template laporan sekali, masing-masing minimal 100 karakter.",
              "Kirim manual satu klik, atau nyalakan jadwal otomatis.",
            ],
          },
          {
            jenis: "paragraf",
            teks:
              "Setelah template tersimpan, aktivitas harian Anda hanya dua " +
              "hal: mengecek Riwayat, dan mengubah isi template bila kegiatan " +
              "Anda berubah. Sisanya berjalan sendiri.",
          },
        ],
      },
      {
        id: "simpan-kredensial",
        judul: "1. Simpan kredensial Monev",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Buka menu Kredensial dan masukkan email serta password akun " +
              "MagangHub Kemnaker Anda. Kredensial ini dipakai aplikasi untuk " +
              "login ke portal atas nama Anda saat mengirim laporan, jadi " +
              "harus benar dan harus bisa dipakai ulang. Bukan kata sandi " +
              "akun aplikasi ini.",
          },
          {
            jenis: "paragraf",
            teks:
              "Karena itu kata sandi Monev tidak di-hash seperti kata sandi " +
              "biasa, melainkan dienkripsi dua arah dengan AES-256-GCM. Ada " +
              "konsekuensi jujur yang perlu Anda tahu: enkripsi dua arah " +
              "berarti pengelola yang memegang kunci secara teknis mampu " +
              "membukanya. Karena itu jangan memakai kata sandi yang juga " +
              "dipakai di layanan lain.",
          },
          {
            jenis: "catatan",
            judul: "Kalau login otomatis gagal",
            teks:
              "Ada jalur cadangan: menempel cookie sesi (token) dari browser " +
              "secara manual. Langkahnya dibahas terpisah di panduan " +
              "mengambil token Monev.",
          },
        ],
      },
      {
        id: "isi-template",
        judul: "2. Isi tiga kolom template",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Buka menu Template Laporan. Di sana ada tiga kolom tetap yang " +
              "sama seperti portal: Uraian Aktivitas, Pembelajaran, dan " +
              "Kendala. Tulis isinya sekali, simpan, lalu dipakai ulang " +
              "setiap hari.",
          },
          {
            jenis: "daftar",
            judul: "Aturan panjang yang harus dipenuhi",
            item: [
              "Setiap kolom minimal 100 karakter setelah spasi di tepi dipangkas. Angka ini aturan portal, bukan selera aplikasi.",
              "Setiap kolom maksimal 5000 karakter, mengikuti batas textarea portal.",
              "Anda bisa memakai placeholder seperti {tanggal} supaya laporan tidak terlihat sama persis setiap hari.",
            ],
          },
          {
            jenis: "paragraf",
            teks:
              "Penghitung karakter tampil langsung saat Anda mengetik. Ini " +
              "disengaja: aturan 100 karakter milik portal, dan Anda " +
              "sebaiknya tahu sebelum menekan Simpan, bukan sesudah " +
              "pengiriman gagal.",
          },
        ],
      },
      {
        id: "pilih-cara-kirim",
        judul: "3. Pilih cara pengiriman",
        blok: [
          {
            jenis: "tabel",
            kepala: ["Cara", "Kapan dipakai", "Yang Anda lakukan"],
            baris: [
              [
                "Manual satu klik",
                "Saat ingin memeriksa dulu isinya",
                "Tekan Kirim di dashboard",
              ],
              [
                "Terjadwal (otomatis)",
                "Saat laporan rutin tiap sore",
                "Nyalakan sakelar Otomasi",
              ],
            ],
          },
          {
            jenis: "paragraf",
            teks:
              "Mode manual adalah bawaan. Mode terjadwal bersifat opsional " +
              "dan bisa dimatikan kapan saja. Keduanya mengirim ke portal " +
              "langsung dari server aplikasi, jadi tidak ada browser yang " +
              "perlu dibuka dan tidak ada ekstensi yang perlu dipasang.",
          },
          {
            jenis: "catatan",
            judul: "Satu hari, satu kali",
            teks:
              "Jangan mengirim dua kali untuk tanggal yang sama. Portal akan " +
              "menolak pengiriman kedua dengan status presensi sudah ada. " +
              "Pilih satu cara per hari: manual atau terjadwal, bukan " +
              "keduanya.",
          },
        ],
      },
      {
        id: "periksa-riwayat",
        judul: "4. Periksa Riwayat",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Menu Riwayat mencatat setiap percobaan kirim, termasuk yang " +
              "gagal dan yang ditolak karena sudah ada. Catatan ini yang " +
              "menjadi kebenaran sebenarnya, bukan tebakan. Tiga status yang " +
              "akan Anda temui: terkirim, sudah ada, dan gagal.",
          },
          {
            jenis: "paragraf",
            teks:
              "Kebiasaan yang berguna: cek Riwayat setiap sore setelah jadwal " +
              "otomatis berjalan, supaya absensi tidak pernah terlewat tanpa " +
              "Anda sadari. Kalau ada yang gagal, langkah penanganannya " +
              "dibahas di panduan mengatasi error pengiriman.",
          },
        ],
      },
      {
        id: "batasan",
        judul: "Apa yang tidak dilakukan aplikasi ini",
        blok: [
          {
            jenis: "daftar",
            item: [
              "Tidak menulis laporan menggantikan Anda. Isi template tetap dari Anda.",
              "Tidak menembus proteksi portal. Kalau portal membalas terlarang, pesannya ditampilkan apa adanya, tanpa memalsukan identitas atau memakai proxy.",
              "Tidak menjamin pengiriman bila portal Monev berubah. Bila itu terjadi, Anda tetap bisa menyalin isi template dan mengirimnya manual dari situs Monev.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "ambil-token-monev-devtools",
    judul: "Cara Mengambil Token Monev dari DevTools Browser",
    ringkas:
      "Langkah manual menyalin cookie sesi Monev bila login otomatis gagal, plus cara memastikan token yang ditempel benar.",
    terbit: "2026-02-05",
    menitBaca: 6,
    kataKunci: [
      "monev refresh token",
      "ambil token maganghub dari devtools",
      "cookie monev kemnaker",
      "login manual monev",
    ],
    howTo: "Cara mengambil token Monev dari DevTools",
    section: [
      {
        id: "jalur-cepat",
        judul: "Jalur cepat",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Bila Anda sudah paham DevTools, lima langkah ini sudah cukup. " +
              "Rinciannya ada di bagian berikutnya.",
          },
          {
            jenis: "paragraf",
            teks:
              "Alurnya singkat: F12 → tab Application → Cookies → pilih domain " +
              "monev.maganghub.kemnaker.go.id → centang Show URL-decoded → cari " +
              "monev_refresh_token → salin kolom Value → tempel di menu " +
              "Kredensial aplikasi ini.",
          },
          {
            jenis: "daftar",
            judul: "Ringkas lima langkah",
            item: [
              "Login ke portal Monev di browser sampai halaman absensi terbuka.",
              "Tekan F12 (Windows) atau Cmd+Option+I (macOS) untuk membuka DevTools.",
              "Klik tab Application, lalu Cookies di panel kiri.",
              "Pilih domain monev.maganghub.kemnaker.go.id, centang Show URL-decoded, lalu cari baris monev_refresh_token.",
              "Salin kolom Value-nya, tempel di menu Kredensial aplikasi ini, lalu simpan.",
            ],
          },
          {
            jenis: "catatan",
            judul: "Bila ragu di tengah jalan",
            teks:
              "Setiap langkah di atas dijelaskan lebih rinci di bagian " +
              "berikutnya, termasuk kesalahan yang sering terjadi saat " +
              "menyalin. Bagian ini hanya peta jalannya.",
          },
        ],
      },
      {
        id: "kenapa-manual",
        judul: "Kapan cara ini diperlukan",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Cara utama menghubungkan akun adalah memasukkan email dan " +
              "password Monev di menu Kredensial. Aplikasi yang login ke " +
              "portal dan menyimpan sesinya. Cara manual lewat DevTools adalah " +
              "cadangan, dipakai bila login otomatis tidak berhasil.",
          },
          {
            jenis: "daftar",
            judul: "Pemicu yang biasa terjadi",
            item: [
              "Portal meminta verifikasi tambahan yang tidak bisa dilewati aplikasi, misalnya tantangan dari Cloudflare.",
              "Bentuk respons login portal berubah sehingga aplikasi tidak menemukan token yang diharapkan.",
              "Anda sudah login di browser dan ingin memakai sesi yang sama tanpa menyerahkan password.",
            ],
          },
          {
            jenis: "catatan",
            judul: "Cara ini tidak lebih aman, hanya berbeda",
            teks:
              "Menempel token tidak menghilangkan kebutuhan aplikasi menyimpan " +
              "sesi. Token tetap disimpan terenkripsi dan tetap punya masa " +
              "berlaku. Yang berubah hanya dari mana ia berasal.",
          },
        ],
      },
      {
        id: "buka-devtools",
        judul: "1. Buka DevTools di halaman Monev",
        blok: [
          {
            jenis: "langkah",
            judul: "Langkah menyiapkan",
            item: [
              "Login ke portal MagangHub Kemnaker di browser Anda seperti biasa, sampai Anda bisa melihat halaman absensi.",
              "Buka DevTools. Di Windows tekan F12 atau Ctrl+Shift+I; di macOS tekan Cmd+Option+I.",
              "Pindah ke tab Application (Chrome/Edge) atau Storage (Firefox).",
              "Buka bagian Cookies, lalu pilih domain monev.maganghub.kemnaker.go.id. Ini domain halaman portal, tempat cookie sesi disimpan. Jangan pilih monev-api.maganghub.kemnaker.go.id, itu domain API dan tidak memuat cookie ini.",
            ],
          },
          {
            jenis: "gambar",
            src: "/panduan/devtools-1-buka.webp",
            alt: "Panel Application di DevTools Chrome dengan bagian Storage dan Cookies terlihat di bilah kiri.",
            keterangan:
              "Tab Application ada di deretan tab atas, di sebelah kanan " +
              "Console. Setelah tab itu dibuka, Cookies ada di dalam grup " +
              "Storage pada bilah kiri.",
            lebar: 1237,
            tinggi: 932,
          },
          {
            jenis: "catatan",
            judul: "Aktifkan tampilan URL-decoded dulu",
            teks:
              "Nilai cookie portal disimpan dalam bentuk URL-encoded, sehingga " +
              "di DevTools bisa tampak memuat tanda persen seperti %2E atau " +
              "%2B. Sebelum menyalin, centang opsi Show URL-decoded di sebelah " +
              "kotak pencarian cookie. Tanpa centang itu, yang tersalin adalah " +
              "bentuk ter-encode yang akan ditolak aplikasi karena bukan " +
              "berbentuk tiga bagian dipisah titik.",
          },
          {
            jenis: "gambar",
            src: "/panduan/devtools-2-buka.webp",
            alt: "Bilah kiri DevTools dengan bagian Storage dan Cookies terlihat, siap dipilih untuk membuka daftar cookie.",
            keterangan:
              "Buka Storage lalu pilih Cookies. Domain portal Monev muncul di " +
              "bawahnya sebagai sub-bagian yang bisa dibuka.",
            lebar: 1236,
            tinggi: 929,
          },
          {
            jenis: "paragraf",
            teks:
              "Anda mencari satu cookie bernama monev_refresh_token. Cookie " +
              "inilah sesi login portal. Bentuknya panjang dan terdiri dari " +
              "tiga bagian yang dipisah titik, karena ia sejenis JWT.",
          },
        ],
      },
      {
        id: "salin-nilai",
        judul: "2. Salin nilai token dengan benar",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Klik baris monev_refresh_token, lalu salin isi kolom Value-nya " +
              "saja. Jangan menyertakan namanya dan jangan menyalin baris " +
              "cookie secara utuh, karena yang dibutuhkan hanya nilainya. " +
              "Pastikan centang Show URL-decoded dari langkah sebelumnya masih " +
              "aktif, lalu periksa hasil salinan: bila masih ada tanda persen " +
              "seperti %2E, ulangi dengan centang itu dinyalakan.",
          },
          {
            jenis: "gambar",
            src: "/panduan/devtools-3-buka.webp",
            alt: "Tabel cookie DevTools dengan baris monev_refresh_token terpilih dan nilainya tampil di kolom Value.",
            keterangan:
              "Salin hanya isi kolom Value. Jangan ikut menyalin nama cookie " +
              "atau pasangan cookie lain di baris yang sama.",
            lebar: 1235,
            tinggi: 932,
          },
          {
            jenis: "daftar",
            judul: "Kesalahan yang sering terjadi",
            item: [
              "Ikut tersalin teks monev_refresh_token= di depan nilai. Awalan ini bukan bagian dari token.",
              "Ikut tersalin titik koma dan pasangan cookie lain yang menempel di ujung.",
              "Tersalin cookie yang salah, misalnya penanda dari Cloudflare. Yang dicari hanya monev_refresh_token.",
              "Tersalin hanya sebagian nilai karena teksnya sangat panjang. Pastikan seluruh isinya ikut.",
              "Tersalin bentuk yang masih URL-encoded, sehingga memuat tanda persen seperti %2E atau %2B. Nyalakan Show URL-decoded sebelum menyalin.",
            ],
          },
          {
            jenis: "catatan",
            judul: "Spasi di tepi aman",
            teks:
              "Aplikasi memangkas spasi di tepi token secara otomatis, jadi " +
              "tempelan yang tidak sengaja menyertakan spasi di awal atau akhir " +
              "tetap diterima. Yang tidak dimaafkan adalah token yang tidak " +
              "lengkap atau bukan token sama sekali.",
          },
        ],
      },
      {
        id: "tempel",
        judul: "3. Tempel dan periksa",
        blok: [
          {
            jenis: "langkah",
            judul: "Menempelkan token",
            item: [
              "Buka menu Kredensial di aplikasi ini.",
              "Tempel token ke kolom token yang tersedia, lalu simpan.",
              "Aplikasi memeriksa bentuk token lebih dulu: harus tiga bagian dipisah titik. Bila bentuknya salah, Anda akan tahu saat itu juga, bukan setelah menunggu pengiriman.",
              "Aplikasi lalu mencoba menukar token menjadi sesi yang sah, dan menampilkan hasilnya secara jujur, berhasil atau gagal.",
            ],
          },
          {
            jenis: "paragraf",
            teks:
              "Bila pengujian koneksi berhasil, Anda bisa langsung memakai " +
              "fitur lain seperti biasa. Bila gagal, pesan yang muncul adalah " +
              "pesan asli dari portal, bukan pesan karangan aplikasi.",
          },
        ],
      },
      {
        id: "umur-token",
        judul: "Berapa lama token bertahan",
        blok: [
          {
            jenis: "tabel",
            kepala: ["Jenis", "Masa berlaku", "Catatan"],
            baris: [
              [
                "Refresh token (yang Anda salin)",
                "Sekitar 30 hari",
                "Cukup untuk mewujudkan ulang sesi tanpa password",
              ],
              [
                "Access token turunan",
                "Sekitar 6 jam",
                "Dipakai untuk mengirim laporan, diperbarui otomatis",
              ],
            ],
          },
          {
            jenis: "paragraf",
            teks:
              "Angka-angka ini berasal dari pengamatan terhadap portal Monev " +
              "dan bisa berubah bila portal mengubah kebijakannya. Karena itu, " +
              "bila pengiriman mulai gagal secara konsisten, langkah pertama " +
              "yang paling sering menyelesaikan masalah adalah login ulang di " +
              "portal dan menempel token baru.",
          },
          {
            jenis: "catatan",
            judul: "Jangan bagikan token",
            teks:
              "Token ini setara dengan akses masuk akun Monev Anda. Jangan " +
              "mengirimkannya ke orang lain atau menempelkannya di tempat " +
              "umum seperti kolom komentar atau berkas yang dibagikan.",
          },
        ],
      },
    ],
  },
  {
    slug: "mengatasi-error-kirim-laporan-monev",
    judul: "Mengatasi Error Saat Kirim Laporan ke Monev",
    ringkas:
      "Arti tiap status pengiriman, penyebab yang paling sering, dan langkah perbaikan yang benar untuk masing-masing.",
    terbit: "2026-02-05",
    menitBaca: 8,
    kataKunci: [
      "error kirim laporan monev",
      "presensi sudah ada maganghub",
      "gagal submit absensi kemnaker",
      "sesi monev kedaluwarsa",
    ],
    section: [
      {
        id: "baca-status",
        judul: "Mulai dari status di Riwayat",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Sebelum mengubah apa pun, buka Riwayat dan lihat status " +
              "percobaan terakhir. Tiga status ini punya arti yang sangat " +
              "berbeda, dan menanganinya dengan cara yang sama justru bisa " +
              "memperburuk keadaan.",
          },
          {
            jenis: "tabel",
            kepala: ["Status", "Artinya", "Tindakan"],
            baris: [
              [
                "Terkirim",
                "Portal menerima laporan",
                "Tidak ada, ini hasil yang diinginkan",
              ],
              [
                "Sudah ada",
                "Laporan tanggal itu sudah tercatat di portal",
                "Tidak perlu diulang, ini bukan kegagalan",
              ],
              [
                "Gagal",
                "Laporan tidak sampai ke portal",
                "Periksa penyebab, lalu coba lagi",
              ],
            ],
          },
          {
            jenis: "catatan",
            judul: "Sudah ada bukan error",
            teks:
              "Status sudah ada sering disalahartikan sebagai kegagalan. " +
              "Padahal artinya portal memang sudah punya presensi untuk " +
              "tanggal tersebut. Pengiriman kedua memang ditolak portal, dan " +
              "itu perilaku normal. Jangan mengirim ulang berkali-kali.",
          },
        ],
      },
      {
        id: "sesi-kedaluwarsa",
        judul: "Penyebab 1: sesi Monev kedaluwarsa",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Ini penyebab paling sering. Sesi login ke portal punya masa " +
              "berlaku, dan bila sudah lewat, pengiriman ditolak sebagai sesi " +
              "mati. Karena sesi disimpan sebagai token, membatalkannya juga " +
              "membuat token lama tidak berlaku lagi.",
          },
          {
            jenis: "daftar",
            judul: "Tanda-tandanya",
            item: [
              "Status gagal muncul tiba-tiba padahal sebelumnya lancar setiap hari.",
              "Pesan dari portal menyebut otorisasi atau sesi, bukan isi laporan.",
              "Anda baru saja mengganti password Monev di portal. Mengganti password biasanya langsung mematikan sesi yang lama.",
            ],
          },
          {
            jenis: "langkah",
            judul: "Cara memperbaiki",
            item: [
              "Login ulang ke portal MagangHub Kemnaker di browser Anda.",
              "Buka menu Kredensial di aplikasi ini.",
              "Simpan ulang email dan password Monev, atau tempel token baru bila memakai cara manual.",
              "Tekan uji koneksi sampai hasilnya berhasil, lalu coba kirim sekali lagi untuk tanggal yang benar.",
            ],
          },
        ],
      },
      {
        id: "isi-ditolak",
        judul: "Penyebab 2: isi laporan ditolak portal",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Bila sesi masih hidup tetapi laporan tetap ditolak, biasanya " +
              "masalahnya ada di isi. Portal punya syarat panjang minimum, dan " +
              "teks yang terlalu pendek akan ditolak, bukan disimpan.",
          },
          {
            jenis: "daftar",
            judul: "Yang perlu diperiksa",
            item: [
              "Setiap kolom minimal 100 karakter setelah spasi di tepi dipangkas. Periksa lewat penghitung karakter, bukan perkiraan.",
              "Setiap kolom tidak melebihi 5000 karakter.",
              "Tidak ada kolom yang dibiarkan kosong. Ketiganya wajib diisi.",
              "Teks yang ditempel dari Word kadang membawa karakter tak terlihat di ujungnya. Bila penghitung tampak cukup tetapi portal menolak, tulis ulang bagian tepinya.",
            ],
          },
        ],
      },
      {
        id: "portal-menolak-akses",
        judul: "Penyebab 3: portal menolak akses",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Kadang portal membalas dengan kode terlarang. Ini terjadi " +
              "ketika lapisan pelindung di depan portal menganggap permintaan " +
              "mencurigakan, bukan karena laporan Anda salah. Aplikasi ini " +
              "sengaja tidak menembusnya, karena itu melanggar batas etika " +
              "proyek dan berisiko menghukum akun Anda sendiri.",
          },
          {
            jenis: "daftar",
            judul: "Yang boleh dan tidak boleh dilakukan",
            item: [
              "Tidak boleh: memalsukan identitas peramban atau memakai proxy untuk menerobos penolakan.",
              "Tidak boleh: mengirim berulang cepat dalam jumlah banyak, karena itu justru memperkuat dugaan penyalahgunaan.",
              "Boleh: menunggu beberapa saat, lalu mencoba lagi secara wajar.",
              "Boleh: membuka portal langsung di browser, memastikan akun Anda bisa masuk normal, lalu kembali ke aplikasi.",
            ],
          },
          {
            jenis: "catatan",
            judul: "Kalau tetap gagal",
            teks:
              "Bila portal menolak secara terus-menerus, cara paling andal " +
              "sementara adalah menyalin isi tiga kolom template dan " +
              "mengirimnya manual dari situs Monev. Laporan Anda tetap " +
              "terkirim, hanya tanpa otomatisasi.",
          },
        ],
      },
      {
        id: "pengiriman-tidak-jalan",
        judul: "Penyebab 4: jadwal otomatis tidak berjalan",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Bila statusnya bukan gagal, melainkan tidak ada percobaan sama " +
              "sekali, masalahnya ada di pemicu jadwal, bukan di portal. " +
              "Pemicu otomatis memanggil aplikasi secara berkala, dan bila " +
              "panggilan itu tidak pernah datang, Riwayat akan tetap kosong.",
          },
          {
            jenis: "daftar",
            judul: "Titik yang biasa jadi biang masalah",
            item: [
              "Sakelar Otomasi belum dinyalakan di dashboard.",
              "Waktu di pemicu tidak cocok dengan yang Anda maksud. Aplikasi memakai zona waktu Jakarta, sedangkan banyak layanan pemicu memakai UTC. Selisihnya tujuh jam dan sering luput diperhatikan.",
              "Kunci pemicu salah atau kosong, sehingga aplikasi menolak panggilan itu. Salin ulang kunci dari dashboard.",
              "Hari itu memang libur atau program sudah berakhir, sehingga aplikasi sengaja tidak mengirim apa pun.",
            ],
          },
          {
            jenis: "langkah",
            judul: "Pemeriksaan berurutan",
            item: [
              "Pastikan sakelar Otomasi menyala.",
              "Cek jam yang Anda pasang, lalu ingat selisih tujuh jam bila layanan pemicu memakai UTC.",
              "Terbitkan ulang kunci bila perlu, lalu perbarui di layanan pemicu.",
              "Jalankan pemicu secara manual sekali, lalu lihat apakah baris baru muncul di Riwayat.",
            ],
          },
        ],
      },
      {
        id: "kapan-hubungi",
        judul: "Kapan perlu menghubungi pengelola",
        blok: [
          {
            jenis: "paragraf",
            teks:
              "Sebagian besar error selesai dengan login ulang atau memperbaiki " +
              "isi template. Anda sebaiknya menghubungi pengelola bila portal " +
              "mengubah caranya bekerja sehingga aplikasi tidak lagi bisa " +
              "mengirim, atau bila akun Anda terkunci karena hal di luar " +
              "kendali Anda.",
          },
          {
            jenis: "paragraf",
            teks:
              "Saat melapor, sebutkan tanggal kejadian dan status apa yang " +
              "muncul di Riwayat. Dua keterangan itu cukup untuk menelusuri " +
              "sebagian besar masalah tanpa perlu mengirim kata sandi Anda ke " +
              "siapa pun.",
          },
        ],
      },
    ],
  },
];

/** Cari satu panduan berdasarkan slug. `undefined` bila tidak ada. */
export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** Semua slug, dipakai generateStaticParams agar artikel dirender statis. */
export const GUIDE_SLUGS: readonly string[] = GUIDES.map((g) => g.slug);

/**
 * Panduan lain selain yang sedang dibuka, untuk blok "Baca juga".
 * Mengembalikan seluruh sisanya karena jumlah artikel masih sedikit; bila nanti
 * bertambah banyak, batasi di sini saja, pemanggil tidak perlu berubah.
 */
export function guideLain(slug: string): readonly Guide[] {
  return GUIDES.filter((g) => g.slug !== slug);
}

// ---------------------------------------------------------------------------
// Bagian murni untuk mesin pencari. Ditaruh di sini, bukan di komponen, supaya
// bisa diuji tanpa merender React, dan supaya satu fungsi melayani tampilan
// maupun JSON-LD.
// ---------------------------------------------------------------------------

const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**
 * Format tanggal ISO jadi "5 Februari 2026" tanpa lewat Date.
 *
 * Kenapa tidak `new Date(iso).toLocaleDateString("id-ID")`: menguraikan
 * "2026-02-05" menghasilkan tengah malam UTC, lalu ditampilkan pada zona lokal.
 * Di zona barat UTC tanggalnya bisa bergeser menjadi 4 Februari. Untuk tanggal
 * yang murni informatif, penguraian manual menghilangkan seluruh risiko itu.
 */
export function formatTanggalIndo(iso: string): string {
  const [tahun, bulan, hari] = iso.split("-").map(Number);
  return `${hari} ${BULAN[bulan - 1]} ${tahun}`;
}

/**
 * Bangun JSON-LD untuk satu artikel. Selalu Article, ditambah HowTo bila
 * artikel memang berbentuk langkah berurutan (`howTo` terisi).
 *
 * HowTo menuntut langkah yang benar-benar berurutan, jadi kita TIDAK
 * memaksakannya pada artikel bergaya penjelasan, agar schema tetap jujur.
 *
 * `situsUrl` (origin absolut) diberikan sebagai argumen supaya fungsi ini tetap
 * murni dan bisa diuji tanpa memuat env aplikasi.
 */
export function guideJsonLd(
  guide: Guide,
  situsUrl: string,
  namaSitus: string,
): Record<string, unknown> {
  const url = `${situsUrl.replace(/\/$/, "")}/panduan/${guide.slug}`;
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.judul,
    description: guide.ringkas,
    datePublished: guide.terbit,
    inLanguage: "id-ID",
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: namaSitus },
    publisher: { "@type": "Organization", name: namaSitus },
    keywords: guide.kataKunci.join(", "),
  };
  if (!guide.howTo) return base;

  // Langkah HowTo diambil dari blok "langkah" di artikel, supaya urutan yang
  // dilihat pembaca persis sama dengan yang dibaca mesin.
  const langkah: string[] = [];
  for (const s of guide.section) {
    for (const b of s.blok) {
      if (b.jenis === "langkah") langkah.push(...b.item);
    }
  }
  if (langkah.length < 2) return base;

  return {
    ...base,
    "@type": ["Article", "HowTo"],
    name: guide.howTo,
    step: langkah.map((t, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text: t,
    })),
  };
}
