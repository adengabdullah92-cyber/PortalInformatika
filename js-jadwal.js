// LMS Informatika SMA — js-jadwal.js: Jadwal mengajar + Daftar Hadir.
//   H1: jadwal, hari libur, pita "Hari ini", daftar hadir (guru).
//   H2: jurnal mengajar (angka dari absen + materi disarankan + kalimat dirangkai AI), rekap per kelas + ekspor,
//       "Kehadiranku" untuk siswa (hadir_h2.sql; mode "jurnal" di generate-ai).
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
      $id('guruJadwalView').classList.remove('hidden');
      const opsiKelas = DAFTAR_KELAS.map(k => `<option value="${k}">${k}</option>`).join('');
      $id('jdKelas').innerHTML = opsiKelas;
      $id('jdLuarKelas').innerHTML = opsiKelas;
      $id('rkKelas').innerHTML = opsiKelas;
      $id('jdHari').innerHTML = HD_HARI.map((h, i) => i ? `<option value="${i}">${h}</option>` : '').join('');
      $id('jdTanggal').value = hdTanggalHariIni();
      hdSiap = true;
      jadwalMuatData();
      jadwalMuatHariIni();
      jadwalMuatStrip();
      tgMuatStatus();
      jadwalCekParamURL();
    }

    // Tautan dari Telegram: ?absen=KELAS|YYYY-MM-DD|HH:MM  atau  ?tab=jadwal
    async function jadwalCekParamURL() {
      let p; try { p = new URLSearchParams(location.search); } catch (_) { return; }
      const absen = p.get('absen'), tab = p.get('tab');
      if (!absen && tab !== 'jadwal') return;
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (_) {}
      switchTab('jadwal');
      if (!absen) return;
      const [kelas, tanggal, jam] = String(absen).split('|');
      if (!kelas || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal || '') || !/^\d{2}:\d{2}$/.test(jam || '')) return;
      $id('jdTanggal').value = tanggal;
      await jadwalMuatHariIni();
      const i = hdHari ? hdHari.kelas.findIndex(k => k.kelas === kelas && k.jam_mulai === jam) : -1;
      if (i >= 0) jadwalBukaIdx(i);
      else jadwalBukaAbsen({ kelas, tanggal, jam_mulai: jam, jam_selesai: null, jadwal_id: null });
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
      if (hdAbsen && (hdAbsen.ubah || hdAbsen.jurnal.ubah) && !confirm('Perubahan absen/jurnal sebelumnya belum disimpan. Tinggalkan?')) return;
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
        ubah: baru && (d.siswa || []).length > 0,
        jurnal: {
          materi_id: d.pertemuan && d.pertemuan.materi_id ? String(d.pertemuan.materi_id) : '',
          teks: (d.pertemuan && d.pertemuan.jurnal) || '', catatan: '', saran: [], sebelumnya: null, sibuk: false, ubah: false
        }
      };
      jadwalRenderAbsen();
      jurnalMuatSaran();
    }

    // ---------- Jurnal mengajar ----------
    async function jurnalMuatSaran() {
      const a = hdAbsen; if (!a) return;
      const r = await guruRPC('guru_jurnal_saran', { p_kelas: a.kelas, p_tanggal: a.tanggal });
      if (hdAbsen !== a || r.error) return;
      a.jurnal.saran = (r.data && r.data.materi) || [];
      a.jurnal.sebelumnya = r.data && r.data.materi_sebelumnya ? String(r.data.materi_sebelumnya) : null;
      // Belum ada materi tercatat: pilih otomatis yang terakhir dipublish ke kelas ini
      if (!a.jurnal.materi_id && a.jurnal.saran.length) a.jurnal.materi_id = String(a.jurnal.saran[0].materi_id);
      jadwalRenderAbsen();
    }

    function jurnalAngka() {
      const a = hdAbsen; const n = {}; HD_KODE.forEach(([k]) => n[k] = 0);
      a.siswa.forEach(s => n[s.status]++);
      const hadir = n.H + n.T;
      return `Kehadiran: ${hadir} siswa hadir${n.T ? ` (${n.T} terlambat)` : ''}, ${n.S} sakit, ${n.I} izin, ${n.A} alpa` +
        `${n.D ? `, ${n.D} dispensasi` : ''} (jumlah ${a.siswa.length} siswa).`;
    }

    function jurnalJudulMateri(id) {
      const a = hdAbsen; if (!id) return '';
      const s = (a.jurnal.saran || []).find(x => String(x.materi_id) === String(id));
      if (s) return s.judul;
      const m = ((bankState.materi && bankState.materi.items) || []).find(x => String(x.id) === String(id));
      return m ? m.judul : '';
    }

    function jurnalHTML() {
      const a = hdAbsen; const j = a.jurnal;
      if (!a.pertemuan || !a.pertemuan.id) return `<div class="hd-jurnal"><h4>📝 Jurnal mengajar</h4><p class="mu">Simpan absen dulu, lalu jurnal bisa disusun.</p></div>`;
      const semua = ((bankState.materi && bankState.materi.items) || []).filter(m => !m.diarsipkan);
      const idSaran = new Set(j.saran.map(x => String(x.materi_id)));
      const opsi = ['<option value="">— tanpa materi LMS —</option>']
        .concat(j.saran.map((x, i) => `<option value="${escHtml(String(x.materi_id))}" ${String(x.materi_id) === j.materi_id ? 'selected' : ''}>${i === 0 ? '⭐ ' : ''}${String(x.materi_id) === j.sebelumnya ? '↩ ' : ''}${escHtml(x.judul)}</option>`))
        .concat(semua.filter(m => !idSaran.has(String(m.id))).map(m => `<option value="${escHtml(String(m.id))}" ${String(m.id) === j.materi_id ? 'selected' : ''}>${escHtml(m.judul)} (belum dipublish ke kelas ini)</option>`));
      return `<div class="hd-jurnal">
        <h4>📝 Jurnal mengajar</h4>
        <div class="hd-pilih">
          <div style="flex:1; min-width:200px;"><label class="mu">Materi yang disampaikan</label><select id="jrMateri" onchange="jurnalSet('materi_id', this.value)">${opsi.join('')}</select>
            <small class="mu">⭐ terakhir dipublish ke kelas ini${j.sebelumnya ? ' • ↩ materi pertemuan sebelumnya' : ''}</small></div>
        </div>
        <label class="mu" style="display:block; margin-top:8px;">Catatan kegiatan (opsional, untuk AI)</label>
        <input type="text" id="jrCatatan" maxlength="300" placeholder="mis. praktik Lab menyusun balok perulangan, diskusi kelompok" value="${escHtml(j.catatan)}" oninput="jurnalSet('catatan', this.value)">
        <div class="bank-actions" style="margin-top:8px;"><button type="button" class="alt" id="jrAI" onclick="jurnalSusunAI()" ${j.sibuk ? 'disabled' : ''}>${j.sibuk ? '⏳ Menyusun…' : '✨ Susun dengan AI'}</button></div>
        <label class="mu" style="display:block; margin-top:8px;">Isi jurnal (bisa disunting)</label>
        <textarea id="jrTeks" rows="4" oninput="jurnalSet('teks', this.value)" placeholder="Tekan &quot;Susun dengan AI&quot; atau tulis sendiri.">${escHtml(j.teks)}</textarea>
        <div class="bank-actions" style="margin-top:8px;"><button type="button" id="jrSimpan" onclick="jurnalSimpan()">💾 Simpan jurnal</button></div>
      </div>`;
    }

    function jurnalSet(k, v) { if (!hdAbsen) return; hdAbsen.jurnal[k] = v; hdAbsen.jurnal.ubah = true; }

    async function jurnalSusunAI() {
      const a = hdAbsen; if (!a) return;
      if (a.ubah) return alert('Simpan absen dulu supaya angka kehadiran di jurnal sesuai.');
      const j = a.jurnal;
      const judul = jurnalJudulMateri(j.materi_id);
      if (!judul && !j.catatan.trim()) return alert('Pilih materi atau isi catatan kegiatan dulu.');
      const m = ((bankState.materi && bankState.materi.items) || []).find(x => String(x.id) === String(j.materi_id));
      const teksMateri = m ? String(m.konten || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500) : '';
      j.sibuk = true; jadwalRenderAbsen();
      try {
        const d = await panggilEdge({ mode: 'jurnal', kelas: a.kelas, tanggal: hdTglPanjang(a.tanggal), materiJudul: judul, materiTeks: teksMateri, catatan: j.catatan }, 60000);
        // Angka kehadiran disusun LMS dari data absen (bukan AI), supaya pasti tepat
        j.teks = (String(d.kalimat || '').trim() + '\n' + jurnalAngka()).trim();
        j.ubah = true;
      } catch (e) { alert('Gagal menyusun jurnal: ' + e.message + (/mode|prompt kosong/i.test(e.message) ? ' (deploy generate-ai versi terbaru)' : '')); }
      finally { j.sibuk = false; if (hdAbsen === a) jadwalRenderAbsen(); }
    }

    async function jurnalSimpan() {
      const a = hdAbsen; if (!a || !a.pertemuan) return;
      const btn = $id('jrSimpan'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyimpan…'; }
      const r = await guruRPC('guru_jurnal_simpan', { p_pertemuan_id: Number(a.pertemuan.id), p_materi_id: a.jurnal.materi_id || null, p_jurnal: a.jurnal.teks });
      if (r.error) { if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan jurnal'; } return alert('Gagal menyimpan jurnal: ' + r.error.message); }
      a.jurnal.ubah = false;
      const b2 = $id('jrSimpan'); if (b2) { b2.disabled = false; b2.textContent = '✅ Jurnal tersimpan'; setTimeout(() => { const b3 = $id('jrSimpan'); if (b3) b3.textContent = '💾 Simpan jurnal'; }, 2000); }
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
      h += jurnalHTML();
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
      if (hdAbsen && (hdAbsen.ubah || hdAbsen.jurnal.ubah) && !confirm('Perubahan absen/jurnal belum disimpan. Tutup?')) return;
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
      a.ubah = false; a.baru = false; a.pertemuan = { ...(a.pertemuan || {}), id: r.data.pertemuan_id };
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
    window.addEventListener('beforeunload', (e) => { if (hdAbsen && (hdAbsen.ubah || (hdAbsen.jurnal && hdAbsen.jurnal.ubah))) { e.preventDefault(); e.returnValue = ''; } });
    // Strip diperbarui berkala (pergantian hari / absen dari perangkat lain)
    setInterval(() => { if (hdSiap && activeUser && activeUser.role === 'guru' && !document.hidden) jadwalMuatStrip(); }, 10 * 60 * 1000);

    // ================= H2: REKAP KEHADIRAN (guru) =================
    let rkData = null;

    function rekapRentang() {
      const p = $id('rkPeriode').value;
      const hari = hdTanggalHariIni();
      const [y, m] = hari.split('-').map(Number);
      const iso = (yy, mm, dd) => `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      const akhirBulan = (yy, mm) => new Date(yy, mm, 0).getDate();
      if (p === 'bulan') return [iso(y, m, 1), iso(y, m, akhirBulan(y, m))];
      if (p === 'bulanlalu') { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return [iso(yy, mm, 1), iso(yy, mm, akhirBulan(yy, mm))]; }
      if (p === 'pilih') return [$id('rkDari').value, $id('rkSampai').value];
      const s = hdData && hdData.semester;
      return s ? [s.mulai, s.selesai] : [iso(m >= 7 ? y : y - 1, m >= 7 ? 7 : 1, 1), hari];
    }

    function rekapPeriodeUbah() {
      const pilih = $id('rkPeriode').value === 'pilih';
      document.querySelectorAll('.rk-tgl').forEach(el => el.classList.toggle('hidden', !pilih));
      if (pilih && !$id('rkDari').value) { const h = hdTanggalHariIni(); $id('rkDari').value = h.slice(0, 8) + '01'; $id('rkSampai').value = h; }
    }

    async function rekapMuat() {
      const [dari, sampai] = rekapRentang();
      if (!dari || !sampai) return alert('Isi tanggal dari dan sampai.');
      const kelas = $id('rkKelas').value;
      $id('rkIsi').innerHTML = '<p class="mu">Memuat…</p>';
      const r = await guruRPC('guru_rekap_hadir', { p_kelas: kelas, p_dari: dari, p_sampai: sampai });
      if (r.error) { $id('rkIsi').innerHTML = `<p class="mu">Gagal memuat rekap: ${escHtml(r.error.message)}${/function|schema cache|does not exist/i.test(r.error.message) ? ' (jalankan hadir_h2.sql)' : ''}</p>`; return; }
      rkData = r.data; rekapRender();
    }

    function rekapRender() {
      const d = rkData; const box = $id('rkIsi'); if (!d || !box) return;
      const P = d.pertemuan || [], S = d.siswa || [];
      let h = `<p class="mu">Kelas ${escHtml(d.kelas)} • ${escHtml(hdTglPanjang(d.dari))} – ${escHtml(hdTglPanjang(d.sampai))} • <b>${P.length}</b> pertemuan</p>`;
      if (!P.length) return box.innerHTML = h + '<p class="mu">Belum ada pertemuan yang diabsen pada periode ini.</p>';
      const nilai = S.map(x => x.persen).filter(x => x !== null && x !== undefined);
      const rata = nilai.length ? (nilai.reduce((a, b) => a + Number(b), 0) / nilai.length).toFixed(1) : '-';
      h += `<div class="ks-badges" style="margin-bottom:8px;"><span class="badge ok">Rata-rata kehadiran ${rata}%</span>
        <span class="badge ${S.some(x => x.A >= 3) ? 'bad' : ''}">${S.filter(x => x.A >= 3).length} siswa alpa ≥ 3 kali</span></div>`;
      h += `<div class="tbl-scroll"><table><thead><tr><th>Nama</th>${HD_KODE.map(([k, n]) => `<th title="${n}">${k}</th>`).join('')}<th>%</th></tr></thead><tbody>` +
        S.map(x => `<tr><td>${escHtml(x.nama)}</td>${HD_KODE.map(([k]) => `<td>${x[k] || 0}</td>`).join('')}<td><b class="${x.persen !== null && x.persen < 80 ? 'hd-rendah' : ''}">${x.persen === null ? '-' : x.persen}</b></td></tr>`).join('') +
        `</tbody></table></div>`;
      h += `<div class="bank-actions" style="margin-top:10px;">
        <button type="button" class="alt" onclick="rekapUnduh()">📥 Unduh rekap (.xlsx)</button>
        <button type="button" class="alt" onclick="rekapUnduhJurnal()">📥 Unduh jurnal (.xlsx)</button></div>
        <p class="mu" style="font-size:0.78rem;">% = (H + T) ÷ (H + T + S + I + A). Dispensasi tidak dihitung. Merah bila di bawah 80%.</p>`;
      box.innerHTML = h;
    }

    function rekapUnduh() {
      const d = rkData; if (!d) return;
      const P = d.pertemuan || [];
      const tgl = (t) => { const [y, m, dd] = String(t).split('-'); return `${dd}/${m}`; };
      const baris = [
        [`Rekap kehadiran Informatika — Kelas ${d.kelas}`],
        [`Periode ${hdTglPanjang(d.dari)} s.d. ${hdTglPanjang(d.sampai)} • ${P.length} pertemuan`],
        [],
        ['No', 'Nama', ...P.map(p => `${tgl(p.tanggal)} ${p.jam}`), 'H', 'T', 'S', 'I', 'D', 'A', '% Hadir']
      ];
      (d.siswa || []).forEach((x, i) => baris.push([i + 1, x.nama, ...P.map(p => (x.status || {})[String(p.id)] || ''), x.H, x.T, x.S, x.I, x.D, x.A, x.persen === null ? '' : x.persen]));
      baris.push([], ['Keterangan: H hadir, T terlambat (dihitung hadir), S sakit, I izin, D dispensasi (tidak dihitung), A alpa']);
      unduhCSV(`rekap_hadir_${d.kelas}_${d.dari}_${d.sampai}.csv`, baris, { header: 3, warnaStatus: true, bekuKolom: 2, sheet: 'Rekap ' + d.kelas });
    }

    function rekapUnduhJurnal() {
      const d = rkData; if (!d) return;
      const baris = [[`Jurnal mengajar Informatika — Kelas ${d.kelas}`], [], ['Pertemuan ke', 'Hari, tanggal', 'Jam', 'Jurnal']];
      (d.pertemuan || []).forEach((p, i) => baris.push([i + 1, hdTglPanjang(p.tanggal), p.jam, p.jurnal || '']));
      unduhCSV(`jurnal_${d.kelas}_${d.dari}_${d.sampai}.csv`, baris, { header: 2, sheet: 'Jurnal ' + d.kelas });
    }

    // ================= H2: KEHADIRANKU (siswa) =================
    let shData = null;

    function jadwalInitSiswa() {
      if (!activeUser || activeUser.role !== 'siswa') return;
      $id('navJadwal').classList.remove('hidden');
      $id('navJadwalTeks').textContent = 'Kehadiranku';
      $id('siswaHadirView').classList.remove('hidden');
      siswaHadirMuat();
    }

    function jadwalTabDibuka() {
      if (activeUser && activeUser.role === 'siswa') siswaHadirMuat();
    }

    async function siswaHadirMuat() {
      const box = $id('shIsi'); if (!box) return;
      const r = await db.rpc('siswa_kehadiran', { p_token: sesiToken });
      if (r.error) {
        if (galatSesi(r.error.message)) return sesiHabis();
        box.innerHTML = `<p class="mu">Rekap kehadiran belum bisa dimuat${/function|schema cache|does not exist/i.test(r.error.message || '') ? ' (beri tahu gurumu: hadir_h2.sql belum dijalankan)' : ': ' + escHtml(r.error.message)}.</p>`;
        return;
      }
      shData = r.data; siswaHadirRender();
    }

    function siswaHadirRender() {
      const d = shData; const box = $id('shIsi'); if (!d || !box) return;
      const j = d.jumlah || {};
      const total = HD_KODE.reduce((a, [k]) => a + (j[k] || 0), 0);
      if (!total) { box.innerHTML = `<p class="mu">Belum ada catatan kehadiran${d.semester ? ' di semester ' + escHtml(d.semester) : ''}.</p>`; return; }
      const p = d.persen;
      let h = `<div class="sh-atas"><div class="sh-persen ${p !== null && p < 80 ? 'hd-rendah' : ''}">${p === null ? '-' : p}<small>%</small></div>
          <div><b>Kehadiran ${d.semester ? 'semester ' + escHtml(d.semester) : ''}</b><div class="mu">${escHtml(hdTglPanjang(d.dari))} – ${escHtml(hdTglPanjang(d.sampai))}</div>
          ${p !== null && p < 80 ? '<div class="hd-catatan" style="margin-top:6px;">Kehadiranmu di bawah 80%. Yuk lebih rajin masuk, atau bicarakan dengan guru bila ada kendala.</div>' : ''}</div></div>`;
      h += `<div class="hd-ringkas">${HD_KODE.map(([k, n]) => `<span class="hd-tag hd-${k}" title="${n}">${n} ${j[k] || 0}</span>`).join('')}</div>`;
      const t = d.terakhir || [];
      if (t.length) {
        const nama = Object.fromEntries(HD_KODE);
        h += `<h4 style="margin:14px 0 6px;">Pertemuan terakhir</h4><div class="tbl-scroll"><table><thead><tr><th>Tanggal</th><th>Jam</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>` +
          t.map(x => `<tr><td>${escHtml(hdTglPanjang(x.tanggal))}</td><td>${escHtml(x.jam)}</td><td><span class="hd-tag hd-${escHtml(x.status)}">${escHtml(nama[x.status] || x.status)}</span></td><td>${escHtml(x.keterangan || '')}</td></tr>`).join('') +
          `</tbody></table></div>`;
      }
      box.innerHTML = h;
    }

    // ================= T1: NOTIFIKASI TELEGRAM (guru) =================
    // Edge Function "telegram" (telegram_t1.sql + telegram_cron.sql). Bot hanya melayani akun Telegram yang dihubungkan di sini.
    const TG_URL = `${SUPABASE_URL}/functions/v1/telegram`;
    let tgStatus = null, tgSambung = null;

    async function tgAPI(aksi, extra = {}) {
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 30000);
      try {
        const res = await fetch(TG_URL, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ aksi, token: sesiToken, ...extra })
        });
        let data; try { data = await res.json(); } catch (_) { throw new Error('Function "telegram" belum aktif (HTTP ' + res.status + ').'); }
        if (res.status === 401) sesiHabis(data.error);
        if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));
        return data;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Server tidak merespons.');
        if (/Load failed|Failed to fetch|NetworkError/i.test(e.message || '')) throw new Error('Function "telegram" belum di-deploy atau koneksi terputus.');
        throw e;
      } finally { clearTimeout(tm); }
    }

    async function tgMuatStatus() {
      const box = $id('tgIsi'); if (!box) return;
      try { tgStatus = await tgAPI('status'); }
      catch (e) { tgStatus = { galat: e.message }; }
      tgRender();
    }

    function tgRender() {
      const box = $id('tgIsi'); if (!box) return;
      const s = tgStatus;
      const info = '<p class="mu" style="font-size:0.8rem;">Ringkasan pagi 06.30 setiap hari • pengingat 30 menit sebelum mengajar • pengingat absen 15 menit sebelum pelajaran selesai. Pesan hanya berisi angka & nama kelas, tanpa nama siswa.</p>';
      if (!s) { box.innerHTML = '<p class="mu">Memuat…</p>'; return; }
      if (s.galat) { box.innerHTML = `<p class="mu">⚠️ ${escHtml(s.galat)}</p>${info}`; return; }
      if (!s.token_ada) { box.innerHTML = `<p class="mu">⚠️ Token bot belum diisi: tambahkan secret <b>TELEGRAM_BOT_TOKEN</b> di Supabase.</p>${info}`; return; }
      if (s.terhubung) {
        box.innerHTML = `<p>✅ Terhubung${s.bot ? ' dengan <b>@' + escHtml(s.bot) + '</b>' : ''}${s.terhubung_at ? ' sejak ' + escHtml(tglPendek(s.terhubung_at)) : ''}.</p>${info}
          <div class="bank-actions"><button type="button" class="alt" onclick="tgTes(this)">🔔 Kirim pesan uji</button>
          <button type="button" class="alt danger" onclick="tgPutus()">Putuskan</button></div>`;
        return;
      }
      let h = `<p>Belum terhubung.</p>${info}`;
      if (tgSambung) {
        h += `<div class="hd-catatan">1. Ketuk tombol di bawah untuk membuka <b>@${escHtml(tgSambung.bot)}</b> di Telegram, lalu tekan <b>Start</b>.<br>
          2. Kembali ke sini dan ketuk "Periksa".<br><small class="mu">Kode berlaku ${tgSambung.berlaku_menit} menit: <b>${escHtml(tgSambung.kode)}</b></small></div>
          <div class="bank-actions"><a class="btn-link" href="${escHtml(tgSambung.link)}" target="_blank" rel="noopener">📲 Buka @${escHtml(tgSambung.bot)}</a>
          <button type="button" class="alt" onclick="tgMuatStatus()">✔️ Periksa</button></div>`;
      } else {
        h += `<div class="bank-actions"><button type="button" onclick="tgHubungkan(this)">🔗 Hubungkan Telegram</button></div>`;
      }
      box.innerHTML = h;
    }

    async function tgHubungkan(btn) {
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyiapkan…'; }
      try { tgSambung = await tgAPI('hubungkan', { lms_url: location.origin + location.pathname }); }
      catch (e) { alert('Gagal menghubungkan: ' + e.message); }
      tgRender();
    }
    async function tgTes(btn) {
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Mengirim…'; }
      try { await tgAPI('tes'); if (btn) btn.textContent = '✅ Terkirim, cek Telegram'; }
      catch (e) { alert('Gagal mengirim: ' + e.message); if (btn) { btn.disabled = false; btn.textContent = '🔔 Kirim pesan uji'; } }
    }
    async function tgPutus() {
      if (!confirm('Hentikan notifikasi Telegram untuk akun ini?')) return;
      try { await tgAPI('putus'); tgSambung = null; } catch (e) { return alert('Gagal: ' + e.message); }
      tgMuatStatus();
    }
