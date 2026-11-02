// LMS Informatika SMA — js-inti.js: Konfigurasi Supabase, AI, bank generik, publish, login, dashboard, fungsi bantu.
// Dipecah dari index.html (2 Nov 2026), isi tidak diubah. File js-*.js dimuat berurutan oleh index.html.
    // CONFIG SUPABASE
    const SUPABASE_URL = 'https://ngmisemjfnamklajtjeg.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_8fui-5-oUHxX5_yuDVF_Tg_IQJbK2pR';
    const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // CALL AI VIA EDGE FUNCTION
    async function callAI(prompt) {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({ prompt, token: sesiToken })
      });
      const data = await response.json();
      if (response.status === 401) sesiHabis(data.error);
      if (!response.ok) throw new Error('HTTP ' + response.status + ' - ' + (data.error?.message || data.error || data.message || JSON.stringify(data)));
      return data.text ?? data.result ?? data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    // Daftar kelas untuk publish & rekap. Tambah/ubah di sini bila perlu (mis. 'XI-1').
    const DAFTAR_KELAS = Array.from({ length: 10 }, (_, i) => `X-${i + 1}`);

    const HURUF = ['A', 'B', 'C', 'D', 'E'];
    const TIPE_LABEL = { pg: 'Pilihan Ganda', pg_kompleks: 'PG Kompleks', bs: 'Benar/Salah' };

    // Soal lama memakai pilihan_a..e & kunci_jawaban; soal baru memakai opsi & kunci (JSON)
    function soalOpsi(q) {
      if (Array.isArray(q.opsi) && q.opsi.length) return q.opsi.map(x => String(x ?? ''));
      return [q.pilihan_a, q.pilihan_b, q.pilihan_c, q.pilihan_d, q.pilihan_e]
        .filter(x => x !== null && x !== undefined).map(String);
    }
    function soalKunci(q) { return (q.kunci !== null && q.kunci !== undefined) ? q.kunci : q.kunci_jawaban; }

    function soalDetailHTML(q) {
      const tipe = q.tipe || 'pg', opsi = soalOpsi(q), kunci = soalKunci(q);
      let h = `<div class="soal-teks" style="margin-bottom:8px;">${escHtml(q.pertanyaan)}</div>`;
      if (tipe === 'bs') {
        h += opsi.map((o, k) => {
          const b = Array.isArray(kunci) ? kunci[k] : null;
          return `<div class="detail-opsi">${k + 1}. ${escHtml(o)} <span class="badge ${b ? 'ok' : 'bad'}">${b ? 'Benar' : 'Salah'}</span></div>`;
        }).join('');
      } else {
        const ks = new Set(Array.isArray(kunci) ? kunci : [kunci]);
        h += opsi.map((o, k) => {
          const ok = ks.has(HURUF[k]);
          return `<div class="detail-opsi ${ok ? 'kunci' : ''}">${HURUF[k]}. ${escHtml(o)}${ok ? ' ✓' : ''}</div>`;
        }).join('');
      }
      if (q.pembahasan) h += `<div class="pembahasan">💡 <b>Pembahasan</b><div class="soal-teks">${escHtml(q.pembahasan)}</div></div>`;
      return h;
    }

    const PER_HALAMAN = 10;

    const BANK = {
      materi: {
        tabel: 'materi', pubTabel: 'materi_published', fk: 'materi_id', el: 'listBankMateri', nama: 'materi',
        anak: [['materi_read_log', 'materi_id']], dampak: ' dan catatan "sudah dibaca" siswa',
        judul: m => m.judul || '(tanpa judul)',
        cari: m => `${m.judul || ''} ${ringkasKonten(m.konten, 400)}`,
        sub: m => isModulA4(m.konten) ? '📄 Modul A4' : m.tipe_media === 'youtube' ? '🎥 Video YouTube' : m.tipe_media === 'pdf' ? '📄 PDF' : m.tipe_media === 'gdrive' ? '📁 Google Drive' : '📝 Teks',
        detail: m => `<span class="mu">${escHtml(ringkasKonten(m.konten, 300)) || '(isi kosong)'}</span>`,
        aksi: m => `<button class="alt" onclick="bukaModul('${m.id}')">👁️ Lihat</button><button class="alt" onclick="cetakModul('${m.id}')">🖨️ Simpan PDF</button>`
      },
      kuis: {
        tabel: 'kuis', pubTabel: 'kuis_published', fk: 'kuis_id', el: 'listBankSoal', nama: 'soal',
        anak: [['nilai_kuis', 'kuis_id']], dampak: ' dan nilai siswa untuk soal ini',
        judul: q => {
          const s = String(q.pertanyaan || q.judul || '(tanpa soal)').replace(/\s+/g, ' ').trim();
          return s.length > 110 ? s.slice(0, 110) + '…' : s;
        },
        cari: q => `${q.judul || ''} ${q.pertanyaan || ''} ${q.topik || ''} ${q.tingkat || ''}`,
        sub: q => escHtml([TIPE_LABEL[q.tipe || 'pg'] || 'Pilihan Ganda', q.topik, q.tingkat, q.level_kognitif, q.judul].filter(Boolean).join(' • ')),
        detail: q => soalDetailHTML(q),
        aksi: q => `<button class="alt" onclick="paketTambah('${q.id}')">${paketSel.includes(String(q.id)) ? '➖ Keluarkan dari paket' : '➕ Tambah ke paket'}</button>`
      },
      paket: {
        tabel: 'paket', pubTabel: 'paket_published', fk: 'paket_id', el: 'listPaket', nama: 'paket',
        anak: [], dampak: ', soal beku di dalam paket, dan SEMUA hasil pengerjaan siswa',
        judul: p => p.judul || '(tanpa judul)',
        cari: p => `${p.judul || ''} ${p.jenis || ''}`,
        sub: p => escHtml(paketRingkas(p)),
        detail: p => paketDetailHTML(p),
        aksi: p => `<button class="alt" onclick="paketLihat('${p.id}')">${paketLihatOpen.has(String(p.id)) ? '🙈 Sembunyikan soal' : '👁️ Lihat soal & kunci'}</button><button class="alt" onclick="paketHasil('${p.id}')">${paketHasilOpen.has(String(p.id)) ? '🙈 Sembunyikan hasil' : '📊 Hasil siswa'}</button><button class="alt" onclick="paketAnalisis('${p.id}')">${paketAnalisisOpen.has(String(p.id)) ? '🙈 Sembunyikan analisis' : '📈 Analisis soal'}</button><button class="alt" onclick="paketAtur('${p.id}')">${paketEditId === String(p.id) ? '✖️ Tutup pengaturan' : '⚙️ Atur'}</button>`
      },
      tugas: {
        tabel: 'tugas', pubTabel: 'tugas_published', fk: 'tugas_id', el: 'listBankTugas', nama: 'tugas',
        anak: [['pengumpulan', 'tugas_id']], dampak: ' dan pengumpulan tugas siswa',
        judul: x => x.judul || '(tanpa judul)',
        cari: x => `${x.judul || ''} ${x.deskripsi || ''} ${x.topik || ''}`,
        sub: x => escHtml((LAB_JENIS[x.jenis] || 'Buat program') + (x.topik ? ' • ' + x.topik : '') + ' • ' + (x.deskripsi || '').slice(0, 70)),
        detail: x => tugasDetailHTML(x),
        aksi: x => `<button class="alt" onclick="tugasEdit('${x.id}')">✏️ Edit</button><button class="alt" onclick="tugasKum('${x.id}')">${tugasKumOpen.has(String(x.id)) ? '🙈 Sembunyikan pengumpulan' : '📥 Pengumpulan siswa'}</button>`
      }
    };

    const bankState = {};
    Object.keys(BANK).forEach(k => {
      bankState[k] = { items: [], pub: {}, q: '', page: 1, arsip: false, open: new Set(), siap: false };
    });

    const urutKelas = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

    function buildBankShell(key) {
      const cfg = BANK[key];
      document.getElementById(cfg.el).innerHTML = `
        <div class="bank-toolbar">
          <input type="text" id="bank-${key}-q" placeholder="🔍 Cari ${cfg.nama}..." oninput="bankCari('${key}', this.value)">
          <select id="bank-${key}-mode" onchange="bankMode('${key}', this.value)">
            <option value="aktif">Tampilkan: Aktif</option>
            <option value="arsip">Tampilkan: Arsip</option>
          </select>
        </div>
        <div class="mu" id="bank-${key}-info" style="margin-bottom:10px;"></div>
        <div id="bank-${key}-list"></div>
        <div id="bank-${key}-pager" class="bank-pager"></div>`;
      bankState[key].siap = true;
    }

    // Soal (beserta kunci) dibaca guru lewat RPC yang memeriksa akun guru, supaya browser siswa
    // tidak bisa membaca kunci langsung dari tabel. Bila SQL penutup akses belum dijalankan, pakai cara lama.
    async function ambilSoalGuru() {
      const r = await db.rpc('guru_daftar_soal', { p_user: activeUser.username, p_pass: sesiToken });
      if (!r.error) return { data: r.data || [], error: null };
      if (galatSesi(r.error.message)) { sesiHabis(); return { data: [], error: r.error }; }
      if (/function|schema cache|does not exist/i.test(r.error.message || '')) return db.from('kuis').select('*');
      return r;
    }

    // Daftar siswa per kelas untuk guru. Tabel siswa tertutup dari browser (keamanan_4a.sql),
    // jadi dibaca lewat RPC bertoken. Hasil: { data: [{id, nama, kelas}], error }
    async function ambilSiswaKelas(kelas) {
      const daftar = (Array.isArray(kelas) ? kelas : [kelas]).filter(Boolean).map(String);
      if (!daftar.length) return { data: [], error: null };
      const r = await db.rpc('guru_daftar_siswa', { p_user: activeUser.username, p_pass: sesiToken, p_kelas: daftar });
      if (r.error) {
        if (galatSesi(r.error.message)) sesiHabis();
        else if (/function|schema cache|does not exist/i.test(r.error.message || '')) r.error.message += ' (jalankan keamanan_4a.sql)';
        return { data: null, error: r.error };
      }
      return { data: r.data || [], error: null };
    }

    async function loadBank(key) {
      const cfg = BANK[key], st = bankState[key];
      if (!st.siap) buildBankShell(key);
      const [r1, r2] = await Promise.all([
        key === 'kuis' ? ambilSoalGuru() : db.from(cfg.tabel).select('*'),
        db.from(cfg.pubTabel).select('*')
      ]);
      if (r1.error) {
        document.getElementById(`bank-${key}-list`).innerHTML = `<p class="mu">Gagal memuat: ${escHtml(r1.error.message)}</p>`;
        return;
      }
      st.items = r1.data || [];
      st.pub = {};
      (r2.data || []).forEach(p => {
        const k = String(p[cfg.fk]);
        if (!st.pub[k]) st.pub[k] = [];
        st.pub[k].push(p.kelas);
      });
      if (key === 'materi') {
        st.items.forEach(m => { materiCache[m.id] = m; });
        isiPilihanMateriAI();
      }
      renderBank(key);
    }

    function statusPublishHTML(kelas) {
      if (!kelas.length) return '<span class="badge warn">Belum dipublish</span>';
      if (kelas.length >= DAFTAR_KELAS.length) return `<span class="badge ok">✅ Semua kelas (${kelas.length})</span>`;
      const tampil = kelas.slice(0, 3).join(', ') + (kelas.length > 3 ? ` +${kelas.length - 3}` : '');
      return `<span class="badge ok">✅ ${kelas.length} kelas: ${tampil}</span>`;
    }

    function renderBank(key) {
      const cfg = BANK[key], st = bankState[key];
      const q = st.q.trim().toLowerCase();
      let items = st.items.filter(i => !!i.diarsipkan === st.arsip);
      if (q) items = items.filter(i => cfg.cari(i).toLowerCase().includes(q));

      items = items.slice();
      if (items.some(i => i.created_at)) items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      else items.reverse();

      const total = items.length;
      const jumlahHal = Math.max(1, Math.ceil(total / PER_HALAMAN));
      if (st.page > jumlahHal) st.page = jumlahHal;
      const potong = items.slice((st.page - 1) * PER_HALAMAN, st.page * PER_HALAMAN);

      const nAktif = st.items.filter(i => !i.diarsipkan).length;
      const nArsip = st.items.length - nAktif;
      document.getElementById(`bank-${key}-info`).textContent =
        `${total} ${cfg.nama}${q ? ' ditemukan' : (st.arsip ? ' di arsip' : ' aktif')}  •  Total aktif: ${nAktif}  •  Arsip: ${nArsip}`;

      document.getElementById(`bank-${key}-list`).innerHTML = potong.length
        ? potong.map(i => bankRowHTML(key, i)).join('')
        : `<p class="mu">${q ? 'Tidak ada yang cocok dengan pencarian.' : (st.arsip ? 'Arsip kosong.' : 'Belum ada data.')}</p>`;

      document.getElementById(`bank-${key}-pager`).innerHTML = jumlahHal > 1
        ? `<button class="alt" onclick="bankHal('${key}', -1)" ${st.page <= 1 ? 'disabled' : ''}>‹ Sebelumnya</button>
           <span class="mu">Hal ${st.page} / ${jumlahHal}</span>
           <button class="alt" onclick="bankHal('${key}', 1)" ${st.page >= jumlahHal ? 'disabled' : ''}>Berikutnya ›</button>`
        : '';
    }

    function bankRowHTML(key, i) {
      const cfg = BANK[key], st = bankState[key];
      const id = String(i.id);
      const open = st.open.has(id);
      const kelas = (st.pub[id] || []).slice().sort(urutKelas);
      const arsip = !!i.diarsipkan;
      const status = arsip ? '<span class="badge bad">🗄️ Diarsipkan</span>' : statusPublishHTML(kelas);
      const tgl = i.created_at ? ' • ' + new Date(i.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

      let body = '';
      if (open) {
        const aksi = cfg.aksi(i);
        body = `
          <div class="bank-body">
            <div class="bank-detail">${cfg.detail(i)}</div>
            ${aksi ? `<div class="bank-actions">${aksi}</div>` : ''}
            ${arsip ? '<p class="mu">Materi diarsipkan: tidak terlihat siswa. Pulihkan dulu untuk mengatur publish.</p>' : publishPanelHTML(key, id)}
            <div class="bank-actions" style="margin-top:12px; border-top:1px dashed var(--bd); padding-top:12px;">
              ${arsip
                ? `<button class="alt" onclick="bankArsip('${key}', '${id}', false)">♻️ Pulihkan</button>
                   <button class="alt danger" onclick="bankHapus('${key}', '${id}')">🗑️ Hapus permanen</button>`
                : `<button class="alt" onclick="bankArsip('${key}', '${id}', true)">🗄️ Arsipkan</button>`}
            </div>
          </div>`;
      }

      return `
        <div class="bank-row ${open ? 'open' : ''}">
          <div class="bank-head" onclick="bankToggle('${key}', '${id}')">
            <span class="bank-caret">${open ? '▾' : '▸'}</span>
            <div class="bank-title">
              <b>${escHtml(cfg.judul(i))}</b>
              <div class="bank-sub">${cfg.sub(i)}${tgl}</div>
            </div>
            <div class="bank-status">${status}</div>
          </div>
          ${body}
        </div>`;
    }

    function bankToggle(key, id) {
      const s = bankState[key].open;
      if (s.has(id)) s.delete(id); else s.add(id);
      renderBank(key);
    }
    function bankCari(key, v) { bankState[key].q = v; bankState[key].page = 1; renderBank(key); }
    function bankMode(key, v) { bankState[key].arsip = (v === 'arsip'); bankState[key].page = 1; renderBank(key); }
    function bankHal(key, d) { bankState[key].page += d; renderBank(key); }

    // Semua tulisan guru lewat fungsi server bertoken (keamanan_4c.sql). Hasil: { data, error }.
    async function guruRPC(nama, params = {}) {
      const r = await db.rpc(nama, { p_user: activeUser.username, p_pass: sesiToken, ...params });
      if (r.error) {
        if (galatSesi(r.error.message)) sesiHabis();
        else if (/function|schema cache|does not exist/i.test(r.error.message || '')) r.error.message += ' (jalankan keamanan_4c.sql di Supabase)';
      }
      return r;
    }

    // Baca hasil kerja siswa lewat server (keamanan_5.sql). Hasil: { data: [...], error }.
    // Siswa hanya menerima data miliknya sendiri; guru memakai token guru.
    async function siswaBaca(tabel, opsi = {}) {
      const r = await db.rpc('siswa_baca', { p_token: sesiToken, p_tabel: tabel, p_level: opsi.level ?? null, p_limit: opsi.limit ?? 500 });
      if (r.error && galatSesi(r.error.message)) sesiHabis();
      return { data: r.error ? null : (r.data || []), error: r.error };
    }
    async function guruBaca(tabel, kolom = null, nilai = null, limit = 5000) {
      const r = await guruRPC('guru_baca', { p_tabel: tabel, p_kolom: kolom, p_nilai: nilai ? nilai.map(String) : null, p_limit: limit });
      return { data: r.error ? null : (r.data || []), error: r.error };
    }

    async function bankArsip(key, id, flag) {
      const cfg = BANK[key];
      const item = bankState[key].items.find(x => String(x.id) === String(id));
      if (flag && !confirm(`Arsipkan "${item ? cfg.judul(item) : ''}"?\n\nTidak lagi terlihat siswa. Data & status publish tetap tersimpan dan bisa dipulihkan.`)) return;
      const { error } = await guruRPC('guru_simpan', { p_tabel: cfg.tabel, p_data: { diarsipkan: flag }, p_id: String(id) });
      if (error) {
        return alert('Gagal: ' + error.message + (/diarsipkan/.test(error.message) ? '\n\nKolom "diarsipkan" belum ada. Jalankan SQL penambahan kolom di Supabase dulu.' : ''));
      }
      bankState[key].open.delete(String(id));
      await loadBank(key);
    }

    async function bankHapus(key, id) {
      const cfg = BANK[key];
      const item = bankState[key].items.find(x => String(x.id) === String(id));
      if (!item) return;
      if (!confirm(`Hapus PERMANEN "${cfg.judul(item)}"?\n\nIkut terhapus: status publish${cfg.dampak}.\nTidak bisa dibatalkan.`)) return;
      // Server menghapus status publish & data turunannya (lihat guru_hapus di keamanan_4c.sql)
      const { error } = await guruRPC('guru_hapus', { p_bank: key, p_id: String(id) });
      if (error) return alert('Gagal menghapus: ' + error.message);
      bankState[key].open.delete(String(id));
      await loadBank(key);
    }

    // ---------- Panel publish: status per kelas, publish & tarik ----------
    function publishPanelHTML(key, id) {
      const tayang = new Set(bankState[key].pub[String(id)] || []);
      const chips = DAFTAR_KELAS.map(k =>
        `<label class="chip ${tayang.has(k) ? 'on' : ''}"><input type="checkbox" value="${k}"> ${tayang.has(k) ? '✓ ' : ''}${k}</label>`
      ).join('');
      return `
        <div class="publish-panel" data-key="${key}" data-id="${id}">
          <div class="mu" style="font-weight:600; margin-bottom:4px;">Status & atur publish per kelas</div>
          <div class="mu" style="font-size:0.78rem; margin-bottom:8px;">Hijau ✓ = sudah tayang di kelas itu. Centang kelas, lalu pilih Publish atau Tarik.</div>
          <div class="chips">${chips}</div>
          <div class="bank-actions" style="margin-top:10px;">
            <button class="alt" onclick="pilihSemuaKelas(this)">Pilih semua</button>
            <button onclick="publishTerpilih(this)">📤 Publish ke terpilih</button>
            <button class="alt danger" onclick="tarikTerpilih(this)">↩️ Tarik dari terpilih</button>
          </div>
        </div>`;
    }

    function pilihSemuaKelas(btn) {
      const boxes = btn.closest('.publish-panel').querySelectorAll('input[type=checkbox]');
      const semua = [...boxes].every(b => b.checked);
      boxes.forEach(b => b.checked = !semua);
    }

    async function publishTerpilih(btn) {
      const panel = btn.closest('.publish-panel');
      const key = panel.dataset.key, id = panel.dataset.id, cfg = BANK[key];
      const dipilih = [...panel.querySelectorAll('input:checked')].map(c => c.value);
      if (dipilih.length === 0) return alert('Pilih minimal satu kelas.');

      const sudah = new Set(bankState[key].pub[String(id)] || []);
      const baru = dipilih.filter(k => !sudah.has(k));
      if (baru.length === 0) return alert('Semua kelas yang dipilih sudah tayang.');

      const { error } = await guruRPC('guru_publish', { p_bank: key, p_id: String(id), p_kelas: baru });
      if (error) return alert('Gagal publish: ' + error.message);
      await loadBank(key);
    }

    async function tarikTerpilih(btn) {
      const panel = btn.closest('.publish-panel');
      const key = panel.dataset.key, id = panel.dataset.id, cfg = BANK[key];
      const dipilih = [...panel.querySelectorAll('input:checked')].map(c => c.value);
      const sudah = new Set(bankState[key].pub[String(id)] || []);
      const tarik = dipilih.filter(k => sudah.has(k));
      if (tarik.length === 0) return alert('Centang kelas yang sudah tayang (hijau ✓) untuk ditarik.');
      if (!confirm(`Tarik dari kelas: ${tarik.join(', ')}?\n\nSiswa di kelas itu tidak akan melihatnya lagi.`)) return;

      const { error } = await guruRPC('guru_tarik', { p_bank: key, p_id: String(id), p_kelas: tarik });
      if (error) return alert('Gagal menarik: ' + error.message);
      await loadBank(key);
    }

    let activeUser = null;
    // Token sesi dari fungsi SQL "masuk" (keamanan_1.sql). Dipakai menggantikan password
    // untuk RPC guru (parameter p_pass) dan Edge Function kuis-siswa. Password tidak disimpan di browser.
    let sesiToken = null;
    let workspace = null;
    let selectedTugasId = null;
    let activeMateriMode = 'ai';

    let startTime = null;
    let actionCount = 0;
    let timerInterval = null;

    async function handleLogin() {
      const u = document.getElementById('loginUser').value.trim();
      const p = document.getElementById('loginPass').value.trim();
      const err = document.getElementById('loginErr');

      if (!u || !p) {
        err.textContent = 'Isi username dan password!';
        return;
      }

      err.textContent = 'Memeriksa akun...';

      try {
        // Login diperiksa di server (password tersimpan sebagai hash). Hasilnya token sesi + data akun tanpa password.
        const { data, error } = await db.rpc('masuk', { p_user: u, p_pass: p });
        if (error) {
          err.textContent = /function|schema cache|does not exist/i.test(error.message || '')
            ? 'Server belum diperbarui (keamanan_1.sql belum dijalankan).'
            : 'Gagal terhubung ke database.';
          console.error(error);
          return;
        }
        if (data && data.token && data.akun && (data.peran === 'guru' || data.peran === 'siswa')) {
          sesiToken = data.token;
          activeUser = { ...data.akun, role: data.peran };
          sesiMulai();
          initDashboard();
          return;
        }

        err.textContent = 'Username atau password salah!';
      } catch (error) {
        err.textContent = 'Gagal terhubung ke database.';
        console.error(error);
      }
    }

    function initDashboard() {
      document.getElementById('viewLogin').classList.add('hidden');
      document.getElementById('appLayout').classList.remove('hidden');
      document.getElementById('userInfo').classList.remove('hidden');
      document.getElementById('userName').textContent = `${activeUser.nama} (${activeUser.role.toUpperCase()})`;

      if (activeUser.role === 'guru') {
        document.getElementById('navKoreksi').classList.remove('hidden');
        document.getElementById('guruMateriView').classList.remove('hidden');
        document.getElementById('guruKuisView').classList.remove('hidden');
        document.getElementById('guruLabView').classList.remove('hidden');
        loadBankMateriGuru();
        loadBankSoalGuru();
        loadPaketGuru();
        loadBankTugasGuru();
        tugasFormInit();
        document.getElementById('filterKelasGroup').innerHTML = DAFTAR_KELAS.map(k => `<option value="${k}">Kelas ${k}</option>`).join('');
        renderModul4PerKelas();
        robotGuruInit();
        if (typeof jadwalInit === 'function') jadwalInit();
      } else {
        // Siswa tidak perlu melihat kata "Bank" (istilah untuk guru)
        const labelSiswa = ['Materi & Modul', 'Kuis', 'Lab Koding'];
        document.querySelectorAll('.sidebar .nav-teks').forEach((el, i) => { if (labelSiswa[i]) el.textContent = labelSiswa[i]; });
        document.getElementById('siswaMateriView').classList.remove('hidden');
        document.getElementById('siswaKuisView').classList.remove('hidden');
        document.getElementById('siswaLabView').classList.remove('hidden');
        loadMateriSiswa();
        loadKuisSiswa();
        loadTugasSiswa();
        disablePasteInApp();
        if (typeof jadwalInitSiswa === 'function') jadwalInitSiswa();
        setTimeout(chatMuat, 1500);
      }
      jadwalCekMuatan();
    }

    function switchTab(tabName) {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));

      if (tabName === 'materi') {
        document.querySelectorAll('.nav-item')[0].classList.add('active');
        document.getElementById('tabMateri').classList.remove('hidden');
      } else if (tabName === 'kuis') {
        document.querySelectorAll('.nav-item')[1].classList.add('active');
        document.getElementById('tabKuis').classList.remove('hidden');
      } else if (tabName === 'lab') {
        document.querySelectorAll('.nav-item')[2].classList.add('active');
        document.getElementById('tabLab').classList.remove('hidden');
        if (activeUser && activeUser.role === 'guru') isiPilihanMateriTugas();
      } else if (tabName === 'koreksi') {
        document.getElementById('navKoreksi').classList.add('active');
        document.getElementById('tabKoreksi').classList.remove('hidden');
      } else if (tabName === 'jadwal') {
        document.getElementById('navJadwal').classList.add('active');
        document.getElementById('tabJadwal').classList.remove('hidden');
        if (typeof jadwalTabDibuka === 'function') jadwalTabDibuka();
      }
      keranjangUpdate();
      if (activeUser) sesiSimpan({ tab: tabName });
    }

    function logout() {
      const t = sesiToken;
      sesiHapus();
      const pulang = () => location.reload();
      if (!t) return pulang();
      // Hapus token di server (maksimal tunggu 3 detik), lalu muat ulang.
      Promise.race([db.rpc('keluar', { p_token: t }), new Promise(r => setTimeout(r, 3000))]).finally(pulang);
    }

    // Dipanggil bila server menolak token (kedaluwarsa 12 jam, sudah keluar di perangkat lain, dsb.)
    let sesiHabisJalan = false;
    function sesiHabis(pesan) {
      if (sesiHabisJalan) return;
      sesiHabisJalan = true;
      sesiHapus();
      try { sessionStorage.setItem('lms_pesan_login', pesan || 'Sesi berakhir. Silakan masuk lagi.'); } catch (_) {}
      location.reload();
    }
    const galatSesi = (msg) => /sesi guru tidak berlaku|Sesi berakhir|Belum login/i.test(String(msg || ''));

    function disablePasteInApp() {
      document.addEventListener('paste', (e) => {
        e.preventDefault();
        alert('⚠️ Fitur Paste dimatikan demi menjaga kejujuran pengerjaan!');
      });
      document.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    function shuffleArray(array) {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

