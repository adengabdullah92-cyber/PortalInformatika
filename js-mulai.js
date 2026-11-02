// LMS Informatika SMA — js-mulai.js: Sesi login, muat ulang data, mulai aplikasi (dimuat terakhir).
// Dipecah dari index.html (2 Nov 2026), isi tidak diubah. File js-*.js dimuat berurutan oleh index.html.
    // ================= SESI LOGIN + PEMUATAN DATA ULANG =================
    // Sesi disimpan di browser (tanpa password): token sesi server, username, peran, waktu aktif terakhir, tab terakhir, mode Lab.
    // Berlaku 1 jam sejak aktivitas terakhir; setiap klik/ketukan memperpanjangnya. Keluar menghapusnya.
    const SESI_KUNCI = 'lms_sesi_v1';
    const SESI_MASA = 60 * 60 * 1000;
    const SESI_TAB = { guru: ['materi', 'kuis', 'lab', 'koreksi'], siswa: ['materi', 'kuis', 'lab'] };
    let sesiSentuhTerakhir = 0;

    function sesiBaca() {
      try { const s = JSON.parse(localStorage.getItem(SESI_KUNCI)); return s && typeof s === 'object' && !Array.isArray(s) ? s : null; } catch (_) { return null; }
    }
    function sesiTulis(s) { try { localStorage.setItem(SESI_KUNCI, JSON.stringify(s)); } catch (_) {} }
    function sesiHapus() { try { localStorage.removeItem(SESI_KUNCI); } catch (_) {} }
    function sesiMulai() {
      if (activeUser) sesiTulis({ u: activeUser.username, r: activeUser.role, k: sesiToken, t: Date.now() });
    }
    function sesiSimpan(extra = {}) {
      if (!activeUser) return;
      const lama = sesiBaca();
      const sama = lama && lama.u === activeUser.username && lama.r === activeUser.role;
      sesiTulis({ ...(sama ? lama : {}), u: activeUser.username, r: activeUser.role, k: sesiToken, t: Date.now(), ...extra });
    }
    function sesiSentuh() {
      const n = Date.now();
      if (!activeUser || n - sesiSentuhTerakhir < 30000) return;
      sesiSentuhTerakhir = n; sesiSimpan();
    }
    ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, sesiSentuh, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sesiSentuh(); });

    function sesiTampilkanLogin(pesan) {
      $id('sesiPulih').classList.add('hidden');
      $id('viewLogin').classList.remove('hidden');
      $id('loginErr').textContent = pesan || '';
    }

    async function sesiPulihkan() {
      let pesan = '';
      try { pesan = sessionStorage.getItem('lms_pesan_login') || ''; sessionStorage.removeItem('lms_pesan_login'); } catch (_) {}
      if (pesan) $id('loginErr').textContent = pesan;
      const s = sesiBaca();
      if (!s) return false;
      if (!s.u || (s.r !== 'guru' && s.r !== 'siswa')) { sesiHapus(); return false; }
      // Sesi lama (sebelum pembaruan keamanan) tidak punya token: wajib masuk ulang sekali.
      if (!s.k) { sesiHapus(); sesiTampilkanLogin('LMS diperbarui. Silakan masuk lagi.'); return false; }
      if (Date.now() - (Number(s.t) || 0) > SESI_MASA) { sesiHapus(); sesiTampilkanLogin('Sesi berakhir (lebih dari 1 jam tidak aktif). Silakan masuk lagi.'); return false; }
      $id('viewLogin').classList.add('hidden');
      $id('sesiPulih').classList.remove('hidden');
      try {
        const r = await db.rpc('sesi_cek', { p_token: s.k });
        if (r.error) throw r.error;
        if (!r.data || !r.data.akun || r.data.peran !== s.r) { sesiHapus(); sesiTampilkanLogin('Sesi berakhir. Silakan masuk lagi.'); return false; }
        sesiToken = s.k;
        activeUser = { ...r.data.akun, role: s.r };
        $id('sesiPulih').classList.add('hidden');
        initDashboard();
        const tab = SESI_TAB[s.r].includes(s.tab) ? s.tab : null;
        if (tab) {
          switchTab(tab);
          if (tab === 'kuis' && s.r === 'guru' && KT_PANE.includes(s.kt)) ktPilih(s.kt, false);
          if (tab === 'lab' && s.lab === 'robot') { if (s.r === 'guru') labModeGuru('robot'); else labModeSiswa('robot'); }
        }
        sesiSimpan();
        return true;
      } catch (e) {
        console.warn('Sesi belum bisa dipulihkan:', e);
        sesiTampilkanLogin('Sesi tersimpan belum bisa dipulihkan (periksa koneksi). Muat ulang halaman, atau masuk lagi.');
        return false;
      }
    }

    // ---------- Muat ulang data tanpa keluar ----------
    function daftarMuat() {
      if (!activeUser) return [];
      return activeUser.role === 'guru'
        ? [{ id: 'listBankMateri', fn: loadBankMateriGuru }, { id: 'listBankSoal', fn: loadBankSoalGuru }, { id: 'listPaket', fn: loadPaketGuru }, { id: 'listBankTugas', fn: loadBankTugasGuru }]
        : [{ id: 'listMateriSiswa', fn: loadMateriSiswa }, { id: 'listKuisSiswa', fn: loadKuisSiswa }, { id: 'listTugasSiswa', fn: loadTugasSiswa }];
    }
    function bagianMacet() {
      return daftarMuat().filter(m => {
        const el = $id(m.id); if (!el) return false;
        const t = (el.textContent || '').trim();
        return /^Memuat/.test(t) || /Gagal memuat/.test(t);
      });
    }
    function perbaruiBanner() { const b = $id('banMuat'); if (b) b.classList.toggle('hidden', bagianMacet().length === 0); }
    const jalankanAman = (fn) => Promise.resolve().then(fn).catch(e => console.warn('Pemuatan data gagal:', e));

    let sedangMuatUlang = false;
    async function muatUlangData() {
      if (!activeUser || sedangMuatUlang) return;
      sedangMuatUlang = true;
      const b = $id('btnMuatUlang'); if (b) { b.disabled = true; b.textContent = '⏳'; }
      try {
        await Promise.all(daftarMuat().map(m => jalankanAman(m.fn)));
        if (activeUser.role === 'siswa') { await jalankanAman(robotMuatLevel); await jalankanAman(chatMuat); }
      } finally {
        sedangMuatUlang = false;
        if (b) { b.disabled = false; b.textContent = '🔄'; }
        perbaruiBanner();
      }
    }
    // Setelah masuk: kalau ada daftar yang masih "Memuat..." atau gagal, coba lagi otomatis sekali.
    function jadwalCekMuatan() {
      setTimeout(async () => {
        const m = bagianMacet(); if (!m.length || !activeUser) return;
        await Promise.all(m.map(x => jalankanAman(x.fn)));
        setTimeout(perbaruiBanner, 3000);
      }, 7000);
    }
    window.addEventListener('online', () => { if (activeUser) muatUlangData(); });

    sesiPulihkan();

