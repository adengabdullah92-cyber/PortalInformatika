// LMS Informatika SMA — js-jadwal.js: Jadwal mengajar + Daftar Hadir (tahap H1, khusus guru).
// Data di tabel semester/jadwal/libur/pertemuan/kehadiran (hadir_h1.sql), semuanya lewat fungsi guru bertoken.
// Kode kehadiran: H hadir, T terlambat (dihitung hadir), S sakit, I izin, D dispensasi (tidak menurunkan persentase), A alpa.

    const HD_KODE = [['H', 'Hadir'], ['T', 'Terlambat'], ['S', 'Sakit'], ['I', 'Izin'], ['D', 'Dispensasi'], ['A', 'Alpa']];
    const HD_HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    let hdData = null;        // guru_jadwal_data: semester, jadwal, libur
    let hdHari = null;        // guru_hari_ini untuk tanggal terpilih
    let hdHariIniStrip = null;// guru_hari_ini untuk HARI INI (strip atas)
    let hdAbsen = null;       // absen yang sedang dibuka
    let hdSiap = false;

    function hdTanggalHariIni() {
      try { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); }
      catch (_) { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    }
    function hdTglPanjang(iso) {
      if (!iso) return '';
      return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    const hdJam = (t) => String(t || '').slice(0, 5);
    function hdRingkasTeks(r) {
      if (!r || !r.total) return '';
      return HD_KODE.filter(([k]) => r[k]).map(([k]) => `${k} ${r[k]}`).join(' · ');
    }

    // ---------- Inisialisasi (dipanggil dari initDashboard guru) ----------
    function jadwalInit() {
      if (!activeUser || activeUser.role !== 'guru') return;
      $id('navJadwal').classList.remove('hidden');
      const opsiKelas = DAFTAR_KELAS.map(k => `<option value="${k}">${k}</option>`).join('');
      $id('jdKelas').innerHTML = opsiKelas;
      $id('jdLuarKelas').innerHTML = opsiKelas;
      $id('jdHari').innerHTML = HD_HARI.map((h, i) => i ? `<option value="${i}">${h}</option>` : '').join('');
      $id('jdTanggal').value = hdTanggalHariIni();
      hdSiap = true;
      jadwalMuatData();
      jadwalMuatHariIni();
      jadwalMuatStrip();
    }

    async function jadwalMuatData() {
      const r = await guruRPC('guru_jadwal_data');
      if (r.error) {
        $id('jdMingguan').innerHTML = `<p class="mu">Gagal memuat jadwal: ${escHtml(r.error.message)}${/function|schema cache|does not exist/i.test(r.error.message) ? ' (jalankan hadir_h1.sql)' : ''}</p>`;
        return;
      }
      hdData = r.data || { jadwal: [], libur: [] };
      jadwalRenderMingguan();
      jadwalRenderSemester();
    }

    async function jadwalMuatHariIni() {
      const tgl = $id('jdTanggal').value || hdTanggalHariIni();
      $id('jdHariIniList').innerHTML = '<p class="mu">Memuat…</p>';
      const r = await guruRPC('guru_hari_ini', { p_tanggal: tgl });
      if (r.error) { $id('jdHariIniList').innerHTML = `<p class="mu">Gagal memuat: ${escHtml(r.error.message)}</p>`; return; }
      hdHari = r.data;
      jadwalRenderHariIni();
      if (tgl === hdTanggalHariIni()) { hdHariIniStrip = r.data; jadwalRenderStrip(); }
    }

    async function jadwalMuatStrip() {
      const r = await guruRPC('guru_hari_ini', { p_tanggal: hdTanggalHariIni() });
      if (!r.error) { hdHariIniStrip = r.data; jadwalRenderStrip(); }
    }

    // ---------- Strip "Hari ini" di atas semua tab guru ----------
    function jadwalRenderStrip() {
      const el = $id('hariIniStrip'); if (!el) return;
      const d = hdHariIniStrip;
      if (!d || !activeUser || activeUser.role !== 'guru' || (!d.kelas.length && !d.libur_ada)) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      if (d.libur_ada) { el.innerHTML = `📅 <b>Hari ini libur</b>${d.libur ? ': ' + escHtml(d.libur) : ''}`; return; }
      el.innerHTML = `📅 <b>Hari ini:</b> ` + d.kelas.map((k, i) => {
        const sudah = k.ringkas && k.ringkas.total;
        return `<button type="button" class="hd-chip ${sudah ? 'sudah' : ''}" onclick="jadwalBukaDariStrip(${i})">${escHtml(k.jam_mulai)} ${escHtml(k.kelas)} ${sudah ? '✓' : '· Absen'}</button>`;
      }).join('');
    }

    function jadwalBukaDariStrip(i) {
      const k = hdHariIniStrip && hdHariIniStrip.kelas[i]; if (!k) return;
      switchTab('jadwal');
      $id('jdTanggal').value = hdHariIniStrip.tanggal;
      hdHari = hdHariIniStrip; jadwalRenderHariIni();
      jadwalBukaAbsen({ ...k, tanggal: hdHariIniStrip.tanggal });
    }

    // ---------- Daftar kelas pada tanggal terpilih ----------
    function jadwalRenderHariIni() {
      const d = hdHari; const box = $id('jdHariIniList'); if (!d || !box) return;
      let h = `<div class="mu" style="margin-bottom:8px;">${escHtml(hdTglPanjang(d.tanggal))}${d.semester ? ' • ' + escHtml(d.semester) : ''}</div>`;
      if (d.libur_ada) h += `<div class="hd-catatan">🏖️ Hari libur${d.libur ? ': ' + escHtml(d.libur) : ''}. Pertemuan terjadwal tidak ditampilkan.</div>`;
      if (d.di_luar_semester) h += `<div class="hd-catatan">ℹ️ Tanggal ini di luar semester aktif.</div>`;
      if (!d.kelas.length) h += '<p class="mu">Tidak ada pertemuan pada tanggal ini. Gunakan "Pertemuan di luar jadwal" bila perlu.</p>';
      h += d.kelas.map((k, i) => {
        const r = k.ringkas;
        return `<div class="hd-kelas">
          <div><b>${escHtml(k.jam_mulai)}–${escHtml(k.jam_selesai || '')} • Kelas ${escHtml(k.kelas)}</b>${k.di_luar_jadwal ? ' <span class="badge warn">di luar jadwal</span>' : ''}
            <div class="mu">${r && r.total ? '✅ ' + escHtml(hdRingkasTeks(r)) : 'Belum diabsen'}</div></div>
          <button type="button" ${r && r.total ? 'class="alt"' : ''} onclick="jadwalBukaIdx(${i})">${r && r.total ? '✏️ Ubah absen' : '📋 Absen'}</button>
        </div>`;
      }).join('');
      box.innerHTML = h;
    }

    function jadwalBukaIdx(i) {
      const k = hdHari && hdHari.kelas[i]; if (!k) return;
      jadwalBukaAbsen({ ...k, tanggal: hdHari.tanggal });
    }

    function jadwalLuarJadwal() {
      const mulai = $id('jdLuarMulai').value, selesai = $id('jdLuarSelesai').value;
      if (!mulai) return alert('Isi jam mulai.');
      if (selesai && selesai <= mulai) return alert('Jam selesai harus setelah jam mulai.');
      jadwalBukaAbsen({ kelas: $id('jdLuarKelas').value, jam_mulai: mulai, jam_selesai: selesai || null, jadwal_id: null, tanggal: $id('jdTanggal').value || hdTanggalHariIni() });
    }

    // ---------- Daftar hadir ----------
    async function jadwalBukaAbsen(k) {
      if (hdAbsen && hdAbsen.ubah && !confirm('Perubahan absen sebelumnya belum disimpan. Tinggalkan?')) return;
      const box = $id('jdAbsen');
      box.classList.remove('hidden');
      box.innerHTML = '<p class="mu">Memuat daftar siswa…</p>';
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const r = await guruRPC('guru_absen_ambil', { p_kelas: k.kelas, p_tanggal: k.tanggal, p_jam_mulai: k.jam_mulai });
      if (r.error) { box.innerHTML = `<p class="mu">Gagal memuat: ${escHtml(r.error.message)}</p>`; hdAbsen = null; return; }
      const d = r.data || {};
      const baru = !d.pertemuan;
      hdAbsen = {
        kelas: k.kelas, tanggal: k.tanggal, jam_mulai: k.jam_mulai, jam_selesai: k.jam_selesai || null, jadwal_id: k.jadwal_id || null,
        ke: d.ke, pertemuan: d.pertemuan, baru,
        siswa: (d.siswa || []).map(s => ({ id: s.id, nama: s.nama, status: s.status || 'H', keterangan: s.keterangan || '' })),
        ubah: baru && (d.siswa || []).length > 0
      };
      jadwalRenderAbsen();
    }

    function jadwalRenderAbsen() {
      const a = hdAbsen; const box = $id('jdAbsen'); if (!a || !box) return;
      const hitung = {}; HD_KODE.forEach(([k]) => hitung[k] = 0); a.siswa.forEach(s => hitung[s.status]++);
      let h = `<div class="hd-absen-head">
          <div><h3 style="margin:0;">📋 Kelas ${escHtml(a.kelas)} • ${escHtml(a.jam_mulai)}${a.jam_selesai ? '–' + escHtml(a.jam_selesai) : ''}</h3>
            <div class="mu">${escHtml(hdTglPanjang(a.tanggal))} • pertemuan ke-${escHtml(a.ke)}${a.baru ? ' • <b>belum disimpan</b>' : ''}</div></div>
          <button type="button" class="alt" onclick="jadwalTutupAbsen()">✕ Tutup</button>
        </div>`;
      if (!a.siswa.length) return box.innerHTML = h + '<p class="mu">Belum ada siswa terdaftar di kelas ini.</p>';
      h += `<div class="hd-ringkas">${HD_KODE.map(([k, n]) => `<span class="hd-tag hd-${k}" title="${n}">${k} ${hitung[k]}</span>`).join('')}
          <button type="button" class="alt" onclick="jadwalSemuaH()">Semua hadir</button></div>`;
      h += `<div class="hd-daftar">` + a.siswa.map((s, i) => `
        <div class="hd-siswa">
          <div class="hd-nama">${i + 1}. ${escHtml(s.nama)}</div>
          <div class="hd-seg">${HD_KODE.map(([k, n]) => `<button type="button" class="hd-${k} ${s.status === k ? 'on' : ''}" title="${n}" aria-label="${n}" onclick="jadwalSet(${i}, '${k}')">${k}</button>`).join('')}</div>
          ${s.status !== 'H' ? `<input type="text" class="hd-ket" maxlength="120" placeholder="Keterangan (opsional)" value="${escHtml(s.keterangan)}" oninput="jadwalKet(${i}, this.value)">` : ''}
        </div>`).join('') + `</div>`;
      h += `<div class="bank-actions" style="margin-top:12px;">
          <button type="button" id="jdSimpanBtn" onclick="jadwalSimpanAbsen()">💾 Simpan absen</button>
          ${a.pertemuan ? `<button type="button" class="alt danger" onclick="jadwalHapusPertemuan()">🗑️ Hapus pertemuan ini</button>` : ''}
        </div>
        <p class="mu" style="font-size:0.78rem;">H hadir • T terlambat (dihitung hadir) • S sakit • I izin • D dispensasi (tidak menurunkan persentase) • A alpa</p>`;
      box.innerHTML = h;
    }

    function jadwalSet(i, k) {
      const s = hdAbsen && hdAbsen.siswa[i]; if (!s) return;
      s.status = k; if (k === 'H') s.keterangan = '';
      hdAbsen.ubah = true; jadwalRenderAbsen();
    }
    function jadwalKet(i, v) { const s = hdAbsen && hdAbsen.siswa[i]; if (!s) return; s.keterangan = v; hdAbsen.ubah = true; }
    function jadwalSemuaH() {
      if (!hdAbsen) return;
      if (hdAbsen.siswa.some(s => s.status !== 'H') && !confirm('Ubah semua siswa menjadi Hadir?')) return;
      hdAbsen.siswa.forEach(s => { s.status = 'H'; s.keterangan = ''; });
      hdAbsen.ubah = true; jadwalRenderAbsen();
    }
    function jadwalTutupAbsen() {
      if (hdAbsen && hdAbsen.ubah && !confirm('Perubahan absen belum disimpan. Tutup?')) return;
      hdAbsen = null; $id('jdAbsen').classList.add('hidden'); $id('jdAbsen').innerHTML = '';
    }

    async function jadwalSimpanAbsen() {
      const a = hdAbsen; if (!a) return;
      const btn = $id('jdSimpanBtn'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyimpan…'; }
      const r = await guruRPC('guru_absen_simpan', {
        p_kelas: a.kelas, p_tanggal: a.tanggal, p_jam_mulai: a.jam_mulai, p_jam_selesai: a.jam_selesai, p_jadwal_id: a.jadwal_id,
        p_data: a.siswa.map(s => ({ siswa_id: s.id, status: s.status, keterangan: s.status === 'H' ? '' : s.keterangan }))
      });
      if (r.error) {
        if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan absen'; }
        return alert('Gagal menyimpan absen: ' + r.error.message);
      }
      a.ubah = false; a.baru = false; a.pertemuan = { id: r.data.pertemuan_id };
      jadwalRenderAbsen();
      const b2 = $id('jdSimpanBtn'); if (b2) { b2.textContent = '✅ Tersimpan'; setTimeout(() => { const b3 = $id('jdSimpanBtn'); if (b3) b3.textContent = '💾 Simpan absen'; }, 2000); }
      jadwalMuatHariIni();
      if (a.tanggal !== hdTanggalHariIni()) jadwalMuatStrip();
    }

    async function jadwalHapusPertemuan() {
      const a = hdAbsen; if (!a || !a.pertemuan) return;
      if (!confirm(`Hapus pertemuan Kelas ${a.kelas} ${a.jam_mulai} (${hdTglPanjang(a.tanggal)}) beserta seluruh absennya?`)) return;
      const r = await guruRPC('guru_pertemuan_hapus', { p_id: a.pertemuan.id });
      if (r.error) return alert('Gagal menghapus: ' + r.error.message);
      hdAbsen = null; $id('jdAbsen').classList.add('hidden'); $id('jdAbsen').innerHTML = '';
      jadwalMuatHariIni(); jadwalMuatStrip();
    }

    // ---------- Jadwal mingguan ----------
    function jadwalRenderMingguan() {
      const box = $id('jdMingguan'); if (!box || !hdData) return;
      const list = hdData.jadwal || [];
      if (!list.length) { box.innerHTML = '<p class="mu">Belum ada jadwal. Tambahkan di bawah.</p>'; return; }
      let h = '';
      for (let hr = 1; hr <= 7; hr++) {
        const j = list.filter(x => x.hari === hr); if (!j.length) continue;
        h += `<div class="hd-hari"><b>${HD_HARI[hr]}</b>${j.map(x => `
          <div class="hd-jadwal-row"><span>${escHtml(hdJam(x.jam_mulai))}–${escHtml(hdJam(x.jam_selesai))} • Kelas ${escHtml(x.kelas)}</span>
            <button type="button" class="alt danger" onclick="jadwalHapus(${Number(x.id)})" aria-label="Hapus">✕</button></div>`).join('')}</div>`;
      }
      box.innerHTML = h;
    }

    async function jadwalTambah() {
      const hari = Number($id('jdHari').value), mulai = $id('jdMulai').value, selesai = $id('jdSelesai').value, kelas = $id('jdKelas').value;
      if (!mulai || !selesai) return alert('Isi jam mulai dan jam selesai.');
      const r = await guruRPC('guru_jadwal_simpan', { p_hari: hari, p_mulai: mulai, p_selesai: selesai, p_kelas: kelas, p_id: null });
      if (r.error) return alert('Gagal menyimpan jadwal: ' + r.error.message);
      await jadwalMuatData(); jadwalMuatHariIni(); jadwalMuatStrip();
    }

    async function jadwalHapus(id) {
      const x = hdData && hdData.jadwal.find(j => Number(j.id) === id);
      if (!confirm(`Hapus jadwal ${x ? HD_HARI[x.hari] + ' ' + hdJam(x.jam_mulai) + ' Kelas ' + x.kelas : ''}?\n\nAbsen yang sudah tersimpan tetap ada.`)) return;
      const r = await guruRPC('guru_jadwal_hapus', { p_id: id });
      if (r.error) return alert('Gagal menghapus: ' + r.error.message);
      await jadwalMuatData(); jadwalMuatHariIni(); jadwalMuatStrip();
    }

    // ---------- Semester & hari libur ----------
    function jadwalRenderSemester() {
      const s = hdData && hdData.semester;
      $id('jdSemesterInfo').innerHTML = s
        ? `Semester aktif: <b>${escHtml(s.nama)}</b> (${escHtml(hdTglPanjang(s.mulai))} – ${escHtml(hdTglPanjang(s.selesai))})`
        : 'Belum ada semester aktif. Isi supaya pertemuan di luar masa semester tidak muncul.';
      if (s) { $id('jdSemNama').value = s.nama; $id('jdSemMulai').value = s.mulai; $id('jdSemSelesai').value = s.selesai; }
      const lib = (hdData && hdData.libur) || [];
      $id('jdLiburList').innerHTML = lib.length ? lib.map(l => `
        <div class="hd-jadwal-row"><span>${escHtml(hdTglPanjang(l.tanggal))}${l.keterangan ? ' — ' + escHtml(l.keterangan) : ''}</span>
          <button type="button" class="alt danger" onclick="jadwalHapusLibur(${Number(l.id)})" aria-label="Hapus">✕</button></div>`).join('')
        : '<p class="mu">Belum ada hari libur tercatat.</p>';
    }

    async function jadwalSimpanSemester() {
      const nama = $id('jdSemNama').value.trim(), mulai = $id('jdSemMulai').value, selesai = $id('jdSemSelesai').value;
      if (!nama || !mulai || !selesai) return alert('Isi nama semester, tanggal mulai, dan tanggal selesai.');
      const r = await guruRPC('guru_semester_simpan', { p_nama: nama, p_mulai: mulai, p_selesai: selesai });
      if (r.error) return alert('Gagal menyimpan semester: ' + r.error.message);
      await jadwalMuatData(); jadwalMuatHariIni(); jadwalMuatStrip();
    }

    async function jadwalTambahLibur() {
      const tgl = $id('jdLiburTgl').value, ket = $id('jdLiburKet').value.trim();
      if (!tgl) return alert('Pilih tanggal libur.');
      const r = await guruRPC('guru_libur_simpan', { p_tanggal: tgl, p_keterangan: ket });
      if (r.error) return alert('Gagal menyimpan: ' + r.error.message);
      $id('jdLiburTgl').value = ''; $id('jdLiburKet').value = '';
      await jadwalMuatData(); jadwalMuatHariIni(); jadwalMuatStrip();
    }

    async function jadwalHapusLibur(id) {
      if (!confirm('Hapus hari libur ini?')) return;
      const r = await guruRPC('guru_libur_hapus', { p_id: id });
      if (r.error) return alert('Gagal menghapus: ' + r.error.message);
      await jadwalMuatData(); jadwalMuatHariIni(); jadwalMuatStrip();
    }

    // Peringatan bila menutup halaman saat absen belum disimpan
    window.addEventListener('beforeunload', (e) => { if (hdAbsen && hdAbsen.ubah) { e.preventDefault(); e.returnValue = ''; } });
    // Strip diperbarui berkala (pergantian hari / absen dari perangkat lain)
    setInterval(() => { if (hdSiap && activeUser && activeUser.role === 'guru' && !document.hidden) jadwalMuatStrip(); }, 10 * 60 * 1000);
