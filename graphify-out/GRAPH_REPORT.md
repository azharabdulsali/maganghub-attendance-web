# Graph Report - maganghub-attendance-web  (2026-10-06)

## Corpus Check
- 249 files · ~252,735 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: .example 1, (none) 1, .prisma 1)

## Summary
- 2975 nodes · 5405 edges · 122 communities (90 shown, 32 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 137 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `28546d37`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- User.ts
- prismaNamespace.ts
- SubmitLog.ts
- Report.ts
- AdminActionLog.ts
- Account.ts
- admin/page.tsx
- DatedReportTemplate.ts
- AutomationConfig.ts
- Session.ts
- MaganghubCredential.ts
- ReportTemplate.ts
- commonInputTypes.ts
- VerificationToken.ts
- Holiday.ts
- calendar/page.tsx
- perform-submit.ts
- dashboard/page.tsx
- dated-templates-table.tsx
- lucide-react
- (app)/layout.tsx
- button.tsx
- monev-submit.ts
- next
- verify/route.ts
- Button
- MONEV-API.md: Kontrak API Portal Monev MagangHub Kemnaker
- react
- ConfirmDialog
- kemnaker-sso.ts
- monev-login.ts
- enforceRateLimit
- automation.ts
- guide-page.tsx
- prismaNamespaceBrowser.ts
- components.json
- package.json
- dependencies
- holidays-manager.tsx
- validate.ts
- toPlainDate
- toast.tsx
- PrismaClient
- AGENTS.md: MagangHub Attendance Web
- monev-client.ts
- prisma.ts
- report-draft.ts
- docs-content.tsx
- compilerOptions
- reset-password/route.ts
- har-capture.ts
- AccountDelegate
- AdminActionLogDelegate
- AutomationConfigDelegate
- DatedReportTemplateDelegate
- HolidayDelegate
- MaganghubCredentialDelegate
- ReportDelegate
- ReportTemplateDelegate
- SessionDelegate
- SubmitLogDelegate
- UserDelegate
- VerificationTokenDelegate
- Panduan: Login Otomatis di Vercel via Proxy Residensial
- report-draft-llm.ts
- rate-limit-store.ts
- report-rules.ts
- Prisma__UserClient
- vitest
- client.ts
- devDependencies
- site.ts
- browser.ts
- SPEC.md: MagangHub Attendance Web
- DESIGN.md — MagangHub Autoabsen
- run-all/route.ts
- scripts
- 5. Fitur Inti
- app/page.tsx
- legal-page.tsx
- perform-submit.test.ts
- user/route.ts
- @prisma/client
- uji-proxy.ts
- 11B. Aturan Bisnis (warisan dari proyek Python)
- login-messages.ts
- Panduan Memasang Cron (Per User), MagangHub Attendance
- select.tsx
- Panduan Cron Massal (Dispatcher), Tanpa Setup per User
- security-headers.ts
- MagangHub — Otomasi Absensi Monev
- token-input.ts
- app/layout.tsx
- app/opengraph-image.tsx
- 14. Langkah Detail: Menyiapkan Neon dari Awal
- fetchPortal
- 4. Alur login (OAuth 2.0 Authorization Code)
- Menjalankan di lokal
- report-templates/route.ts
- Prisma__AdminActionLogClient
- Prisma__ReportClient
- Prisma__SubmitLogClient
- Gambar panduan
- Prisma__AccountClient
- Prisma__AutomationConfigClient
- Prisma__DatedReportTemplateClient
- Prisma__MaganghubCredentialClient
- Prisma__ReportTemplateClient
- Prisma__SessionClient
- eslint.config.mjs
- 11. Batasan
- apple-icon.tsx
- icon.tsx
- Prisma__HolidayClient
- Prisma__VerificationTokenClient
- PrismaClientBaseOptions
- CLAUDE.md
- CODEBUDDY.md
- postcss.config.mjs
- { GET, POST }

## God Nodes (most connected - your core abstractions)
1. `next` - 70 edges
2. `Button()` - 62 edges
3. `auth` - 61 edges
4. `vitest` - 46 edges
5. `react` - 44 edges
6. `lucide-react` - 38 edges
7. `AdminPage()` - 37 edges
8. `prisma` - 36 edges
9. `enforceRateLimit()` - 34 edges
10. `performSubmit()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Struktur data template` --references--> `pindah()`  [INFERRED]
  AGENTS.md → src/app/(app)/report-templates/report-templates-form.tsx
- `5b. Konvensi aksesibilitas form` --references--> `hitungKekuatan()`  [INFERRED]
  docs/UI-LAYOUT.md → src/lib/password-strength.ts
- `1. Cara kerjanya (singkat)` --references--> `performSubmit()`  [INFERRED]
  docs/CRON-BULK.md → src/lib/perform-submit.ts
- `1. Apa yang sebenarnya terjadi` --references--> `performSubmit()`  [INFERRED]
  docs/CRON-SETUP.md → src/lib/perform-submit.ts
- `Jangan pernah` --references--> `fetchPortal()`  [INFERRED]
  AGENTS.md → src/lib/proxy-fetch.ts

## Import Cycles
- None detected.

## Communities (122 total, 32 thin omitted)

### Community 0 - "User.ts"
Cohesion: 0.01
Nodes (179): AggregateUser, BoolFieldUpdateOperationsInput, DateTimeFieldUpdateOperationsInput, EnumRoleFieldUpdateOperationsInput, GetUserAggregateType, GetUserGroupByPayload, IntFieldUpdateOperationsInput, NullableDateTimeFieldUpdateOperationsInput (+171 more)

### Community 1 - "prismaNamespace.ts"
Cohesion: 0.01
Nodes (135): AccountScalarFieldEnum, AdminActionLogScalarFieldEnum, AnyNull, Args, At, AtLeast, AtLoose, AtStrict (+127 more)

### Community 2 - "SubmitLog.ts"
Cohesion: 0.02
Nodes (97): AggregateSubmitLog, EnumSubmitStatusFieldUpdateOperationsInput, EnumTriggerTypeFieldUpdateOperationsInput, GetSubmitLogAggregateType, GetSubmitLogGroupByPayload, SubmitLog$reportArgs, SubmitLogAggregateArgs, SubmitLogAvgAggregateInputType (+89 more)

### Community 3 - "Report.ts"
Cohesion: 0.02
Nodes (91): AggregateReport, EnumReportStatusFieldUpdateOperationsInput, EnumSourceTypeFieldUpdateOperationsInput, GetReportAggregateType, GetReportGroupByPayload, Report$submitLogsArgs, ReportAggregateArgs, ReportCountAggregateInputType (+83 more)

### Community 4 - "AdminActionLog.ts"
Cohesion: 0.02
Nodes (89): AdminActionLogAggregateArgs, AdminActionLogCountAggregateInputType, AdminActionLogCountAggregateOutputType, AdminActionLogCountArgs, AdminActionLogCountOrderByAggregateInput, AdminActionLogCreateArgs, AdminActionLogCreateInput, AdminActionLogCreateManyActorInput (+81 more)

### Community 5 - "Account.ts"
Cohesion: 0.02
Nodes (81): AccountAggregateArgs, AccountAvgAggregateInputType, AccountAvgAggregateOutputType, AccountAvgOrderByAggregateInput, AccountCountAggregateInputType, AccountCountAggregateOutputType, AccountCountArgs, AccountCountOrderByAggregateInput (+73 more)

### Community 6 - "admin/page.tsx"
Cohesion: 0.08
Nodes (65): 5.10 Panel Admin (`/admin`), 5.7 Audit Log, 7. Model Data (Prisma), getAdminUsers(), getAuditUserOptions(), AdminPage(), AdminPageProps, adminUrl() (+57 more)

### Community 7 - "DatedReportTemplate.ts"
Cohesion: 0.03
Nodes (74): AggregateDatedReportTemplate, DatedReportTemplateAggregateArgs, DatedReportTemplateCountAggregateInputType, DatedReportTemplateCountAggregateOutputType, DatedReportTemplateCountArgs, DatedReportTemplateCountOrderByAggregateInput, DatedReportTemplateCreateArgs, DatedReportTemplateCreateInput (+66 more)

### Community 8 - "AutomationConfig.ts"
Cohesion: 0.03
Nodes (73): AggregateAutomationConfig, AutomationConfigAggregateArgs, AutomationConfigAvgAggregateInputType, AutomationConfigAvgAggregateOutputType, AutomationConfigAvgOrderByAggregateInput, AutomationConfigCountAggregateInputType, AutomationConfigCountAggregateOutputType, AutomationConfigCountArgs (+65 more)

### Community 9 - "Session.ts"
Cohesion: 0.03
Nodes (73): AggregateSession, GetSessionAggregateType, GetSessionGroupByPayload, SessionAggregateArgs, SessionCountAggregateInputType, SessionCountAggregateOutputType, SessionCountArgs, SessionCountOrderByAggregateInput (+65 more)

### Community 10 - "MaganghubCredential.ts"
Cohesion: 0.03
Nodes (68): AggregateMaganghubCredential, EnumCredentialStatusFieldUpdateOperationsInput, GetMaganghubCredentialAggregateType, GetMaganghubCredentialGroupByPayload, MaganghubCredentialAggregateArgs, MaganghubCredentialCountAggregateInputType, MaganghubCredentialCountAggregateOutputType, MaganghubCredentialCountArgs (+60 more)

### Community 11 - "ReportTemplate.ts"
Cohesion: 0.03
Nodes (67): AggregateReportTemplate, GetReportTemplateAggregateType, GetReportTemplateGroupByPayload, ReportTemplateAggregateArgs, ReportTemplateCountAggregateInputType, ReportTemplateCountAggregateOutputType, ReportTemplateCountArgs, ReportTemplateCountOrderByAggregateInput (+59 more)

### Community 12 - "commonInputTypes.ts"
Cohesion: 0.03
Nodes (59): BoolFilter, BoolWithAggregatesFilter, DateTimeFilter, DateTimeNullableFilter, DateTimeNullableWithAggregatesFilter, DateTimeWithAggregatesFilter, EnumAdminActionTypeFilter, EnumAdminActionTypeWithAggregatesFilter (+51 more)

### Community 13 - "VerificationToken.ts"
Cohesion: 0.04
Nodes (53): AggregateVerificationToken, GetVerificationTokenAggregateType, GetVerificationTokenGroupByPayload, VerificationTokenAggregateArgs, VerificationTokenCountAggregateInputType, VerificationTokenCountAggregateOutputType, VerificationTokenCountArgs, VerificationTokenCountOrderByAggregateInput (+45 more)

### Community 14 - "Holiday.ts"
Cohesion: 0.04
Nodes (52): AggregateHoliday, GetHolidayAggregateType, GetHolidayGroupByPayload, HolidayAggregateArgs, HolidayCountAggregateInputType, HolidayCountAggregateOutputType, HolidayCountArgs, HolidayCountOrderByAggregateInput (+44 more)

### Community 15 - "calendar/page.tsx"
Cohesion: 0.10
Nodes (45): 5.9 Kalender Kehadiran & Laporan (`/calendar`), CalendarPage(), CalendarPageProps, calendarUrl(), HOLIDAY_LABEL, isTodayInJakarta(), jakartaMonthRange(), LegendItem() (+37 more)

### Community 16 - "perform-submit.ts"
Cohesion: 0.09
Nodes (36): 15B. Cron massal (dispatcher), mengurangi setup per user, maxDuration, POST(), manualResponse(), POST(), AdminHolidaysPage(), RunOneResult, RunOneSummary (+28 more)

### Community 17 - "dashboard/page.tsx"
Cohesion: 0.11
Nodes (26): DispatchPanel(), DispatchSummary, KIND_LABEL, toneForKind(), AutomationForm(), Props, CredentialsForm(), formatTanggal() (+18 more)

### Community 18 - "dated-templates-table.tsx"
Cohesion: 0.10
Nodes (36): Hari libur dikelola ADMIN (tabel `Holiday`), Struktur data template, 8.5b Route submit (Tahap 4), ✅ TERPASANG, gated, Cell(), DatedTemplatesTable(), MobileField(), StatusChip(), statusOf() (+28 more)

### Community 19 - "lucide-react"
Cohesion: 0.16
Nodes (23): lucide-react, next-auth, Props, EmailForm(), PasswordForm(), ProfileForm(), RevokeSessionsButton(), LoginForm() (+15 more)

### Community 20 - "(app)/layout.tsx"
Cohesion: 0.08
Nodes (26): 1. Struktur folder halaman, 2. Siapa yang menjaga apa, 3. Sidebar, dua tata letak, satu komponen, 3b. Jam dinding "dynamic island" (`JamIsland`), 4. Profil & Pengaturan, 5. Cara memeriksa setelah mengubah UI, 5b. Konvensi aksesibilitas form, 6. Yang belum dikerjakan (kandidat putaran berikutnya) (+18 more)

### Community 21 - "button.tsx"
Cohesion: 0.11
Nodes (19): @base-ui/react, class-variance-authority, react-day-picker, buttonVariants, Calendar(), CalendarDayButton(), CalendarProps, DatePicker() (+11 more)

### Community 22 - "monev-submit.ts"
Cohesion: 0.11
Nodes (31): 4.4 Dari mana `Bearer <access token>` berasal?, ✅ TERJAWAB, 8.1 Submit, `POST /api/v1/attendances/with-daily-log`, 8.2 Cek duplikasi (RB-03), `GET /api/v1/daily-logs`, 8.3 Baca status kalender, `GET /api/v1/attendances`, 8.4 ⚠️ Token: Bearer akses ≠ refresh token, 8.5 Kerangka yang sudah diisi, 8.5a ✅ Pra-cek duplikat (RB-03) SUDAH DIIMPLEMENTASI, 8.6 Alat diagnostik (untuk rekaman berikutnya) (+23 more)

### Community 23 - "next"
Cohesion: 0.13
Nodes (19): bcryptjs, next, POST(), POST(), PATCH(), AutomationPage(), CredentialsPage(), DevToolsPage() (+11 more)

### Community 24 - "verify/route.ts"
Cohesion: 0.14
Nodes (21): Login otomatis ke Monev (Opsi A), jalur utama, POST(), existingEmail(), POST(), toResponse(), ACCESS_TTL_MS, isAccessTokenFresh(), refreshTokenHealth (+13 more)

### Community 25 - "Button"
Cohesion: 0.12
Nodes (23): Aturan UI (penting), 5.12 Umpan balik aksi: dialog konfirmasi & toast, Home(), metadata, PanduanPage(), MENU_ADMIN, MENU_UMUM, MenuItem (+15 more)

### Community 26 - "MONEV-API.md: Kontrak API Portal Monev MagangHub Kemnaker"
Cohesion: 0.07
Nodes (27): 0. Peringatan keamanan, 10. Ringkasan: yang sudah pasti vs belum, 11. Langkah selanjutnya, 12.1 Portal = Nuxt.js (Vue 3) + Vuetify, 12.2 Halaman & alur yang dipakai bot lama, 12.3 ⚠️ Enum status, dan jebakan `.status-dot`, 12.4 Kelas `<td>` kalender, 12.5 Yang TIDAK diberikan repo Python (+19 more)

### Community 27 - "react"
Cohesion: 0.11
Nodes (17): react, BUTUH_TOKEN_BARU, Hasil, Candidate, Hasil, FORM_ANCHOR_ID, DatedEntry, FieldName (+9 more)

### Community 28 - "ConfirmDialog"
Cohesion: 0.14
Nodes (16): Aksi, UserRowActions(), DeleteDatedButton(), AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription() (+8 more)

### Community 29 - "kemnaker-sso.ts"
Cohesion: 0.18
Nodes (22): buildSsoLoginRequest(), CatchCodeResult, catchOAuthCode(), describeSsoRedirectResponse(), extractCallbackUrl(), extractCallbackUrlFromAuthJson(), extractCallbackUrlFromHtml(), extractCookieNames() (+14 more)

### Community 30 - "monev-login.ts"
Cohesion: 0.22
Nodes (21): 4.0 Alur penuh (end-to-end), ✅ LENGKAP & TERVERIFIKASI, Langkah SSO, ⚠️ SEBAGIAN TERJAWAB (2026-09-28, DIREVISI), CodeExchangeResult, BROWSER_NAV_HEADERS, describeLoginErrorForUser(), interpretSsoPrimeResponse(), LoginFlowResult, LoginStep (+13 more)

### Community 31 - "enforceRateLimit"
Cohesion: 0.19
Nodes (19): currentUserId(), DELETE(), GET(), PUT(), cronResponse(), GET(), POST(), enforceRateLimit() (+11 more)

### Community 32 - "automation.ts"
Cohesion: 0.17
Nodes (18): 12. Tahapan Pembangunan, currentUserId(), GET(), PUT(), AUTOMATION_TIMEZONE, describeAutomation(), describeNextRun(), formatSchedule() (+10 more)

### Community 33 - "guide-page.tsx"
Cohesion: 0.17
Nodes (16): generateMetadata(), GuideDetailPage(), Props, SitemapModule, Blok(), GuidePage(), BULAN, formatTanggalIndo() (+8 more)

### Community 34 - "prismaNamespaceBrowser.ts"
Cohesion: 0.08
Nodes (22): AccountScalarFieldEnum, AdminActionLogScalarFieldEnum, AnyNull, AutomationConfigScalarFieldEnum, DatedReportTemplateScalarFieldEnum, DbNull, Decimal, HolidayScalarFieldEnum (+14 more)

### Community 35 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 36 - "package.json"
Cohesion: 0.10
Nodes (20): name, private, version, @auth/prisma-adapter, cn, date-fns, @neondatabase/serverless, @prisma/adapter-neon (+12 more)

### Community 37 - "dependencies"
Cohesion: 0.10
Nodes (21): dependencies, @auth/prisma-adapter, @base-ui/react, bcryptjs, class-variance-authority, cn, date-fns, dotenv (+13 more)

### Community 38 - "holidays-manager.tsx"
Cohesion: 0.15
Nodes (14): BULAN, formatHolidayDate(), HARI, parts(), weekdayLabelOf(), HolidaysManager(), jalankanHapus(), reset() (+6 more)

### Community 39 - "validate.ts"
Cohesion: 0.12
Nodes (19): AutomationInput, ChangeEmailInput, changeEmailSchema, ChangePasswordInput, changePasswordSchema, CredentialsInput, credentialsSchema, DatedReportTemplateInput (+11 more)

### Community 40 - "toPlainDate"
Cohesion: 0.24
Nodes (16): DELETE(), GET(), POST(), PUT(), requireAdmin(), currentUserId(), DELETE(), GET() (+8 more)

### Community 41 - "toast.tsx"
Cohesion: 0.16
Nodes (16): RunResponse, ToastAction(), ToastAliasFn, toastApi, ToastClose(), toastCompat, ToastContent(), ToastDescription() (+8 more)

### Community 43 - "AGENTS.md: MagangHub Attendance Web"
Cohesion: 0.11
Nodes (19): 10. Hubungan dengan Proyek Python Lama, 11. Q&A Cepat untuk Agent, 2. Aturan Paling Penting, 3. Tech Stack, 5. Keamanan Kerja (rahasia & kredensial), 6. Alur Kerja Submit (jangan diubah tanpa alasan), 7. Testing & Verifikasi, 8. Git, Commit & Push Hanya oleh Pemilik (+11 more)

### Community 44 - "monev-client.ts"
Cohesion: 0.23
Nodes (15): Opsi untuk mendapatkan sesi valid, buildCodeExchangeUrl(), exchangeCodeForSession(), extractRefreshTokenFromSetCookies(), fetchBuildId(), fetchWithTimeout(), interpretCallbackResponse(), KEMNAKER_OAUTH (+7 more)

### Community 45 - "prisma.ts"
Cohesion: 0.20
Nodes (13): zod, POST(), POST(), registerSchema, PrismaClient, bolehUbahKeEmail(), normalisasiEmail(), env (+5 more)

### Community 46 - "report-draft.ts"
Cohesion: 0.13
Nodes (17): 13. Keputusan Proyek, Cara Membuat Admin Pertama (sudah diputuskan: `ADMIN_EMAIL`), Risiko yang diterima secara sadar, bangunKolom(), cukupkan(), getDrafter(), isi(), NO_OBSTACLE (+9 more)

### Community 47 - "docs-content.tsx"
Cohesion: 0.32
Nodes (17): Catatan(), DocsContent(), Langkah(), SubJudul(), TautanPanduan(), Topik, TopikBatasan(), TopikId (+9 more)

### Community 48 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 49 - "reset-password/route.ts"
Cohesion: 0.28
Nodes (12): POST(), DELETE(), AdminActionFields, AdminActionOutcome, logAdminAction(), isAdminRole(), ActionDenial, checkAdminTarget() (+4 more)

### Community 50 - "har-capture.ts"
Cohesion: 0.26
Nodes (15): POST(), analyzeCapture(), analyzeCurl(), analyzeHar(), bodyKindOf(), CaptureAnalysis, CapturedRequest, fieldNamesFromForm() (+7 more)

### Community 63 - "Panduan: Login Otomatis di Vercel via Proxy Residensial"
Cohesion: 0.12
Nodes (16): 1. Mengapa perlu proxy di Vercel (dan tidak di PC rumah), 2. Beban proxy sangat ringan (kuota aman), 2a. Verifikasi pemakaian kuota (dicek ke kode), 3. Beli proxy residensial, 3a. Berapa besar yang harus dibeli?, 3b. Langkah membeli IPRoyal (paling direkomendasikan), 3c. Perbandingan penyedia (harga & MODEL BAYAR), 3d. Yang HARUS dihindari (+8 more)

### Community 64 - "report-draft-llm.ts"
Cohesion: 0.14
Nodes (9): main(), DraftInput, DraftResult, geminiDrafter, JawabanMentah, balasanSehat(), ENV_WAJIB, muatModul() (+1 more)

### Community 65 - "rate-limit-store.ts"
Cohesion: 0.22
Nodes (9): RateLimitCounter, buckets, createRateLimitStore(), InMemoryRateLimitStore, RateLimitStore, __resetInMemoryRateLimitStore(), tablessParseInt(), UpstashConfig (+1 more)

### Community 66 - "report-rules.ts"
Cohesion: 0.22
Nodes (12): 1. Apa Proyek Ini, validasiJawaban(), localDrafter, KASUS, checkReportField(), countReportLength(), isIndonesianText(), KATA_INDONESIA (+4 more)

### Community 67 - "Prisma__UserClient"
Cohesion: 0.12
Nodes (3): 4. Struktur yang Dituju, Aturan penyimpanan kredensial Monev, Prisma__UserClient

### Community 68 - "vitest"
Cohesion: 0.13
Nodes (8): vitest, ManifestModule, CryptoModule, AKAR, DIKECUALIKAN, JARGON, JARGON_EKSTRA, SEMUA_JARGON

### Community 69 - "client.ts"
Cohesion: 0.12
Nodes (13): Account, AdminActionLog, AutomationConfig, DatedReportTemplate, $Enums, Holiday, MaganghubCredential, Report (+5 more)

### Community 70 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, eslint, eslint-config-next, prisma, shadcn, tailwindcss, @tailwindcss/postcss, tsx (+6 more)

### Community 71 - "site.ts"
Cohesion: 0.15
Nodes (7): alt, contentType, size, CONTACT_EMAIL, CONTACT_EMAIL_IS_PLACEHOLDER, SITE_URL, SiteModule

### Community 72 - "browser.ts"
Cohesion: 0.14
Nodes (13): Account, AdminActionLog, AutomationConfig, DatedReportTemplate, $Enums, Holiday, MaganghubCredential, Report (+5 more)

### Community 73 - "SPEC.md: MagangHub Attendance Web"
Cohesion: 0.15
Nodes (13): 10. Yang Ditiru dan Yang Tidak, 1. Tujuan, 2. Hubungan dengan Proyek Lama, 3. Tech Stack, 4. Peran Pengguna, 6. Cara Submit, Keputusan Kunci, 8. Endpoint API, 9. Keamanan (wajib, karena publik) (+5 more)

### Community 74 - "DESIGN.md — MagangHub Autoabsen"
Cohesion: 0.17
Nodes (12): Aksesibilitas (audit UI/UX), Bahasa visual (dipilih dari aset yang sudah dipakai), DESIGN.md — MagangHub Autoabsen, Dial, Ikon, Motif identitas, Penyempurnaan mode gelap (skill `dark-mode-design`), Putaran kedua (crosscheck penuh 10 kategori) (+4 more)

### Community 75 - "run-all/route.ts"
Cohesion: 0.29
Nodes (8): RFC-7235, GET(), maxDuration, safeEqual(), bearerTokenFrom(), CRON_QUERY_KEY_REMOVAL_DATE, cronKeyFromRequest(), isCronQueryKeyDeprecated()

### Community 76 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, db:push, db:studio, dev, dev:3111, lint, postinstall (+4 more)

### Community 77 - "5. Fitur Inti"
Cohesion: 0.18
Nodes (11): 5.11 Komponen bersama UI (badge & kotak pesan), 5.1 Autentikasi, 5.2 Manajemen Kredensial Monev, 5.3 Template Laporan (pengganti Integrasi GitHub), 5.3a Template Khusus Tanggal Tertentu, 5.4 Penyusun Laporan (tanpa AI), 5.5 Submit & Riwayat, 5.6 Mode Terjadwal (+3 more)

### Community 78 - "app/page.tsx"
Cohesion: 0.18
Nodes (10): BATASAN, FITUR, LANGKAH, PANDUAN, SCHEMA_APLIKASI, SCHEMA_FAQ, SCHEMA_SITUS, STATISTIK (+2 more)

### Community 79 - "legal-page.tsx"
Cohesion: 0.44
Nodes (9): metadata, PrivacyPage(), metadata, TermsPage(), ContactBlock(), LastUpdated(), LegalPage(), Section() (+1 more)

### Community 80 - "perform-submit.test.ts"
Cohesion: 0.17
Nodes (10): base(), checkDailyLogMock, CRED, credentialUpdateMock, decryptMock, exchangeMock, holidayFindManyMock, submitLogCreateMock (+2 more)

### Community 81 - "user/route.ts"
Cohesion: 0.25
Nodes (8): Panel Admin: pantau jadwal & jalankan otomasi per-user, KIND_LABEL, maxDuration, POST(), runOne(), summarizeRunOne(), findUniqueMock, performSubmitMock

### Community 82 - "@prisma/client"
Cohesion: 0.18
Nodes (5): @prisma/client, config, decodeBase64AsWasm(), LogOptions, PrismaClientConstructor

### Community 83 - "uji-proxy.ts"
Cohesion: 0.24
Nodes (8): dotenv, prisma, undici, main(), Probe, report(), safeProxyLabel(), verdict()

### Community 84 - "11B. Aturan Bisnis (warisan dari proyek Python)"
Cohesion: 0.18
Nodes (11): 11B. Aturan Bisnis (warisan dari proyek Python), Alur "hubungkan ulang akun" wajib ada, ⚠️ Field kehadiran ("Hadir") wajib ikut dikirim, Jadwal cadangan (mode terjadwal), ⚠️ Jangan pakai `.status-dot` sebagai tanda "sudah absen", Kapan boleh submit, Optimasi: state lokal, Status hasil (samakan dengan bot lama) (+3 more)

### Community 85 - "login-messages.ts"
Cohesion: 0.25
Nodes (9): getCsrfToken(), gagal(), onSubmit(), punyaSesi(), kodeErrorDari(), PESAN_CADANGAN, PESAN_ERROR, PesanLogin (+1 more)

### Community 86 - "Panduan Memasang Cron (Per User), MagangHub Attendance"
Cohesion: 0.20
Nodes (10): 1. Apa yang sebenarnya terjadi, 2. Ambil URL webhook Anda, 3. Pilih layanan cron, 4A. Memasang di cron-job.org (disarankan), 4B. Memasang di GitHub Actions, 4C. Memasang dengan crontab, 5. Menafsirkan respons, 6. Uji coba (urutan aman) (+2 more)

### Community 87 - "select.tsx"
Cohesion: 0.24
Nodes (3): SelectContent(), SelectScrollDownButton(), SelectScrollUpButton()

### Community 88 - "Panduan Cron Massal (Dispatcher), Tanpa Setup per User"
Cohesion: 0.22
Nodes (9): 1. Cara kerjanya (singkat), 2. Buat `CRON_SECRET`, 3. Set di Vercel, 4. Set di GitHub, 5. Uji aman (WAJIB sebelum produksi), 6. Arti kode respons, 7. Batas & kuota (jujur), 8. Pemecahan masalah (+1 more)

### Community 89 - "security-headers.ts"
Cohesion: 0.46
Nodes (5): nextConfig, buildContentSecurityPolicy(), HSTS_HEADER_VALUE, SECURITY_HEADERS, securityHeaders()

### Community 90 - "MagangHub — Otomasi Absensi Monev"
Cohesion: 0.25
Nodes (8): Catatan sebelum dipakai sungguhan, Deploy ke Vercel, MagangHub — Otomasi Absensi Monev, Pengalihan rute bersifat sementara, Perintah yang tersedia, Rate limit lintas instance, Saran: migrasi Prisma, Tumpukan teknologi

### Community 91 - "token-input.ts"
Cohesion: 0.50
Nodes (6): simpanToken(), cleanPastedToken(), describeTokenShapeProblem(), looksLikeRefreshToken(), looksUrlEncoded(), TokenCleanup

### Community 92 - "app/layout.tsx"
Cohesion: 0.29
Nodes (6): inter, metadata, RootLayout(), viewport, Providers(), SITE_TITLE

### Community 93 - "app/opengraph-image.tsx"
Cohesion: 0.25
Nodes (4): alt, contentType, size, SITE_DESCRIPTION

### Community 95 - "14. Langkah Detail: Menyiapkan Neon dari Awal"
Cohesion: 0.29
Nodes (7): 14. Langkah Detail: Menyiapkan Neon dari Awal, Catatan penting, Prasyarat, Tahap A, Membuat database di Neon, Tahap B, Menaruh koneksi di proyek (secara aman), Tahap C, Menyiapkan Prisma, Tahap D, Saat deploy ke Vercel

### Community 96 - "fetchPortal"
Cohesion: 0.57
Nodes (5): agentCache, dispatcherFor(), fetchPortal(), getProxyUrl(), isProxyEnabled()

### Community 97 - "4. Alur login (OAuth 2.0 Authorization Code)"
Cohesion: 0.33
Nodes (6): 4.1 `POST /api/v1/auth/refresh`, 4.2 `GET /api/v1/auth/login`, 4.3 `GET /api/v1/auth/login/callback?code=<code>&state=<state>`, 4.5 `GET /api/v1/users/me/home`, endpoint data pertama yang terverifikasi, 4.6 Respons `POST account.kemnaker.go.id/auth/login`, ✅ TERVERIFIKASI, 4. Alur login (OAuth 2.0 Authorization Code)

### Community 98 - "Menjalankan di lokal"
Cohesion: 0.33
Nodes (6): 1. Prasyarat, 2. Pasang dependensi, 3. Siapkan environment, 4. Siapkan database, 5. Jalankan, Menjalankan di lokal

### Community 99 - "report-templates/route.ts"
Cohesion: 0.60
Nodes (5): currentUserId(), DELETE(), GET(), PUT(), normalizeReportText()

### Community 103 - "Gambar panduan"
Cohesion: 0.40
Nodes (4): Cara memakai, Catatan, Gambar panduan, Ketentuan gambar

### Community 110 - "eslint.config.mjs"
Cohesion: 0.50
Nodes (3): eslintConfig, eslint, eslint-config-next

### Community 111 - "11. Batasan"
Cohesion: 0.50
Nodes (4): 11. Batasan, Jangan pernah, Keterbatasan yang diketahui, Selalu

### Community 116 - "PrismaClientBaseOptions"
Cohesion: 0.67
Nodes (3): PrismaClientBaseOptions, PrismaClientOptionsWithAccelerateUrl, PrismaClientOptionsWithAdapter

## Knowledge Gaps
- **1676 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+1671 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 2052 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `@prisma/client` to `User.ts`, `prismaNamespace.ts`, `prismaNamespaceBrowser.ts`, `Report.ts`, `package.json`, `client.ts`, `Account.ts`, `AdminActionLog.ts`, `AutomationConfig.ts`, `DatedReportTemplate.ts`, `MaganghubCredential.ts`, `ReportTemplate.ts`, `commonInputTypes.ts`, `Session.ts`, `Holiday.ts`, `SubmitLog.ts`, `VerificationToken.ts`?**
  _High betweenness centrality (0.230) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _1676 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `User.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.011111111111111112 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `admin/page.tsx`, `calendar/page.tsx`, `perform-submit.ts`, `dashboard/page.tsx`, `lucide-react`, `(app)/layout.tsx`, `verify/route.ts`, `Button`, `react`, `ConfirmDialog`, `enforceRateLimit`, `automation.ts`, `guide-page.tsx`, `package.json`, `holidays-manager.tsx`, `toPlainDate`, `toast.tsx`, `prisma.ts`, `docs-content.tsx`, `reset-password/route.ts`, `har-capture.ts`, `site.ts`, `run-all/route.ts`, `app/page.tsx`, `legal-page.tsx`, `user/route.ts`, `security-headers.ts`, `app/layout.tsx`, `app/opengraph-image.tsx`, `report-templates/route.ts`, `apple-icon.tsx`, `icon.tsx`?**
  _High betweenness centrality (0.116) - this node is a cross-community bridge._
- **Should `prismaNamespace.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.014705882352941176 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `vitest` to `admin/page.tsx`, `calendar/page.tsx`, `perform-submit.ts`, `dated-templates-table.tsx`, `lucide-react`, `(app)/layout.tsx`, `monev-submit.ts`, `next`, `verify/route.ts`, `kemnaker-sso.ts`, `monev-login.ts`, `enforceRateLimit`, `automation.ts`, `guide-page.tsx`, `package.json`, `validate.ts`, `monev-client.ts`, `prisma.ts`, `reset-password/route.ts`, `har-capture.ts`, `report-draft-llm.ts`, `rate-limit-store.ts`, `report-rules.ts`, `site.ts`, `run-all/route.ts`, `perform-submit.test.ts`, `user/route.ts`, `login-messages.ts`, `security-headers.ts`, `token-input.ts`, `fetchPortal`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Should `SubmitLog.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.02040816326530612 - nodes in this community are weakly interconnected._