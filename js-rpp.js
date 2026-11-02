// LMS Informatika SMA — js-rpp.js: RPP dari template Word sekolah (tahap R1, khusus guru).
// Alur: pilih materi + model → AI menyusun isi (generate-ai mode "rpp") → guru menyunting → simpan → unduh Word.
// Template: file rpp-template.docx di samping index.html (kop, tabel, gaya asli sekolah; isi berupa lubang isian).
// Pustaka PizZip + Docxtemplater dimuat saat pertama kali mengunduh.

    const RPP_LIB = [
      'https://cdn.jsdelivr.net/npm/pizzip@3.3.0/dist/pizzip.min.js',
      'https://cdn.jsdelivr.net/npm/docxtemplater@3.71.1/build/docxtemplater.min.js'
    ];
    const RPP_TEMPLATE = 'rpp-template.docx?v=20261102r1';
    const RPP_MODEL = { otomatis: 'Otomatis (AI pilih yang sesuai)', discovery: 'Discovery Learning', pbl: 'Problem Based Learning', pjbl: 'Project Based Learning' };
    const RPP_DPL = ['', 'Keimanan dan Ketakwaan terhadap Tuhan YME', 'Kewargaan', 'Penalaran Kritis', 'Kreativitas', 'Kolaborasi', 'Kemandirian', 'Kesehatan', 'Komunikasi'];
    const RPP_DAFTAR = [
      ['pedagogis', 'Praktik pedagogis'], ['kemitraan', 'Kemitraan pembelajaran'], ['lingkungan_belajar', 'Lingkungan pembelajaran'],
      ['digital', 'Pemanfaatan digital'], ['pendahuluan', 'Pendahuluan (setelah rutinitas berdoa, Asmaul Husna, Indonesia Raya, presensi)'],
      ['refleksi', 'Pertanyaan refleksi (penutup)'], ['penutup', 'Kegiatan penutup lainnya'],
      ['asesmen_awal', 'Assessment of Learning (Awal)'], ['asesmen_proses', 'Assessment as Learning (Proses)'], ['asesmen_akhir', 'Assessment for Learning (Akhir)']
    ];
    const RPP_SETELAN_AWAL = {
      nama_guru: '', nip_guru: '', sekolah: 'SMAN 6 Pandeglang', kepsek: '', nip_kepsek: '', kota: 'Pandeglang', mapel: 'Informatika',
      fokus: true, minat: '', cara_belajar: '', lingkungan: '', cp: ''
    };

    let rppSetelan = null;    // pengaturan RPP
    let rppDaftarData = [];   // daftar RPP tersimpan
    let rppAktif = null;      // RPP yang sedang disunting: {id, judul, materi_id, model, data}
    let rppSiap = false;

    function rppInit() {
      if (!activeUser || activeUser.role !== 'guru') return;
      $id('navRpp').classList.remove('hidden');
      $id('rppKelas').innerHTML = '<option value="X">X (semua kelas)</option>' + DAFTAR_KELAS.map(k => `<option value="${k}">${k}</option>`).join('');
      $id('rppModel').innerHTML = Object.entries(RPP_MODEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
      $id('rppTanggal').value = (typeof hdTanggalHariIni === 'function') ? hdTanggalHariIni() : new Date().toISOString().slice(0, 10);
      rppSiap = true;
      rppMuatSetelan();
      rppMuatDaftar();
    }

    function rppTabDibuka() {
      if (!rppSiap) return;
      rppIsiPilihanMateri();
      if (!rppAktif) rppRenderEditor();
    }

    // ---------- Pengaturan ----------
    async function rppMuatSetelan() {
      const r = await guruRPC('guru_pengaturan_ambil', { p_kunci: 'rpp' });
      if (r.error) {
        $id('rppSetelanInfo').innerHTML = `⚠️ ${escHtml(r.error.message)}${/function|schema cache|does not exist/i.test(r.error.message) ? ' (jalankan rpp_r1.sql)' : ''}`;
        rppSetelan = { ...RPP_SETELAN_AWAL, nama_guru: activeUser.nama || '' };
      } else {
        rppSetelan = { ...RPP_SETELAN_AWAL, nama_guru: activeUser.nama || '', ...(r.data || {}) };
      }
      rppRenderSetelan();
    }

    function rppRenderSetelan() {
      const s = rppSetelan; if (!s) return;
      ['nama_guru', 'nip_guru', 'sekolah', 'kepsek', 'nip_kepsek', 'kota', 'mapel', 'minat', 'cara_belajar', 'lingkungan', 'cp'].forEach(k => {
        const el = $id('rs_' + k); if (el) el.value = s[k] || '';
      });
      $id('rs_fokus').checked = s.fokus !== false;
      const kurang = [];
      if (!s.kepsek) kurang.push('nama kepala sekolah');
      if (!s.cp) kurang.push('Capaian Pembelajaran');
      $id('rppSetelanInfo').innerHTML = kurang.length ? `ℹ️ Lengkapi: ${kurang.join(', ')}.` : '✅ Pengaturan lengkap.';
      $id('rppSetelanDetail').open = kurang.length > 0;
    }

    async function rppSimpanSetelan() {
      const s = { ...rppSetelan };
      ['nama_guru', 'nip_guru', 'sekolah', 'kepsek', 'nip_kepsek', 'kota', 'mapel', 'minat', 'cara_belajar', 'lingkungan', 'cp'].forEach(k => {
        const el = $id('rs_' + k); if (el) s[k] = el.value.trim();
      });
      s.fokus = $id('rs_fokus').checked;
      const r = await guruRPC('guru_pengaturan_simpan', { p_kunci: 'rpp', p_nilai: s });
      if (r.error) return alert('Gagal menyimpan pengaturan: ' + r.error.message);
      rppSetelan = s; rppRenderSetelan();
      alert('Pengaturan RPP tersimpan.');
    }

    // ---------- Daftar RPP ----------
    async function rppMuatDaftar() {
      const r = await guruRPC('guru_rpp_daftar');
      if (r.error) { $id('rppDaftar').innerHTML = `<p class="mu">Gagal memuat: ${escHtml(r.error.message)}</p>`; return; }
      rppDaftarData = r.data || [];
      rppRenderDaftar();
    }

    function rppRenderDaftar() {
      const box = $id('rppDaftar'); if (!box) return;
      if (!rppDaftarData.length) { box.innerHTML = '<p class="mu">Belum ada RPP tersimpan.</p>'; return; }
      box.innerHTML = rppDaftarData.map(x => `
        <div class="hd-kelas"><div><b>${escHtml(x.judul)}</b>
          <div class="mu">${escHtml(RPP_MODEL[x.model] || x.model || '-')} • diubah ${escHtml(tglPendek(x.diubah_at))}</div></div>
          <div class="bank-actions" style="margin:0;"><button type="button" class="alt" onclick="rppBuka(${Number(x.id)})">✏️ Buka</button>
          <button type="button" class="alt danger" onclick="rppHapus(${Number(x.id)})" aria-label="Hapus">🗑️</button></div></div>`).join('');
    }

    async function rppBuka(id) {
      if (rppAktif && rppAktif.ubah && !confirm('Perubahan RPP yang sedang dibuka belum disimpan. Tinggalkan?')) return;
      const r = await guruRPC('guru_rpp_ambil', { p_id: id });
      if (r.error) return alert('Gagal membuka: ' + r.error.message);
      const x = r.data;
      rppAktif = { id: x.id, judul: x.judul, materi_id: x.materi_id || '', model: x.model || 'otomatis', data: x.data || {}, ubah: false };
      rppIsiPilihanMateri();
      $id('rppMateri').value = rppAktif.materi_id;
      $id('rppModel').value = RPP_MODEL[rppAktif.model] ? rppAktif.model : 'otomatis';
      $id('rppPokok').value = rppAktif.data.materi_pokok || '';
      $id('rppJP').value = rppAktif.data.jp || 2;
      rppRenderEditor();
      $id('rppEditorCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function rppHapus(id) {
      const x = rppDaftarData.find(r => Number(r.id) === id);
      if (!confirm(`Hapus RPP "${x ? x.judul : id}"?`)) return;
      const r = await guruRPC('guru_rpp_hapus', { p_id: id });
      if (r.error) return alert('Gagal menghapus: ' + r.error.message);
      if (rppAktif && rppAktif.id === id) { rppAktif = null; rppRenderEditor(); }
      rppMuatDaftar();
    }

    function rppBaru() {
      if (rppAktif && rppAktif.ubah && !confirm('Perubahan RPP yang sedang dibuka belum disimpan. Tinggalkan?')) return;
      rppAktif = null;
      $id('rppMateri').value = ''; $id('rppPokok').value = ''; $id('rppJP').value = 2; $id('rppModel').value = 'otomatis';
      rppRenderEditor();
    }

    // ---------- Susun dengan AI ----------
    function rppIsiPilihanMateri() {
      const sel = $id('rppMateri'); if (!sel) return;
      const lama = sel.value;
      const daftar = ((bankState.materi && bankState.materi.items) || []).filter(m => !m.diarsipkan);
      sel.innerHTML = '<option value="">— pilih materi dari Bank Materi —</option>' + daftar.map(m => `<option value="${escHtml(String(m.id))}">${escHtml(m.judul)}</option>`).join('');
      sel.value = lama;
    }

    function rppTeksMateri(id) {
      const m = ((bankState.materi && bankState.materi.items) || []).find(x => String(x.id) === String(id));
      if (!m) return { judul: '', teks: '' };
      const teks = String(m.konten || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
      return { judul: m.judul || '', teks };
    }

    async function rppSusunAI() {
      const materiId = $id('rppMateri').value, pokok = $id('rppPokok').value.trim();
      const jp = Math.max(1, Math.min(8, parseInt($id('rppJP').value) || 2));
      if (!materiId && !pokok) return alert('Pilih materi atau isi materi pokok dulu.');
      if (rppAktif && rppAktif.data && rppAktif.data.tp && !confirm('Isi RPP yang ada akan diganti hasil AI. Lanjutkan?')) return;
      const s = rppSetelan || RPP_SETELAN_AWAL;
      const m = rppTeksMateri(materiId);
      const btn = $id('rppAIBtn'); btn.disabled = true; btn.textContent = '⏳ AI sedang menyusun RPP (±30–60 detik)…';
      try {
        const d = await panggilEdge({
          mode: 'rpp', materiJudul: m.judul, materiTeks: m.teks, materiPokok: pokok, model: $id('rppModel').value,
          menit: jp * 45, cp: s.cp || '', profil: { minat: s.minat, cara_belajar: s.cara_belajar, lingkungan: s.lingkungan }
        }, 120000);
        const r = d.rpp || {};
        rppAktif = {
          id: rppAktif ? rppAktif.id : null,
          judul: m.judul || pokok, materi_id: materiId, model: r.model || 'discovery',
          data: { ...r, materi_pokok: pokok || m.judul, jp },
          ubah: true
        };
        $id('rppModel').value = rppAktif.model;
        rppRenderEditor();
      } catch (e) {
        alert('Gagal menyusun RPP: ' + e.message + (/prompt kosong|mode/i.test(e.message) ? ' (deploy generate-ai versi terbaru)' : ''));
      } finally { btn.disabled = false; btn.textContent = '✨ Susun dengan AI'; }
    }

    // ---------- Editor ----------
    const rppBaris = (a) => (Array.isArray(a) ? a : []).join('\n');
    const rppPecah = (t) => String(t || '').split('\n').map(x => x.trim()).filter(Boolean);

    function rppRenderEditor() {
      const box = $id('rppEditor'); if (!box) return;
      const a = rppAktif;
      if (!a) { box.innerHTML = '<p class="mu">Pilih materi dan model di atas, lalu tekan "✨ Susun dengan AI" — atau buka RPP dari daftar.</p>'; $id('rppAksi').classList.add('hidden'); return; }
      const d = a.data || {};
      const dpl = new Set((d.dpl || []).map(Number));
      let h = `<div class="rpp-judul"><label class="mu">Judul RPP (nama di daftar)</label><input type="text" id="re_judul" value="${escHtml(a.judul || '')}" oninput="rppUbah()"></div>
        <div class="hd-pilih">
          <div style="flex:1; min-width:200px;"><label class="mu">Materi pokok</label><input type="text" id="re_materi_pokok" value="${escHtml(d.materi_pokok || '')}" oninput="rppUbah()"></div>
          <div style="flex:1; min-width:200px;"><label class="mu">Sub materi</label><input type="text" id="re_sub_materi" value="${escHtml(d.sub_materi || '')}" oninput="rppUbah()"></div>
        </div>
        <p class="mu" style="margin:8px 0 0;">Model: <b>${escHtml(d.model_nama || RPP_MODEL[a.model] || a.model)}</b> • ${escHtml(String(d.jp || 2))} x 45 menit</p>
        <label class="mu rpp-lbl">Tujuan Pembelajaran</label><textarea id="re_tp" rows="3" oninput="rppUbah()">${escHtml(d.tp || '')}</textarea>
        <label class="mu rpp-lbl">Dimensi Profil Lulusan (yang dipilih akan disorot)</label>
        <div class="rpp-dpl">${RPP_DPL.map((n, i) => i ? `<label><input type="checkbox" id="re_dpl${i}" ${dpl.has(i) ? 'checked' : ''} onchange="rppUbah()"> DPL ${i} ${escHtml(n)}</label>` : '').join('')}</div>`;
      const satu = ([k, label]) => `<label class="mu rpp-lbl">${escHtml(label)} <small>(satu butir per baris)</small></label><textarea id="re_${k}" rows="${Math.max(2, Math.min(6, (d[k] || []).length + 1))}" oninput="rppUbah()">${escHtml(rppBaris(d[k]))}</textarea>`;
      h += RPP_DAFTAR.slice(0, 5).map(satu).join('');
      h += `<h4 style="margin:16px 0 4px;">Kegiatan inti — ${escHtml(d.model_nama || '')}</h4>` + (d.inti || []).map((t, i) => `
        <div class="rpp-tahap"><input type="text" id="re_tahap_${i}" value="${escHtml(t.nama || '')}" oninput="rppUbah()" aria-label="Nama tahap">
          <textarea id="re_langkah_${i}" rows="${Math.max(2, Math.min(5, (t.langkah || []).length + 1))}" oninput="rppUbah()">${escHtml(rppBaris(t.langkah))}</textarea></div>`).join('');
      h += RPP_DAFTAR.slice(5).map(satu).join('');
      box.innerHTML = h;
      $id('rppAksi').classList.remove('hidden');
    }

    function rppUbah() { if (rppAktif) rppAktif.ubah = true; }

    function rppBacaEditor() {
      const a = rppAktif; if (!a) return null;
      const d = { ...(a.data || {}) };
      a.judul = $id('re_judul').value.trim();
      d.materi_pokok = $id('re_materi_pokok').value.trim();
      d.sub_materi = $id('re_sub_materi').value.trim();
      d.tp = $id('re_tp').value.trim();
      d.dpl = [1, 2, 3, 4, 5, 6, 7, 8].filter(i => $id('re_dpl' + i).checked);
      RPP_DAFTAR.forEach(([k]) => { d[k] = rppPecah($id('re_' + k).value); });
      d.inti = (d.inti || []).map((t, i) => ({ nama: $id('re_tahap_' + i).value.trim(), langkah: rppPecah($id('re_langkah_' + i).value) }));
      a.data = d;
      return a;
    }

    async function rppSimpan() {
      const a = rppBacaEditor(); if (!a) return;
      if (!a.judul) return alert('Isi judul RPP.');
      const btn = $id('rppSimpanBtn'); btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
      const r = await guruRPC('guru_rpp_simpan', { p_id: a.id, p_judul: a.judul, p_materi_id: a.materi_id || null, p_model: a.model, p_data: a.data });
      btn.disabled = false; btn.textContent = '💾 Simpan RPP';
      if (r.error) return alert('Gagal menyimpan RPP: ' + r.error.message + (/function|schema cache|does not exist/i.test(r.error.message) ? ' (jalankan rpp_r1.sql)' : ''));
      a.id = r.data.id; a.ubah = false;
      btn.textContent = '✅ Tersimpan'; setTimeout(() => { const b = $id('rppSimpanBtn'); if (b) b.textContent = '💾 Simpan RPP'; }, 2000);
      rppMuatDaftar();
    }

    // ---------- Unduh Word ----------
    let _rppLibJanji = null;
    function rppMuatLib() {
      if (window.PizZip && (window.docxtemplater || window.Docxtemplater)) return Promise.resolve();
      if (!_rppLibJanji) {
        _rppLibJanji = RPP_LIB.reduce((p, url) => p.then(() => new Promise((ok, gagal) => {
          const sc = document.createElement('script'); sc.src = url;
          sc.onload = ok; sc.onerror = () => gagal(new Error('Gagal memuat pustaka Word (periksa internet)'));
          document.head.appendChild(sc);
        })), Promise.resolve()).catch(e => { _rppLibJanji = null; throw e; });
      }
      return _rppLibJanji;
    }

    function rppTglPanjang(iso) {
      if (!iso) return '';
      return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function rppDataTemplate(a, kelas, tanggal) {
      const d = a.data || {}, s = rppSetelan || RPP_SETELAN_AWAL;
      const jp = Math.max(1, parseInt(d.jp) || 2), total = jp * 45;
      const wPend = 15, wTutup = 15, wInti = Math.max(10, total - wPend - wTutup);
      const dpl = new Set((d.dpl || []).map(Number));
      const isi = {
        nama_guru: s.nama_guru || activeUser.nama || '', kelas, mapel: s.mapel || 'Informatika',
        materi_pokok: d.materi_pokok || a.judul || '', sub_materi: d.sub_materi || '', alokasi: `${jp} x 45 Menit`,
        minat: s.minat || '', cara_belajar: s.cara_belajar || '', lingkungan: s.lingkungan || '',
        cp: s.cp || '', tp: d.tp || '',
        pedagogis: d.pedagogis || [], kemitraan: d.kemitraan || [], lingkungan_belajar: d.lingkungan_belajar || [], digital: d.digital || [],
        fokus: s.fokus !== false, pendahuluan: d.pendahuluan || [],
        w_pendahuluan: wPend + '’', w_inti: wInti + '’', w_penutup: wTutup + '’',
        inti: (d.inti || []).map(t => ({ nama: t.nama || '', langkah: t.langkah || [] })),
        refleksi: d.refleksi || [], penutup: d.penutup || [],
        asesmen_awal: d.asesmen_awal || [], asesmen_proses: d.asesmen_proses || [], asesmen_akhir: d.asesmen_akhir || [],
        kota: s.kota || '', tanggal: rppTglPanjang(tanggal), sekolah: s.sekolah || '',
        kepsek: s.kepsek || '.................................', nip_kepsek: s.nip_kepsek || '.......................',
        nip_guru: s.nip_guru || '.......................'
      };
      for (let i = 1; i <= 8; i++) isi['dpl' + i] = dpl.has(i);
      return isi;
    }

    async function rppUnduh() {
      const a = rppBacaEditor(); if (!a) return;
      const kelas = $id('rppKelas').value, tanggal = $id('rppTanggal').value;
      const btn = $id('rppUnduhBtn'); btn.disabled = true; btn.textContent = '⏳ Menyiapkan Word…';
      try {
        await rppMuatLib();
        const res = await fetch(RPP_TEMPLATE);
        if (!res.ok) throw new Error('File rpp-template.docx tidak ditemukan di samping index.html (HTTP ' + res.status + ').');
        const zip = new PizZip(await res.arrayBuffer());
        const Doc = window.docxtemplater || window.Docxtemplater;
        const doc = new Doc(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
        doc.render(rppDataTemplate(a, kelas, tanggal));
        const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const nama = `RPP_${(a.judul || 'materi').replace(/[^\w-]+/g, '_').slice(0, 50)}_${kelas}.docx`;
        const url = URL.createObjectURL(blob);
        const el = document.createElement('a'); el.href = url; el.download = nama;
        document.body.appendChild(el); el.click(); el.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch (e) {
        alert('Gagal membuat file Word: ' + (e.message || e));
      } finally { btn.disabled = false; btn.textContent = '📥 Unduh Word'; }
    }

    window.addEventListener('beforeunload', (e) => { if (rppAktif && rppAktif.ubah) { e.preventDefault(); e.returnValue = ''; } });
