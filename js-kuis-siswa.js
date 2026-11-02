// LMS Informatika SMA — js-kuis-siswa.js: Pengerjaan kuis siswa (dinilai server).
// Dipecah dari index.html (2 Nov 2026), isi tidak diubah. File js-*.js dimuat berurutan oleh index.html.
    // ================= TAHAP 2B: KUIS SISWA (dinilai di SERVER) =================
    // Siswa tidak pernah menerima kunci jawaban sebelum mengirim. Semua lewat Edge Function "kuis-siswa".
    const KUIS_URL = `${SUPABASE_URL}/functions/v1/kuis-siswa`;
    let kuisDaftar = [];
    let sesi = null;          // sesi pengerjaan yang sedang berjalan
    let kuisBusy = false;

    async function kuisAPI(aksi, extra = {}, opsi = {}) {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), opsi.timeout || 30000);
      try {
        const res = await fetch(KUIS_URL, {
          method: 'POST',
          keepalive: !!opsi.keepalive,
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ aksi, token: sesiToken, ...extra }),
          signal: ctrl.signal
        });
        let data;
        try { data = await res.json(); } catch (_) { throw new Error('Respons server tidak terbaca (HTTP ' + res.status + ')'); }
        if (res.status === 401) sesiHabis(data.error || 'Sesi berakhir. Silakan masuk lagi.');
        if (!res.ok || data.error) { const e = new Error(data.error || ('HTTP ' + res.status)); e.status = res.status; throw e; }
        return data;
      } catch (e) {
        if (e.name === 'AbortError') { const x = new Error('Server tidak merespons. Periksa koneksi internet lalu coba lagi.'); x.jaringan = true; throw x; }
        if (/Load failed|Failed to fetch|NetworkError/i.test(e.message || '')) { const x = new Error('Koneksi terputus. Periksa internet lalu coba lagi.'); x.jaringan = true; throw x; }
        throw e;
      } finally { clearTimeout(tm); }
    }

    // ---------- Daftar paket ----------
    async function loadKuisSiswa() {
      const box = $id('listKuisSiswa');
      if (!box) return;
      try {
        const d = await kuisAPI('daftar');
        kuisDaftar = d.paket || [];
        box.innerHTML = kuisDaftar.length
          ? kuisDaftar.map(kuisPaketHTML).join('')
          : '<p class="mu">Belum ada kuis yang dibuka untuk kelasmu.</p>';
      } catch (e) {
        box.innerHTML = `<p class="mu">Gagal memuat kuis: ${escHtml(e.message)}</p><button class="alt" onclick="loadKuisSiswa()">🔄 Coba lagi</button>`;
      }
    }

    function kuisPaketHTML(p) {
      const adaSisa = p.sisa > 0;
      const lencana = [
        `<span class="badge">${escHtml(JENIS_PAKET[p.jenis] || p.jenis)}</span>`,
        `<span class="badge">${p.jumlah_soal || 0} soal</span>`,
        `<span class="badge">${p.durasi_menit ? p.durasi_menit + ' menit' : 'tanpa timer'}</span>`,
        `<span class="badge">Percobaan ${p.selesai.length}/${p.maks_percobaan}</span>`
      ];
      if (p.status === 'belum_buka') lencana.push('<span class="badge warn">⏳ Belum dibuka</span>');
      else if (p.status === 'tutup') lencana.push('<span class="badge bad">🔒 Ditutup</span>');
      else if (p.aktif) lencana.push('<span class="badge warn">✍️ Sedang dikerjakan</span>');
      if (p.skor_terbaik !== null) lencana.push(`<span class="badge ok">Skor terbaik ${p.skor_terbaik}</span>`);

      let aksi = '';
      if (p.aktif) aksi = `<button onclick="mulaiKuis(${p.id})">↻ Lanjutkan pengerjaan</button>`;
      else if (p.status === 'buka' && adaSisa) aksi = `<button onclick="mulaiKuis(${p.id})">${p.selesai.length ? '🔁 Coba lagi' : '▶ Mulai'}</button>`;
      else if (p.status === 'belum_buka') aksi = `<span class="mu">Dibuka ${p.buka_at ? escHtml(tglPendek(p.buka_at)) : 'segera'}.</span>`;
      else if (p.status === 'tutup') aksi = '<span class="mu">Paket sudah ditutup.</span>';
      else aksi = '<span class="mu">Batas percobaan sudah habis.</span>';

      const riwayat = p.selesai.length
        ? `<div class="ks-riwayat">${p.selesai.map(x =>
            `<div class="ks-riw"><span>Percobaan ${x.ke}: <b>${x.skor}</b>${x.terlambat ? ' <span class="badge warn">terlambat</span>' : ''}</span>
             <button class="alt" onclick="lihatHasil(${x.id})">Lihat hasil</button></div>`).join('')}</div>`
        : '';

      return `
        <div class="card ks-paket">
          <b style="font-size:1.05rem;">${escHtml(p.judul)}</b>
          <div class="ks-badges">${lencana.join('')}</div>
          <div class="mu" style="margin:6px 0;">Jadwal: ${escHtml(jadwalTeks(p))}</div>
          <div class="ks-aksi">${aksi}</div>
          ${riwayat}
        </div>`;
    }

    // ---------- Mulai & sesi pengerjaan ----------
    async function mulaiKuis(paketId) {
      if (kuisBusy || sesi) return;
      const p = kuisDaftar.find(x => x.id === paketId);
      if (p && !p.aktif) {
        const lines = [];
        if (p.jenis === 'ulangan') lines.push('ULANGAN hanya bisa dikerjakan ' + p.maks_percobaan + ' kali.');
        if (p.durasi_menit) lines.push(`Timer ${p.durasi_menit} menit mulai berjalan setelah kamu menekan OK dan tetap berjalan walau halaman ditutup.`);
        if (lines.length && !confirm(lines.join('\n') + '\n\nMulai sekarang?')) return;
      }
      kuisBusy = true;
      try {
        const d = await kuisAPI('mulai', { paket_id: paketId }, { timeout: 40000 });
        mulaiSesi(d);
      } catch (e) {
        alert(e.message);
        loadKuisSiswa();
      } finally { kuisBusy = false; }
    }

    function normJawab(s, j) {
      if (s.tipe === 'pg') return Number.isInteger(j) ? j : null;
      if (s.tipe === 'pg_kompleks') return Array.isArray(j) ? j.filter(Number.isInteger) : [];
      const a = Array.isArray(j) ? j : [];
      return s.opsi.map((_, i) => typeof a[i] === 'boolean' ? a[i] : null);
    }

    function mulaiSesi(d) {
      sesi = {
        pid: d.percobaan_id, paketId: d.paket_id, judul: d.judul, jenis: d.jenis, ke: d.ke, maks: d.maks,
        soal: d.soal, jawab: d.soal.map((s, i) => normJawab(s, (d.jawaban || [])[i])),
        idx: 0, deadline: d.deadline ? Date.parse(d.deadline) : null,
        offset: Date.parse(d.sekarang) - Date.now(),
        mengirim: false, kotor: false, menyimpan: false, saveTimer: null, tick: null, cobaTerakhir: 0, kirimTerakhir: 0
      };
      $id('kuisDaftarWrap').classList.add('hidden');
      $id('hasilKuis').classList.add('hidden');
      $id('sesiKuis').classList.remove('hidden');
      $id('sesiKuis').innerHTML = `
        <div class="ks-bar">
          <div class="ks-judul"><b>${escHtml(sesi.judul)}</b><div class="mu" style="font-size:0.78rem;">Percobaan ke-${sesi.ke} dari ${sesi.maks}</div></div>
          <div class="ks-info"><span id="ksTimer" class="badge">--:--</span><span id="ksSimpan" class="mu" style="font-size:0.75rem;"></span></div>
        </div>
        <div id="ksSoal"></div>
        <div id="ksNav"></div>`;
      renderSoalSesi(); renderNavSesi();
      sesi.tick = setInterval(tickSesi, 500);
      tickSesi();
      window.addEventListener('beforeunload', peringatTutupKuis);
      document.addEventListener('visibilitychange', visKuis);
      window.scrollTo({ top: 0 });
    }

    function sisaDetik() { return sesi.deadline === null ? null : Math.floor((sesi.deadline - (Date.now() + sesi.offset)) / 1000); }

    function tickSesi() {
      if (!sesi) return;
      const el = $id('ksTimer');
      const sisa = sisaDetik();
      if (el) {
        if (sisa === null) { el.textContent = '∞ tanpa batas waktu'; }
        else {
          const s = Math.max(0, sisa), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), dt = s % 60;
          el.textContent = '⏱ ' + (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(dt).padStart(2, '0');
          el.className = 'badge ' + (sisa <= 60 ? 'bad' : sisa <= 300 ? 'warn' : '');
        }
      }
      if (sisa !== null && sisa <= 0 && !sesi.mengirim && Date.now() - sesi.kirimTerakhir > 6000) kirimSesi(true);
      if (sesi.kotor && !sesi.menyimpan && Date.now() - sesi.cobaTerakhir > 8000) simpanDraf();
    }

    function peringatTutupKuis(e) { if (sesi) { e.preventDefault(); e.returnValue = ''; } }
    function visKuis() { if (document.hidden && sesi && sesi.kotor) simpanDraf(true); }

    function sudahJawab(i) {
      const s = sesi.soal[i], j = sesi.jawab[i];
      if (s.tipe === 'pg') return j !== null;
      if (s.tipe === 'pg_kompleks') return j.length > 0;
      return j.every(x => x !== null);
    }
    function sebagianJawab(i) {
      const s = sesi.soal[i], j = sesi.jawab[i];
      return s.tipe === 'bs' && j.some(x => x !== null) && !j.every(x => x !== null);
    }

    function renderSoalSesi() {
      const i = sesi.idx, s = sesi.soal[i], j = sesi.jawab[i];
      const petunjuk = s.tipe === 'pg' ? 'Pilih satu jawaban.'
        : s.tipe === 'pg_kompleks' ? 'Pilih semua jawaban yang benar (bisa lebih dari satu).'
        : 'Tentukan Benar atau Salah untuk setiap pernyataan.';
      let isi = '';
      if (s.tipe === 'pg') {
        isi = s.opsi.map((o, k) =>
          `<button type="button" class="quiz-option ${j === k ? 'sel' : ''}" onclick="pilihPG(${k})">${HURUF[k]}. ${escHtml(o)}</button>`).join('');
      } else if (s.tipe === 'pg_kompleks') {
        isi = s.opsi.map((o, k) =>
          `<label class="quiz-option cek ${j.includes(k) ? 'sel' : ''}"><input type="checkbox" ${j.includes(k) ? 'checked' : ''} onchange="pilihPGK(${k}, this.checked)"><span>${HURUF[k]}. ${escHtml(o)}</span></label>`).join('');
      } else {
        isi = s.opsi.map((o, k) => `
          <div class="bs-row">
            <div class="bs-teks">${k + 1}. ${escHtml(o)}</div>
            <div class="bs-pil">
              <label><input type="radio" name="bs-${i}-${k}" ${j[k] === true ? 'checked' : ''} onchange="pilihBS(${k}, true)"> Benar</label>
              <label><input type="radio" name="bs-${i}-${k}" ${j[k] === false ? 'checked' : ''} onchange="pilihBS(${k}, false)"> Salah</label>
            </div>
          </div>`).join('');
      }
      $id('ksSoal').innerHTML = `
        <div class="card">
          <div class="ks-badges"><span class="badge">Soal ${i + 1} dari ${sesi.soal.length}</span><span class="badge">${escHtml(TIPE_LABEL[s.tipe] || s.tipe)}</span></div>
          <div class="soal-teks" style="font-size:1.02rem; margin-top:10px;">${escHtml(s.pertanyaan)}</div>
          <div class="mu" style="margin:6px 0 10px;">${petunjuk}</div>
          ${isi}
        </div>`;
    }

    function renderNavSesi() {
      const n = sesi.soal.length;
      const terjawab = sesi.soal.filter((_, i) => sudahJawab(i)).length;
      const grid = sesi.soal.map((_, i) =>
        `<button type="button" class="ks-no ${i === sesi.idx ? 'now' : sudahJawab(i) ? 'done' : sebagianJawab(i) ? 'part' : ''}" onclick="pindahSoal(${i})">${i + 1}</button>`).join('');
      $id('ksNav').innerHTML = `
        <div class="card">
          <div class="ks-navbtn">
            <button type="button" class="alt" onclick="pindahSoal(${sesi.idx - 1})" ${sesi.idx === 0 ? 'disabled' : ''}>‹ Sebelumnya</button>
            <span class="mu">${terjawab}/${n} terjawab</span>
            <button type="button" class="alt" onclick="pindahSoal(${sesi.idx + 1})" ${sesi.idx >= n - 1 ? 'disabled' : ''}>Berikutnya ›</button>
          </div>
          <div class="ks-grid">${grid}</div>
          <button type="button" id="btnKirimSesi" class="ok" style="width:100%; margin-top:12px; padding:14px;" onclick="kirimSesi(false)">📤 Kirim Jawaban</button>
        </div>`;
    }

    function pindahSoal(i) {
      if (!sesi || i < 0 || i >= sesi.soal.length) return;
      sesi.idx = i;
      renderSoalSesi(); renderNavSesi();
      $id('sesiKuis').scrollIntoView({ block: 'start' });
    }
    function setelahUbah() { sesi.kotor = true; $id('ksSimpan').textContent = ''; renderNavSesi(); clearTimeout(sesi.saveTimer); sesi.saveTimer = setTimeout(simpanDraf, 1200); }
    function pilihPG(k) { if (!sesi || sesi.mengirim) return; sesi.jawab[sesi.idx] = k; renderSoalSesi(); setelahUbah(); }
    function pilihPGK(k, on) {
      if (!sesi || sesi.mengirim) return;
      const a = new Set(sesi.jawab[sesi.idx]); if (on) a.add(k); else a.delete(k);
      sesi.jawab[sesi.idx] = [...a].sort((x, y) => x - y);
      renderSoalSesi(); setelahUbah();
    }
    function pilihBS(k, v) { if (!sesi || sesi.mengirim) return; sesi.jawab[sesi.idx][k] = v; renderNavSesi(); setelahUbah(); }

    // Simpan otomatis jawaban sementara (draf) — melindungi dari tab tertutup / koneksi putus
    async function simpanDraf(keepalive) {
      if (!sesi || sesi.mengirim || !sesi.kotor || sesi.menyimpan) return;
      sesi.menyimpan = true; sesi.kotor = false; sesi.cobaTerakhir = Date.now();
      const info = $id('ksSimpan');
      try {
        await kuisAPI('simpan', { percobaan_id: sesi.pid, jawaban: sesi.jawab }, { keepalive: !!keepalive, timeout: 15000 });
        if (info) info.textContent = '✓ tersimpan otomatis';
      } catch (e) {
        if (sesi) sesi.kotor = true;
        if (info) info.textContent = '⚠️ belum tersimpan, mencoba lagi…';
      } finally { if (sesi) sesi.menyimpan = false; }
    }

    async function kirimSesi(otomatis) {
      if (!sesi || sesi.mengirim) return;
      if (!otomatis) {
        const kosong = sesi.soal.filter((_, i) => !sudahJawab(i)).length;
        const pesan = (kosong ? `Masih ada ${kosong} soal yang belum dijawab penuh. ` : '') + 'Kirim jawaban sekarang? Jawaban tidak bisa diubah setelah dikirim.';
        if (!confirm(pesan)) return;
      }
      sesi.mengirim = true; sesi.kirimTerakhir = Date.now();
      clearTimeout(sesi.saveTimer);
      const btn = $id('btnKirimSesi');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Mengirim…'; }
      try {
        const h = await kuisAPI('kirim', { percobaan_id: sesi.pid, jawaban: sesi.jawab }, { timeout: 45000 });
        akhiriSesi();
        tampilHasil(h, otomatis);
      } catch (e) {
        if (!sesi) return;
        sesi.mengirim = false;
        if (btn) { btn.disabled = false; btn.textContent = '📤 Kirim Jawaban'; }
        alert('Jawaban belum terkirim: ' + e.message + '\n\nJawabanmu aman di halaman ini dan tersimpan otomatis. Periksa koneksi lalu tekan Kirim lagi.');
      }
    }

    function akhiriSesi() {
      if (sesi) { clearInterval(sesi.tick); clearTimeout(sesi.saveTimer); }
      sesi = null;
      window.removeEventListener('beforeunload', peringatTutupKuis);
      document.removeEventListener('visibilitychange', visKuis);
      $id('sesiKuis').classList.add('hidden');
      $id('sesiKuis').innerHTML = '';
    }

    // ---------- Hasil & pembahasan ----------
    async function lihatHasil(percobaanId) {
      try { tampilHasil(await kuisAPI('hasil', { percobaan_id: percobaanId })); }
      catch (e) { alert(e.message); }
    }

    function kembaliKeDaftar() {
      $id('hasilKuis').classList.add('hidden');
      $id('kuisDaftarWrap').classList.remove('hidden');
      loadKuisSiswa();
    }

    function tampilHasil(h, otomatis) {
      $id('kuisDaftarWrap').classList.add('hidden');
      const box = $id('hasilKuis');
      box.classList.remove('hidden');
      const catatan = [];
      if (otomatis) catatan.push('⏰ Waktu habis, jawabanmu dikirim otomatis.');
      if (h.terlambat && !otomatis) catatan.push('Kiriman ini melewati batas waktu.');
      let pembahasan = '';
      if (h.review_status === 'tampil' && h.review) pembahasan = `<h3 style="margin:16px 0 8px;">📝 Pembahasan</h3>` + h.review.map(reviewHTML).join('');
      else if (h.review_status === 'nanti') pembahasan = `<div class="card"><p class="mu">🔒 Pembahasan akan dibuka setelah paket ditutup${h.tutup_at ? ' (' + escHtml(tglPendek(h.tutup_at)) + ')' : ''}.</p></div>`;
      else pembahasan = '<div class="card"><p class="mu">Pembahasan tidak ditampilkan untuk paket ini.</p></div>';
      const bisaUlang = h.sisa > 0 && h.status_paket === 'buka';
      box.innerHTML = `
        <div class="card ks-skor">
          <div class="mu">${escHtml(h.judul)} • Percobaan ke-${h.ke}</div>
          <div class="ks-angka">${h.skor}</div>
          <div class="ks-badges" style="justify-content:center;">
            <span class="badge ok">${h.benar} dari ${h.jumlah_soal} soal benar penuh</span>
            ${h.skor_terbaik !== null ? `<span class="badge">Skor terbaik ${h.skor_terbaik}</span>` : ''}
            <span class="badge">Sisa percobaan ${h.sisa}</span>
          </div>
          ${catatan.map(c => `<p class="mu" style="margin-top:8px;">${escHtml(c)}</p>`).join('')}
          <div class="ks-aksi" style="justify-content:center; margin-top:12px;">
            <button class="alt" onclick="kembaliKeDaftar()">← Kembali ke daftar</button>
            ${bisaUlang ? `<button onclick="kembaliKeDaftar(); mulaiKuis(${h.paket_id})">🔁 Coba lagi</button>` : ''}
          </div>
        </div>
        ${pembahasan}`;
      window.scrollTo({ top: 0 });
    }

    function reviewHTML(r) {
      const nilai = r.skor >= 0.999 ? ['ok', '✅ Benar'] : r.skor > 0 ? ['warn', '🟡 Sebagian benar'] : ['bad', '❌ Salah / kosong'];
      let isi = '';
      if (r.tipe === 'pg') {
        isi = r.opsi.map((o, k) => {
          const cls = k === r.kunci ? 'benar' : (k === r.jawaban ? 'salah' : '');
          const tag = k === r.jawaban ? ' <span class="badge">jawabanmu</span>' : (k === r.kunci ? ' <span class="badge ok">kunci</span>' : '');
          return `<div class="quiz-option ${cls}">${HURUF[k]}. ${escHtml(o)}${tag}</div>`;
        }).join('');
      } else if (r.tipe === 'pg_kompleks') {
        const dip = new Set(r.jawaban || []), kun = new Set(r.kunci || []);
        isi = r.opsi.map((o, k) => {
          const cls = kun.has(k) ? 'benar' : (dip.has(k) ? 'salah' : '');
          const tag = dip.has(k) && kun.has(k) ? ' <span class="badge ok">dipilih ✓</span>' : dip.has(k) ? ' <span class="badge bad">dipilih ✗</span>' : (kun.has(k) ? ' <span class="badge warn">terlewat</span>' : '');
          return `<div class="quiz-option ${cls}">${HURUF[k]}. ${escHtml(o)}${tag}</div>`;
        }).join('');
      } else {
        const j = r.jawaban || [], kun = r.kunci || [];
        isi = r.opsi.map((o, k) => {
          const benar = typeof j[k] === 'boolean' && j[k] === kun[k];
          const kataJ = j[k] === true ? 'Benar' : j[k] === false ? 'Salah' : 'kosong';
          return `<div class="bs-row ${benar ? 'benar' : 'salah'}"><div class="bs-teks">${k + 1}. ${escHtml(o)}<div class="mu" style="font-size:0.82rem;">Jawabanmu: <b>${kataJ}</b> • Seharusnya: <b>${kun[k] ? 'Benar' : 'Salah'}</b></div></div></div>`;
        }).join('');
      }
      return `
        <div class="card">
          <div class="ks-badges"><span class="badge">Soal ${r.no}</span><span class="badge ${nilai[0]}">${nilai[1]}</span></div>
          <div class="soal-teks" style="margin-top:8px;">${escHtml(r.pertanyaan)}</div>
          <div style="margin-top:8px;">${isi}</div>
          ${r.pembahasan ? `<div class="pembahasan">💡 <b>Pembahasan</b><div class="soal-teks">${escHtml(r.pembahasan)}</div></div>` : ''}
        </div>`;
    }

