// LMS Informatika SMA — js-lab.js: Lab Koding: Blockly, tugas, pengumpulan.
// Dipecah dari index.html (2 Nov 2026), isi tidak diubah. File js-*.js dimuat berurutan oleh index.html.
    // ================= MODUL 3: BANK LAB KODING (Tahap B) =================
    // Tugas koding berbasis blok: balok yang tersedia diatur per tugas, siswa bisa Jalankan & Periksa
    // (kasus uji) sebelum Kirim, guru bisa melihat kode siswa dan memberi nilai.
    const LAB_JENIS = { buat: 'Buat program', perbaiki: 'Perbaiki program', lengkapi: 'Lengkapi program', tebak: 'Tebak keluaran' };
    const LAB_JENIS_TIP = {
      buat: 'Siswa membuat program dari nol.',
      perbaiki: 'Siswa menerima program yang ada kesalahannya (susun di workspace guru) lalu memperbaikinya.',
      lengkapi: 'Siswa menerima program yang belum lengkap (susun di workspace guru) lalu melengkapinya.',
      tebak: 'Siswa membaca program (susun di workspace guru) lalu mengetik tebakan keluarannya.'
    };
    const LAB_KATEGORI_NAMA = {
      variabel: 'Variabel', matematika: 'Matematika & ekspresi', logika: 'Logika & percabangan',
      perulangan: 'Perulangan', teks: 'Teks', daftar: 'Daftar (list)', fungsi: 'Fungsi'
    };
    const LAB_BATAS_LANGKAH = 200000;

    // ---------- Toolbox Blockly per tugas ----------
    const bl = (type, extra = {}) => ({ kind: 'block', type, ...extra });
    const sh = (type, fields) => ({ shadow: { type, fields } });
    function labToolboxKategori(k) {
      switch (k) {
        case 'io': return { kind: 'category', name: 'Cetak & Input', colour: '160', contents: [
          bl('text_print', { inputs: { TEXT: sh('text', { TEXT: 'halo' }) } }),
          bl('text_prompt_ext', { fields: { TYPE: 'NUMBER' }, inputs: { TEXT: sh('text', { TEXT: 'Masukkan angka' }) } }),
          bl('text_prompt_ext', { fields: { TYPE: 'TEXT' }, inputs: { TEXT: sh('text', { TEXT: 'Masukkan teks' }) } }),
          bl('text'), bl('text_join'), bl('math_number')
        ] };
        case 'variabel': return { kind: 'category', name: 'Variabel', colour: '330', custom: 'VARIABLE' };
        case 'matematika': return { kind: 'category', name: 'Matematika', colour: '230', contents: [
          bl('math_number'),
          bl('math_arithmetic', { inputs: { A: sh('math_number', { NUM: 1 }), B: sh('math_number', { NUM: 1 }) } }),
          bl('math_modulo', { inputs: { DIVIDEND: sh('math_number', { NUM: 10 }), DIVISOR: sh('math_number', { NUM: 3 }) } }),
          bl('math_round'), bl('math_number_property')
        ] };
        case 'logika': return { kind: 'category', name: 'Logika', colour: '210', contents: [
          bl('controls_if'),
          bl('logic_compare', { inputs: { A: sh('math_number', { NUM: 0 }), B: sh('math_number', { NUM: 0 }) } }),
          bl('logic_operation'), bl('logic_negate'), bl('logic_boolean')
        ] };
        case 'perulangan': return { kind: 'category', name: 'Perulangan', colour: '120', contents: [
          bl('controls_repeat_ext', { inputs: { TIMES: sh('math_number', { NUM: 5 }) } }),
          bl('controls_whileUntil'),
          bl('controls_for', { inputs: { FROM: sh('math_number', { NUM: 1 }), TO: sh('math_number', { NUM: 10 }), BY: sh('math_number', { NUM: 1 }) } }),
          bl('controls_forEach'), bl('controls_flow_statements')
        ] };
        case 'teks': return { kind: 'category', name: 'Teks', colour: '160', contents: [bl('text_length'), bl('text_isEmpty'), bl('text_charAt')] };
        case 'daftar': return { kind: 'category', name: 'Daftar', colour: '260', contents: [
          bl('lists_create_with'), bl('lists_length'), bl('lists_isEmpty'), bl('lists_indexOf'), bl('lists_getIndex'), bl('lists_setIndex')
        ] };
        case 'fungsi': return { kind: 'category', name: 'Fungsi', colour: '290', custom: 'PROCEDURE' };
      }
      return null;
    }

    function labKategoriList(kat) {
      if (typeof kat === 'string') { try { kat = JSON.parse(kat); } catch (_) { kat = []; } }
      kat = Array.isArray(kat) ? kat.filter(k => LAB_KATEGORI_NAMA[k]) : [];
      return kat.length ? kat : Object.keys(LAB_KATEGORI_NAMA);   // belum dipilih = semua balok
    }

    function bangunToolbox(kat) {
      const urut = ['variabel', 'matematika', 'logika', 'perulangan', 'teks', 'daftar', 'fungsi'];
      const pilih = labKategoriList(kat);
      const isi = ['io', ...urut.filter(k => pilih.includes(k))].map(labToolboxKategori).filter(Boolean);
      return { kind: 'categoryToolbox', contents: isi };
    }

    function labBuatWorkspace(divId, kat, opsi = {}) {
      const el = $id(divId);
      el.innerHTML = '';
      const cfg = {
        scrollbars: true, trashcan: true, sounds: false, oneBasedIndex: false,   // indeks daftar mulai 0, sama seperti pseudokode di materi
        zoom: { controls: true, wheel: false, startScale: 0.9, minScale: 0.5, maxScale: 1.6 },
        move: { scrollbars: true, drag: true, wheel: false }
      };
      if (opsi.readOnly) cfg.readOnly = true; else cfg.toolbox = bangunToolbox(kat);
      return Blockly.inject(el, cfg);
    }

    function labAdaBlok(ws) {
      try {
        const st = Blockly.serialization.workspaces.save(ws);
        return !!(st && st.blocks && st.blocks.blocks && st.blocks.blocks.length);
      } catch (_) { return false; }
    }
    function labSimpanState(ws) { try { return JSON.stringify(Blockly.serialization.workspaces.save(ws)); } catch (_) { return null; } }
    function labMuatState(ws, str) {
      if (!str) return false;
      try { Blockly.serialization.workspaces.load(typeof str === 'string' ? JSON.parse(str) : str, ws); return true; } catch (_) { return false; }
    }

    // ---------- Peta pseudokode -> balok (bantuan untuk pemula) ----------
    // Nama balok mengikuti tulisan di Blockly (bahasa Inggris); tulisan persisnya bisa sedikit berbeda.
    const LAB_PETA = {
      io: [['BACA x (angka)', 'prompt for number with message', 'Cetak & Input'], ['BACA x (teks)', 'prompt for text with message', 'Cetak & Input'], ['CETAK nilai', 'print', 'Cetak & Input']],
      variabel: [['x ← nilai', 'set [x] to', 'Variabel (buat variabel dulu)'], ['pakai nilai x', '[x]', 'Variabel']],
      matematika: [['+  −  ×  ÷', '[ ] + [ ] (pilih operatornya dari menu)', 'Matematika'], ['x % y (sisa bagi)', 'remainder of [ ] ÷ [ ]', 'Matematika']],
      logika: [['IF ... ELSE', 'if ... do (klik ikon roda gigi ⚙ untuk menambah else if / else)', 'Logika'], ['x = y, x > y, x ≥ y', '[ ] = [ ] (pilih pembandingnya dari menu)', 'Logika'], ['DAN / ATAU', '[ ] and [ ]', 'Logika']],
      perulangan: [['FOR i ← 1 TO n', 'count with i from 1 to n by 1', 'Perulangan'], ['WHILE kondisi', 'repeat while [ ]', 'Perulangan'], ['ulangi n kali', 'repeat [ ] times', 'Perulangan']],
      teks: [['panjang teks', 'length of [ ]', 'Teks']],
      daftar: [['data ← [a, b, c]', 'create list with', 'Daftar'], ['data[i]', 'in list ... get # [i]', 'Daftar'], ['data[i] ← nilai', 'in list ... set # [i] as', 'Daftar'], ['panjang data', 'length of [list]', 'Daftar']],
      fungsi: [['FUNGSI nama(n) ... RETURN', 'to [do something] ... return', 'Fungsi'], ['panggil fungsi', 'do something (balok pemanggil muncul setelah fungsi dibuat)', 'Fungsi']]
    };

    function labPanduanHTML(kat) {
      const pilih = ['io', ...labKategoriList(kat)];
      const baris = pilih.filter(k => LAB_PETA[k]).flatMap(k => LAB_PETA[k]);
      const adaDaftar = pilih.includes('daftar');
      return `<ol>
          <li>Klik sebuah <b>kategori</b> di sebelah kiri area kerja, lalu <b>seret balok</b> ke area putih.</li>
          <li>Sambungkan balok seperti <b>puzzle</b>: tonjolan harus masuk ke lekukan. Balok yang menggantung sendirian tidak ikut dijalankan.</li>
          <li>Tekan <b>▶ Jalankan</b> untuk mencoba, lalu <b>✔ Periksa</b> untuk menguji dengan kasus uji. Balok salah? Seret ke tempat sampah.</li>
        </ol>
        <div class="tbl-scroll"><table><thead><tr><th>Di pseudokode</th><th>Cari balok</th><th>Letaknya</th></tr></thead><tbody>
          ${baris.map(r => `<tr><td><code>${escHtml(r[0])}</code></td><td>${escHtml(r[1])}</td><td>${escHtml(r[2])}</td></tr>`).join('')}
        </tbody></table></div>
        ${adaDaftar ? '<p class="mu">Di Lab ini indeks daftar <b>mulai dari 0</b> (elemen pertama = 0), sama seperti pseudokode di materi.</p>' : ''}
        <p class="mu">Tulisan di balok memakai bahasa Inggris. Tulisan persisnya bisa sedikit berbeda dari tabel ini.</p>`;
    }

    // ---------- Mesin jalankan (JavaScript dari blok, di browser) ----------
    function labKodeJS(ws) {
      if (typeof javascript === 'undefined' || !javascript.javascriptGenerator) {
        throw new Error('Mesin jalankan belum siap (javascript_compressed.js gagal dimuat). Muat ulang halaman.');
      }
      const g = javascript.javascriptGenerator;
      g.INFINITE_LOOP_TRAP = 'if (--__lt <= 0) throw new Error("__LOOP__");\n';
      try { return g.workspaceToCode(ws); } finally { g.INFINITE_LOOP_TRAP = null; }
    }
    function labKodePy(ws) {
      try { return python.pythonGenerator.workspaceToCode(ws); } catch (_) { return ''; }
    }

    function jalankanKode(kode, masukan) {
      const keluar = [];
      let i = 0, dibaca = 0;
      const win = {
        alert: (v) => { keluar.push(String(v)); },
        prompt: () => { dibaca++; return i < masukan.length ? String(masukan[i++]) : ''; }
      };
      try {
        new Function('window', 'alert', 'prompt', '__lt', kode)(win, win.alert, win.prompt, LAB_BATAS_LANGKAH);
        return { keluar, galat: null, dibaca };
      } catch (e) {
        const msg = e && e.message === '__LOOP__'
          ? 'Program berjalan terlalu lama (kemungkinan perulangan yang tidak pernah berhenti).'
          : 'Program berhenti karena galat: ' + (e && e.message ? e.message : e);
        return { keluar, galat: msg, dibaca };
      }
    }

    function samaKeluaran(a, b) {
      const la = String(a ?? '').split('\n').map(s => s.trim());
      const lb = String(b ?? '').split('\n').map(s => s.trim());
      while (la.length && la[la.length - 1] === '') la.pop();
      while (lb.length && lb[lb.length - 1] === '') lb.pop();
      if (la.length !== lb.length) return false;
      return la.every((x, i) => {
        if (x === lb[i]) return true;
        const nx = Number(x), ny = Number(lb[i]);
        return x !== '' && lb[i] !== '' && isFinite(nx) && isFinite(ny) && Math.abs(nx - ny) < 1e-9;
      });
    }

    function labKasusList(v) {
      if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { v = []; } }
      return (Array.isArray(v) ? v : []).map(k => ({
        input: Array.isArray(k.input) ? k.input.map(String) : [],
        output: String(k.output ?? '')
      }));
    }

    function periksaKasus(kode, kasus) {
      return kasus.map((k, i) => {
        const r = jalankanKode(kode, k.input);
        const keluar = r.keluar.join('\n');
        return { no: i + 1, lulus: !r.galat && samaKeluaran(keluar, k.output), keluar, galat: r.galat, input: k.input, harapan: k.output, dibaca: r.dibaca };
      });
    }

    // Tebakan penyebab kegagalan dalam bahasa sederhana (untuk siswa pemula)
    function labTips(hasil, opsi = {}) {
      const tips = [];
      const tambah = (t) => { if (!tips.includes(t)) tips.push(t); };
      const gagal = hasil.filter(h => !h.lulus);
      if (!gagal.length) return tips;
      const rapat = (x) => String(x).toLowerCase().replace(/[\s.,;:!?'"()\-]+/g, '');
      gagal.forEach(h => {
        const k = String(h.keluar || '').trim();
        const harapan = typeof h.harapan === 'string' && h.harapan !== '' ? h.harapan.trim() : null;
        if (h.galat) {
          if (/masih kosong/.test(h.galat)) tambah('Area kerja masih kosong. Pilih kategori di sebelah kiri, seret balok ke area putih, lalu sambungkan seperti puzzle (tonjolan masuk ke lekukan).');
          else if (/terlalu lama/.test(h.galat)) tambah('Perulangan tidak pernah berhenti. Pastikan nilai yang diperiksa pada kondisi berubah di dalam perulangan, misalnya N dikurangi 1 setiap putaran.');
          else if (/not defined|before initialization/.test(h.galat)) tambah('Ada variabel yang dipakai sebelum diberi nilai. Beri nilai awal lebih dulu dengan balok "set ... to".');
          else tambah('Program berhenti karena galat. Periksa balok yang belum tersambung atau kotak yang masih kosong.');
          return;
        }
        if (!opsi.tebak) {
          if (k === '') { tambah('Programmu belum mencetak apa pun. Tambahkan balok "print" dan sambungkan ke nilai yang ingin ditampilkan.'); return; }
          if (/NaN/.test(k)) tambah('Muncul NaN (bukan angka). Baca angka dengan balok "prompt for number" dan pastikan jumlah masukan sesuai soal.');
          if (typeof h.dibaca === 'number' && Array.isArray(h.input) && h.dibaca !== h.input.length) tambah(`Jumlah masukan yang tersedia (${h.input.length}) tidak sama dengan yang dibaca programmu (${h.dibaca}). Cek balok "prompt" yang kamu pakai.`);
          if (Array.isArray(h.input) && h.input.length >= 2 && k === h.input.slice(0, 2).join('')) tambah(`Hasilnya (${k}) menggabungkan teks, bukan menjumlahkan angka. Baca masukan dengan "prompt for number", bukan "prompt for text".`);
        }
        if (harapan !== null) {
          if (k.toLowerCase() === harapan.toLowerCase() && k !== harapan) tambah('Isinya sudah benar tetapi huruf besar/kecilnya berbeda. Tulis persis seperti contoh.');
          else if (rapat(k) === rapat(harapan) && k !== harapan) tambah('Isinya mirip, tetapi spasi atau tanda baca berbeda dari yang diminta. Tulis persis seperti contoh.');
          else {
            const a = k.split('\n').length, b = harapan.split('\n').length;
            if (a !== b) tambah(`Banyak baris keluaran berbeda: seharusnya ${b} baris, ${opsi.tebak ? 'tebakanmu' : 'programmu'} ${a} baris.${opsi.tebak ? '' : ' Periksa apakah "print" berada di dalam atau di luar perulangan.'}`);
          }
        }
      });
      if (hasil.length > 1 && hasil[0].lulus && gagal.length) tambah('Lulus di kasus contoh tetapi gagal di kasus lain. Coba kasus tepi seperti 0, bilangan negatif, atau dua bilangan yang sama.');
      return tips.slice(0, 3);
    }

    function labTipsHTML(tips) {
      return tips.length ? `<div class="lab-tips">💡 <b>Kemungkinan penyebab</b><ul>${tips.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul></div>` : '';
    }

    function labHasilHTML(hasil, opsi = {}) {
      const lulus = hasil.filter(h => h.lulus).length;
      const lencana = lulus === hasil.length ? 'ok' : lulus > 0 ? 'warn' : 'bad';
      const baris = hasil.map(h => {
        const tampilHarapan = opsi.semua || h.no === 1;
        return `<div class="lab-kasus ${h.lulus ? 'lulus' : 'gagal'}">
          <b>${h.lulus ? '✅' : '❌'} Kasus ${h.no}</b>
          ${h.input.length ? `<div class="mu">Masukan: ${escHtml(h.input.join(', '))}</div>` : '<div class="mu">Tanpa masukan</div>'}
          ${h.galat ? `<div class="lab-galat">${escHtml(h.galat)}</div>` : ''}
          ${!h.lulus ? `<div class="mu">Keluaran programmu:</div><pre>${escHtml(h.keluar) || '(kosong)'}</pre>` : ''}
          ${!h.lulus && tampilHarapan ? `<div class="mu">Seharusnya:</div><pre>${escHtml(h.harapan)}</pre>` : ''}
          ${!h.lulus && !tampilHarapan ? '<div class="mu">Kasus ini tersembunyi: periksa kembali logikamu.</div>' : ''}
        </div>`;
      }).join('');
      return `<div style="margin:10px 0;"><span class="badge ${lencana}">Lulus ${lulus} dari ${hasil.length} kasus uji</span></div>${labTipsHTML(opsi.tips || [])}${baris}`;
    }

    // ================= SISI GURU: FORM TUGAS =================
    let tgEditId = null;
    let wsGuru = null;
    let tgHasilUji = null;

    function tugasFormInit() {
      $id('tgKategori').innerHTML = Object.keys(LAB_KATEGORI_NAMA).map(k =>
        `<label class="chip"><input type="checkbox" value="${k}" onchange="tgKategoriBerubah()"> ${escHtml(LAB_KATEGORI_NAMA[k])}</label>`).join('');
      $id('tgKasus').innerHTML = '';
      tgTambahKasus();
      tgJenisBerubah();
    }

    function isiPilihanMateriTugas() {
      const sel = $id('tgMateri');
      if (!sel) return;
      const lama = sel.value;
      const daftar = (bankState.materi.items || []).filter(m => !m.diarsipkan).slice().reverse();
      sel.innerHTML = '<option value="">— (opsional) pilih materi sumber —</option>' +
        daftar.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.judul || '(tanpa judul)')}</option>`).join('');
      if (lama && daftar.some(m => String(m.id) === lama)) sel.value = lama;
    }

    function tgJenisBerubah() {
      const j = $id('tgJenis').value;
      $id('tgJenisTip').textContent = LAB_JENIS_TIP[j] || '';
      $id('tgEditorJudul').textContent = j === 'buat'
        ? 'Workspace uji guru (tidak disimpan) — susun jawaban contoh untuk mengisi/menguji kasus uji'
        : 'Kode awal untuk siswa (disimpan bersama tugas) — juga bisa dipakai menguji kasus uji';
    }

    function tgKategoriDipilih() { return [...document.querySelectorAll('#tgKategori input:checked')].map(c => c.value); }
    function tgKategoriBerubah() {
      if (wsGuru) { try { wsGuru.updateToolbox(bangunToolbox(tgKategoriDipilih())); } catch (_) {} }
    }
    function tgSetKategori(kat) {
      const pilih = Array.isArray(kat) ? kat : [];
      document.querySelectorAll('#tgKategori input').forEach(c => { c.checked = pilih.includes(c.value); });
      tgKategoriBerubah();
    }

    function tgTambahKasus(k = { input: [], output: '' }) {
      const d = document.createElement('div');
      d.className = 'tg-kasus';
      d.innerHTML = `
        <div><label class="mu">Masukan (satu nilai per baris)</label><textarea class="tk-in" rows="2"></textarea></div>
        <div><label class="mu">Keluaran yang diharapkan</label><textarea class="tk-out" rows="2"></textarea></div>
        <button type="button" class="alt danger" title="Hapus kasus" onclick="this.closest('.tg-kasus').remove()">🗑</button>`;
      d.querySelector('.tk-in').value = (k.input || []).join('\n');
      d.querySelector('.tk-out').value = k.output || '';
      $id('tgKasus').appendChild(d);
    }
    function tgBacaKasus() {
      return [...document.querySelectorAll('#tgKasus .tg-kasus')].map(d => ({
        input: d.querySelector('.tk-in').value.split('\n').map(s => s.trim()).filter(s => s !== ''),
        output: d.querySelector('.tk-out').value.replace(/\s+$/, '')
      })).filter(k => k.output.trim() !== '');
    }
    function tgIsiKasus(daftar) {
      $id('tgKasus').innerHTML = '';
      (daftar && daftar.length ? daftar : [{ input: [], output: '' }]).forEach(k => tgTambahKasus(k));
    }

    function tgBukaWorkspace() {
      $id('tgEditorWrap').classList.remove('hidden');
      $id('btnTgBuka').classList.add('hidden');
      try {
        if (!wsGuru) wsGuru = labBuatWorkspace('tgEditorDiv', tgKategoriDipilih());
        else Blockly.svgResize(wsGuru);
      } catch (e) { alert('Workspace gagal dibuat: ' + e.message); }
    }
    function tgKosongkanWorkspace() {
      if (!wsGuru) return;
      if (labAdaBlok(wsGuru) && !confirm('Kosongkan workspace guru?')) return;
      wsGuru.clear();
    }

    async function tgAI() {
      const status = $id('tgAIStatus'), btn = $id('btnTgAI');
      let topik = $id('tgTopik').value.trim(), materiTeks = '';
      const mid = $id('tgMateri').value;
      if (mid) {
        const m = bankState.materi.items.find(x => String(x.id) === String(mid));
        if (m) { materiTeks = htmlKeTeks(m.konten); if (!topik) topik = m.judul || ''; }
      }
      if (!topik && !materiTeks) return alert('Isi topik atau pilih materi sumber dulu.');
      btn.disabled = true; status.textContent = '⏳ AI sedang merancang tugas…';
      try {
        const d = await panggilEdge({ mode: 'tugas', topik, materiTeks, jenis: $id('tgJenis').value, tingkat: $id('tgTingkat').value }, 100000);
        const t = d.tugas;
        $id('tgJudul').value = t.judul || '';
        $id('tgTopik').value = t.topik || topik;
        $id('tgTujuan').value = t.tujuan || '';
        $id('tgDesk').value = t.deskripsi || '';
        $id('tgPetunjuk').value = (t.petunjuk || []).join('\n');
        $id('tgRubrik').value = t.rubrik || '';
        $id('tgPseudo').value = t.pseudokode || '';
        tgSetKategori(t.kategori || []);
        tgIsiKasus(t.kasus_uji || []);
        status.textContent = '✅ Draf terisi. Periksa semua isian, terutama keluaran kasus uji (hitungan AI bisa keliru): susun jawaban contoh di workspace lalu tekan "Uji kasus uji".';
      } catch (e) { status.textContent = '❌ ' + e.message; }
      finally { btn.disabled = false; }
    }

    function tgUji() {
      if (!wsGuru) { tgBukaWorkspace(); return alert('Susun jawaban contoh di workspace guru dulu, lalu tekan "Uji kasus uji".'); }
      const kasus = tgBacaKasus();
      if (!kasus.length) return alert('Belum ada kasus uji yang terisi.');
      let kode;
      try { kode = labKodeJS(wsGuru); } catch (e) { return alert(e.message); }
      if (!kode.trim()) return alert('Workspace guru masih kosong.');
      tgHasilUji = periksaKasus(kode, kasus);
      $id('tgUjiHasil').innerHTML = labHasilHTML(tgHasilUji, { semua: true }) +
        (tgHasilUji.some(h => !h.lulus) ? '<button type="button" class="alt" onclick="tgPakaiKeluaran()">📋 Pakai keluaran program ini sebagai jawaban yang benar</button>' : '');
    }
    function tgPakaiKeluaran() {
      if (!tgHasilUji) return;
      if (tgHasilUji.some(h => h.galat)) return alert('Ada kasus yang berhenti karena galat, perbaiki programnya dulu.');
      if (!confirm('Ganti keluaran yang diharapkan di semua kasus dengan keluaran program guru? Pastikan program guru sudah benar.')) return;
      const daftar = [...document.querySelectorAll('#tgKasus .tg-kasus')];
      daftar.forEach((d, i) => {
        const k = tgBacaKasusMentah(d);
        const hasil = tgHasilUji.find(h => h.input.join('\n') === k.input.join('\n'));
        if (hasil) d.querySelector('.tk-out').value = hasil.keluar;
      });
      tgUji();
    }
    function tgBacaKasusMentah(d) {
      return { input: d.querySelector('.tk-in').value.split('\n').map(s => s.trim()).filter(s => s !== '') };
    }

    function tgReset() {
      tgEditId = null; tgHasilUji = null;
      ['tgJudul', 'tgDesk', 'tgTopik', 'tgTujuan', 'tgPetunjuk', 'tgRubrik', 'tgPseudo'].forEach(i => { $id(i).value = ''; });
      $id('tgJenis').value = 'buat'; $id('tgMateri').value = '';
      $id('tgAIStatus').textContent = ''; $id('tgUjiHasil').innerHTML = '';
      tgSetKategori([]); tgIsiKasus([]); tgJenisBerubah();
      if (wsGuru) wsGuru.clear();
      $id('tgFormJudul').textContent = '+ Buat Tugas Baru Ke Bank Master';
      $id('btnTgSimpan').textContent = '💾 Simpan Ke Bank Tugas';
      $id('btnTgBatal').classList.add('hidden');
    }

    async function simpanBankTugas() {
      const judul = $id('tgJudul').value.trim();
      if (!judul) return alert('Isi judul tugas!');
      const jenis = $id('tgJenis').value;
      const kasus = tgBacaKasus();
      if (!kasus.length && !confirm('Tugas ini belum punya kasus uji, jadi siswa tidak bisa memakai tombol Periksa. Tetap simpan?')) return;

      let starter = null;
      if (jenis !== 'buat') {
        if (!wsGuru || !labAdaBlok(wsGuru)) {
          if (!confirm('Jenis "' + LAB_JENIS[jenis] + '" biasanya memakai kode awal, tetapi workspace guru masih kosong. Tetap simpan tanpa kode awal?')) return;
        } else starter = labSimpanState(wsGuru);
      }
      const baris = {
        judul, deskripsi: $id('tgDesk').value.trim(), jenis,
        topik: $id('tgTopik').value.trim() || null, tujuan: $id('tgTujuan').value.trim() || null,
        kategori: tgKategoriDipilih(), kasus_uji: kasus,
        petunjuk: $id('tgPetunjuk').value.split('\n').map(s => s.trim()).filter(Boolean),
        pseudokode: $id('tgPseudo').value.trim() || null,
        rubrik: $id('tgRubrik').value.trim() || null, starter
      };
      const { error } = await guruRPC('guru_simpan', { p_tabel: 'tugas', p_data: baris, p_id: tgEditId ? String(tgEditId) : null });
      if (error) return alert('Gagal menyimpan: ' + error.message + (/column|schema/i.test(error.message) ? '\n\nJalankan lab_b.sql di Supabase SQL Editor dulu.' : ''));
      alert(tgEditId ? 'Perubahan tugas tersimpan!' : 'Tugas tersimpan ke Bank Master!');
      tgReset();
      loadBankTugasGuru();
    }

    function tugasEdit(id) {
      const x = bankState.tugas.items.find(t => String(t.id) === String(id));
      if (!x) return;
      tgReset();
      tgEditId = x.id;
      $id('tgJudul').value = x.judul || ''; $id('tgDesk').value = x.deskripsi || '';
      $id('tgJenis').value = LAB_JENIS[x.jenis] ? x.jenis : 'buat';
      $id('tgTopik').value = x.topik || ''; $id('tgTujuan').value = x.tujuan || '';
      $id('tgPetunjuk').value = (Array.isArray(x.petunjuk) ? x.petunjuk : []).join('\n');
      $id('tgRubrik').value = x.rubrik || ''; $id('tgPseudo').value = x.pseudokode || '';
      tgSetKategori(Array.isArray(x.kategori) ? x.kategori : []);
      tgIsiKasus(labKasusList(x.kasus_uji));
      tgJenisBerubah();
      if (x.starter) { tgBukaWorkspace(); labMuatState(wsGuru, x.starter); }
      $id('tgFormJudul').textContent = '✏️ Edit Tugas: ' + (x.judul || '');
      $id('btnTgSimpan').textContent = '💾 Simpan Perubahan';
      $id('btnTgBatal').classList.remove('hidden');
      $id('tugasFormCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function loadBankTugasGuru() { return loadBank('tugas'); }

    async function publishTugasMulti(tugasId, targetKelas) {
      const { error } = await guruRPC('guru_publish', { p_bank: 'tugas', p_id: String(tugasId), p_kelas: [targetKelas] });
      if (error) return alert('Gagal publish: ' + error.message);
      alert(`Tugas Koding dipublish ke Kelas ${targetKelas}!`);
    }

    function tugasDetailHTML(x) {
      const kasus = labKasusList(x.kasus_uji);
      const pet = Array.isArray(x.petunjuk) ? x.petunjuk : [];
      const kat = Array.isArray(x.kategori) ? x.kategori : [];
      let h = `<div class="bank-detail">
        <div class="ks-badges">
          <span class="badge">${escHtml(LAB_JENIS[x.jenis] || 'Buat program')}</span>
          ${x.topik ? `<span class="badge">${escHtml(x.topik)}</span>` : ''}
          <span class="badge">${kasus.length} kasus uji</span>
          ${x.starter ? '<span class="badge">ada kode awal</span>' : ''}
          ${kat.length ? `<span class="badge">balok: ${escHtml(kat.map(k => LAB_KATEGORI_NAMA[k] || k).join(', '))}</span>` : '<span class="badge">semua balok</span>'}
        </div>
        ${x.tujuan ? `<div><b>Tujuan:</b> ${escHtml(x.tujuan)}</div>` : ''}
        <div class="soal-teks" style="margin-top:6px;">${escHtml(x.deskripsi) || '<span class="mu">(tanpa instruksi)</span>'}</div>
        ${pet.length ? `<div style="margin-top:6px;"><b>Petunjuk:</b><ol style="margin:4px 0 0 18px;">${pet.map(p => `<li>${escHtml(p)}</li>`).join('')}</ol></div>` : ''}
        ${x.pseudokode ? `<div style="margin-top:6px;"><b>Kerangka pseudokode (petunjuk terakhir):</b><pre class="lab-pseudo">${escHtml(x.pseudokode)}</pre></div>` : ''}
        ${x.rubrik ? `<div style="margin-top:6px;"><b>Rubrik:</b><div class="soal-teks">${escHtml(x.rubrik)}</div></div>` : ''}
      </div>`;
      if (tugasKumOpen.has(String(x.id))) h += tugasKumHTML(String(x.id));
      return h;
    }

    // ================= SISI GURU: ULASAN PENGUMPULAN =================
    const tugasKumOpen = new Set();
    const tugasKumCache = {};
    let kumDilihat = null;

    async function tugasKum(id) {
      id = String(id);
      if (tugasKumOpen.has(id)) { tugasKumOpen.delete(id); return renderBank('tugas'); }
      tugasKumOpen.add(id);
      await muatKumTugas(id);
    }

    async function muatKumTugas(id) {
      id = String(id);
      delete tugasKumCache[id];
      renderBank('tugas');
      try {
        const pub = await db.from('tugas_published').select('kelas').eq('tugas_id', id);
        const kum = await guruBaca('pengumpulan', 'tugas_id', [id]);
        if (pub.error) throw pub.error;
        if (kum.error) throw kum.error;
        const kelas = [...new Set((pub.data || []).map(p => p.kelas))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
        let siswa = [];
        if (kelas.length) {
          const s = await ambilSiswaKelas(kelas);
          if (s.error) throw s.error;
          siswa = s.data || [];
        }
        tugasKumCache[id] = { kelas, siswa, kum: kum.data || [] };
      } catch (e) {
        tugasKumOpen.delete(id);
        alert('Gagal memuat pengumpulan: ' + (e.message || e));
      }
      renderBank('tugas');
    }

    function kumTerbaru(kum, tugasId, siswaId) {
      const d = kum.filter(k => String(k.tugas_id) === String(tugasId) && String(k.siswa_id) === String(siswaId));
      if (!d.length) return null;
      return d.slice().sort((a, b) => String(b.dikirim_at || '').localeCompare(String(a.dikirim_at || '')))[0];
    }
    function kumUji(k) {
      let h = k && k.hasil_uji;
      if (typeof h === 'string') { try { h = JSON.parse(h); } catch (_) { h = null; } }
      return h && typeof h.total === 'number' ? h : null;
    }

    function tugasKumHTML(id) {
      const c = tugasKumCache[id];
      if (!c) return '<p class="mu">Memuat pengumpulan…</p>';
      let out = `<div class="bank-actions">
        <button class="alt" onclick="muatKumTugas('${id}')">🔄 Muat ulang</button>
        <button class="alt" onclick="unduhKumTugas('${id}')">📥 Unduh Excel</button></div>`;
      if (!c.kelas.length) return out + '<p class="mu">Tugas ini belum dipublish ke kelas mana pun.</p>';
      out += c.kelas.map(kls => {
        const murid = c.siswa.filter(s => s.kelas === kls).sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
        const sudah = murid.filter(s => kumTerbaru(c.kum, id, s.id)).length;
        const baris = murid.map(s => {
          const k = kumTerbaru(c.kum, id, s.id);
          if (!k) return `<tr><td>${escHtml(s.nama)}</td><td colspan="4"><span class="mu">Belum mengumpulkan</span></td><td></td></tr>`;
          const u = kumUji(k);
          const flag = String(k.status_indikasi || '').includes('Potensi');
          return `<tr>
            <td>${escHtml(s.nama)}</td>
            <td>${u ? `<span class="badge ${u.lulus === u.total ? 'ok' : u.lulus > 0 ? 'warn' : 'bad'}">${u.lulus}/${u.total}</span>` : '<span class="mu">-</span>'}</td>
            <td>${k.jumlah_jalankan ?? '-'}× / ${k.durasi_detik ?? '-'} dtk${(k.kirim_ke || 1) > 1 ? ` • kirim ke-${k.kirim_ke}` : ''}</td>
            <td>${flag ? '<span class="badge bad">⚠️ cek</span>' : '<span class="badge ok">Aman</span>'}</td>
            <td>${k.nilai_guru !== null && k.nilai_guru !== undefined ? `<b>${escHtml(k.nilai_guru)}</b>` : '<span class="mu">-</span>'}</td>
            <td><button class="alt" onclick="kumLihat('${id}', '${escHtml(String(s.id))}')">Lihat</button></td></tr>`;
        }).join('');
        return `<div class="hs-kelas"><b>${escHtml(kls)}</b> <span class="mu">— ${sudah}/${murid.length} sudah mengumpulkan</span>
          <div class="tbl-scroll"><table><thead><tr><th>Nama</th><th>Uji</th><th>Proses</th><th>Status</th><th>Nilai</th><th></th></tr></thead><tbody>${baris}</tbody></table></div></div>`;
      }).join('');
      return out;
    }

    function unduhKumTugas(id) {
      const c = tugasKumCache[id];
      if (!c) return;
      const baris = [['Kelas', 'Nama', 'Status', 'Lulus uji', 'Total kasus', 'Jalankan', 'Durasi (detik)', 'Petunjuk dibuka', 'Nilai guru', 'Komentar guru']];
      c.kelas.forEach(kls => c.siswa.filter(s => s.kelas === kls).forEach(s => {
        const k = kumTerbaru(c.kum, id, s.id); const u = k ? kumUji(k) : null;
        baris.push([kls, s.nama, k ? 'Mengumpulkan' : 'Belum', u ? u.lulus : '', u ? u.total : '', k ? (k.jumlah_jalankan ?? '') : '', k ? (k.durasi_detik ?? '') : '', k ? (k.petunjuk_dibuka ?? '') : '', k && k.nilai_guru !== null && k.nilai_guru !== undefined ? k.nilai_guru : '', k ? (k.komentar_guru || '') : '']);
      }));
      unduhCSV('tugas_' + id + '.csv', baris);
    }

    function kumLihat(tugasId, siswaId) {
      const c = tugasKumCache[String(tugasId)];
      if (!c) return;
      const s = c.siswa.find(x => String(x.id) === String(siswaId));
      const k = kumTerbaru(c.kum, tugasId, siswaId);
      if (!s || !k) return;
      kumDilihat = { tugasId: String(tugasId), siswaId: String(siswaId) };
      const u = kumUji(k);
      const tugas = bankState.tugas.items.find(t => String(t.id) === String(tugasId)) || {};
      $id('modalLabBody').innerHTML = `
        <div class="card">
          <b>${escHtml(s.nama)}</b> <span class="mu">• ${escHtml(s.kelas)} • ${escHtml(tugas.judul || '')}</span>
          <div class="ks-badges">
            ${u ? `<span class="badge ${u.lulus === u.total ? 'ok' : 'warn'}">Lulus uji ${u.lulus}/${u.total}</span>` : ''}
            <span class="badge">${k.durasi_detik ?? '-'} detik</span>
            <span class="badge">${k.jumlah_jalankan ?? 0}× dijalankan</span>
            <span class="badge">${k.petunjuk_dibuka ?? 0} petunjuk dibuka</span>
            <span class="badge">${k.total_aksi ?? 0} aksi blok</span>
            ${(k.kirim_ke || 1) > 1 ? `<span class="badge warn">dikirim ${k.kirim_ke}×</span>` : ''}
            ${k.status_indikasi ? `<span class="badge ${String(k.status_indikasi).includes('Potensi') ? 'bad' : 'ok'}">${escHtml(k.status_indikasi)}</span>` : ''}
          </div>
          ${u && Array.isArray(u.detail) ? `<div class="mu">Kasus: ${u.detail.map(d => (d.lulus ? '✅' : '❌') + d.no).join(' ')}</div>` : ''}
        </div>
        <div class="card"><b>Kode Python siswa</b><div class="code-preview" style="user-select:text; margin-top:8px; max-height:340px;">${escHtml(k.jawaban_kode || '(kosong)')}</div></div>
        <div class="card">
          <label class="mu">Nilai (0–100)</label><input type="number" id="kumNilai" min="0" max="100" value="${k.nilai_guru ?? ''}">
          <label class="mu">Komentar untuk siswa</label><textarea id="kumKomentar" rows="3">${escHtml(k.komentar_guru || '')}</textarea>
          ${tugas.rubrik ? `<details><summary class="mu">Lihat rubrik</summary><div class="soal-teks">${escHtml(tugas.rubrik)}</div></details>` : ''}
          <button onclick="kumSimpanNilai()" style="margin-top:8px;">💾 Simpan penilaian</button>
        </div>`;
      $id('modalLab').classList.remove('hidden');
    }
    function tutupModalLab() { $id('modalLab').classList.add('hidden'); kumDilihat = null; }

    async function kumSimpanNilai() {
      if (!kumDilihat) return;
      const v = $id('kumNilai').value;
      const nilai = v === '' ? null : Math.max(0, Math.min(100, Number(v)));
      if (v !== '' && !isFinite(nilai)) return alert('Nilai harus berupa angka 0–100.');
      const { error } = await db.rpc('guru_nilai_tugas', {
        p_user: activeUser.username, p_pass: sesiToken,
        p_tugas_id: String(kumDilihat.tugasId), p_siswa_id: String(kumDilihat.siswaId),
        p_nilai: nilai, p_komentar: $id('kumKomentar').value.trim() || null
      });
      if (error) { if (galatSesi(error.message)) return sesiHabis(); return alert('Gagal menyimpan: ' + error.message); }
      const id = kumDilihat.tugasId;
      tutupModalLab();
      await muatKumTugas(id);
    }

    // ================= SISI SISWA =================
    const labTugasCache = {};
    let labS = null;

    async function loadTugasSiswa() {
      const container = $id('listTugasSiswa');
      const pub = await db.from('tugas_published').select('*, tugas(*)').eq('kelas', activeUser.kelas);
      const kum = await siswaBaca('pengumpulan');
      if (pub.error) { container.innerHTML = `<p class="mu">Gagal memuat tugas: ${escHtml(pub.error.message)}</p>`; return; }
      const rowsT = (pub.data || []).filter(d => d.tugas && !d.tugas.diarsipkan);
      if (rowsT.length === 0) {
        container.innerHTML = '<p class="mu">Belum ada tugas lab dipublish untuk kelasmu.</p>';
        return;
      }
      const seen = new Set();
      container.innerHTML = rowsT.filter(d => { if (seen.has(String(d.tugas.id))) return false; seen.add(String(d.tugas.id)); return true; }).map(d => {
        const t = d.tugas; labTugasCache[String(t.id)] = t;
        const k = kumTerbaru(kum.data || [], t.id, activeUser.id);
        const u = k ? kumUji(k) : null;
        return `
          <div class="card ks-paket">
            <b style="font-size:1.05rem;">${escHtml(t.judul)}</b>
            <div class="ks-badges">
              <span class="badge">${escHtml(LAB_JENIS[t.jenis] || 'Buat program')}</span>
              ${t.topik ? `<span class="badge">${escHtml(t.topik)}</span>` : ''}
              ${k ? '<span class="badge ok">✓ Sudah dikirim</span>' : ''}
              ${u ? `<span class="badge ${u.lulus === u.total ? 'ok' : 'warn'}">Uji ${u.lulus}/${u.total}</span>` : ''}
              ${k && k.nilai_guru !== null && k.nilai_guru !== undefined ? `<span class="badge ok">Nilai ${escHtml(k.nilai_guru)}</span>` : ''}
            </div>
            <div class="mu soal-teks">${escHtml((t.deskripsi || '').slice(0, 160))}${(t.deskripsi || '').length > 160 ? '…' : ''}</div>
            ${k && k.komentar_guru ? `<div class="pembahasan">💬 <b>Komentar guru</b><div class="soal-teks">${escHtml(k.komentar_guru)}</div></div>` : ''}
            <div class="ks-aksi"><button onclick="bukaLab('${escHtml(String(t.id))}')">${k ? '↻ Buka lagi' : '▶ Kerjakan'}</button></div>
          </div>`;
      }).join('');
    }

    function labKunciSimpan() { return `lab_${activeUser.id}_${labS.t.id}`; }

    function bukaLab(tugasId) {
      const t = labTugasCache[String(tugasId)];
      if (!t) return alert('Tugas tidak ditemukan. Muat ulang halaman.');
      if (labS && labS.ws) { try { labS.ws.dispose(); } catch (_) {} clearInterval(labS.timer); }
      selectedTugasId = t.id;
      labS = { t, ws: null, mulai: Date.now(), aksi: 0, jalankan: 0, periksa: 0, petunjuk: 0, memuat: true, kunci: null, terakhir: null, simpanT: null, timer: null };
      const jenis = LAB_JENIS[t.jenis] ? t.jenis : 'buat';
      const pet = labPetunjukList(t);
      const kasus = labKasusList(t.kasus_uji);

      $id('labSection').classList.remove('hidden');
      $id('labHead').innerHTML = `
        <h3>${escHtml(t.judul)}</h3>
        <div class="ks-badges"><span class="badge">${escHtml(LAB_JENIS[jenis])}</span>${t.topik ? `<span class="badge">${escHtml(t.topik)}</span>` : ''}</div>
        ${t.tujuan ? `<div class="mu" style="margin:4px 0;">🎯 ${escHtml(t.tujuan)}</div>` : ''}
        <div class="soal-teks lab-instruksi">${escHtml(t.deskripsi) || '(tanpa instruksi)'}</div>`;
      $id('labPetunjukBox').innerHTML = pet.length
        ? `<div id="labPetunjukIsi"></div><button class="alt" id="btnPetunjuk" onclick="labPetunjuk()">💡 Butuh petunjuk? (0/${pet.length})</button>` : '';
      $id('labPanduanIsi').innerHTML = labPanduanHTML(t.kategori);
      $id('labPanduan').open = false;
      $id('labMasukan').value = (kasus[0] && kasus[0].input || []).join('\n');
      $id('labMasukanBox').classList.toggle('hidden', jenis === 'tebak');
      $id('labTebakBox').classList.toggle('hidden', jenis !== 'tebak');
      $id('btnJalankan').classList.toggle('hidden', jenis === 'tebak');
      $id('labTebak').value = '';
      $id('labKeluaran').innerHTML = ''; $id('labHasil').innerHTML = '';
      $id('pythonCode').textContent = '# Susun balok di sebelah kiri...';

      // workspace
      try {
        labS.ws = labBuatWorkspace('blocklyDiv', t.kategori, { readOnly: jenis === 'tebak' });
      } catch (e) { alert('Workspace gagal dibuat: ' + e.message); return; }
      const ws = labS.ws;
      labS.kunci = labKunciSimpan();
      let pulih = null;
      try { pulih = localStorage.getItem(labS.kunci); } catch (_) {}
      if (pulih) labMuatState(ws, pulih);
      else if (t.starter) labMuatState(ws, t.starter);
      $id('pythonCode').textContent = labKodePy(ws) || '# Susun balok di sebelah kiri...';
      labS.memuat = false;
      ws.addChangeListener((e) => {
        if (labS.memuat || e.isUiEvent || e.type === Blockly.Events.UI) return;
        labS.aksi++;
        $id('pythonCode').textContent = labKodePy(ws) || '# Susun balok di sebelah kiri...';
        clearTimeout(labS.simpanT);
        labS.simpanT = setTimeout(() => { const s = labSimpanState(ws); try { if (s) localStorage.setItem(labS.kunci, s); } catch (_) {} }, 800);
      });
      try { Blockly.svgResize(ws); } catch (_) {}

      labS.timer = setInterval(() => {
        const sec = Math.floor((Date.now() - labS.mulai) / 1000);
        $id('timerText').textContent = `Waktu pengerjaan: ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      }, 1000);
      $id('labSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function labPetunjukList(t) {
      const p = (Array.isArray(t.petunjuk) ? t.petunjuk : []).map(x => ({ teks: x }));
      if (t.pseudokode) p.push({ teks: t.pseudokode, pseudo: true });
      return p;
    }

    function labPetunjuk() {
      const pet = labPetunjukList(labS.t);
      if (labS.petunjuk >= pet.length) return;
      labS.petunjuk++;
      $id('labPetunjukIsi').innerHTML = pet.slice(0, labS.petunjuk).map((p, i) => p.pseudo
        ? `<div class="pembahasan">🧩 <b>Kerangka pseudokode</b><pre class="lab-pseudo">${escHtml(p.teks)}</pre><div class="mu">Bagian bertanda ... harus kamu isi sendiri.</div></div>`
        : `<div class="pembahasan">💡 <b>Petunjuk ${i + 1}</b><div class="soal-teks">${escHtml(p.teks)}</div></div>`).join('');
      const b = $id('btnPetunjuk');
      if (labS.petunjuk >= pet.length) b.classList.add('hidden'); else b.textContent = `💡 Petunjuk berikutnya (${labS.petunjuk}/${pet.length})`;
    }

    function labJalankan() {
      let kode;
      try { kode = labKodeJS(labS.ws); } catch (e) { return alert(e.message); }
      if (!kode.trim()) { $id('labKeluaran').innerHTML = '<div class="mu">Workspace masih kosong.</div>'; return; }
      labS.jalankan++;
      const masukan = $id('labMasukan').value.split('\n').map(s => s.trim()).filter(s => s !== '');
      const r = jalankanKode(kode, masukan);
      $id('labKeluaran').innerHTML = `<div class="mu">Keluaran program:</div><pre class="lab-out">${escHtml(r.keluar.join('\n')) || '(tidak ada keluaran)'}</pre>` +
        (r.galat ? `<div class="lab-galat">${escHtml(r.galat)}</div>` : '') +
        labTipsHTML(labTips([{ lulus: false, keluar: r.keluar.join('\n'), galat: r.galat, input: masukan, dibaca: r.dibaca }]));
    }

    function labHitungHasil() {
      const t = labS.t, kasus = labKasusList(t.kasus_uji);
      if (t.jenis === 'tebak') {
        const tebak = $id('labTebak').value;
        const k = kasus[0];
        if (!k) return [];
        return [{ no: 1, lulus: samaKeluaran(tebak, k.output), keluar: tebak, galat: null, input: k.input, harapan: k.output }];
      }
      if (!kasus.length) return [];
      const kode = labKodeJS(labS.ws);
      if (!kode.trim()) return kasus.map((k, i) => ({ no: i + 1, lulus: false, keluar: '', galat: 'Workspace masih kosong.', input: k.input, harapan: k.output }));
      return periksaKasus(kode, kasus);
    }

    function labPeriksa() {
      if (!labKasusList(labS.t.kasus_uji).length) { $id('labHasil').innerHTML = '<div class="mu">Tugas ini belum punya kasus uji. Kirim saja jawabanmu ke guru.</div>'; return; }
      if (labS.t.jenis === 'tebak' && !$id('labTebak').value.trim()) return alert('Ketik tebakan keluaranmu dulu.');
      let hasil;
      try { hasil = labHitungHasil(); } catch (e) { return alert(e.message); }
      labS.periksa++; labS.terakhir = hasil;
      $id('labHasil').innerHTML = labHasilHTML(hasil, { semua: false, tips: labTips(hasil, { tebak: labS.t.jenis === 'tebak' }) });
    }

    function tutupLab() {
      if (labS && labS.aksi > 0 && !confirm('Tutup tugas? Susunan balokmu tersimpan di perangkat ini dan bisa dilanjutkan, tetapi belum dikirim ke guru.')) return;
      if (labS) { clearInterval(labS.timer); try { labS.ws.dispose(); } catch (_) {} }
      labS = null;
      $id('labSection').classList.add('hidden');
    }

    async function submitTugas() {
      if (!labS) return;
      const t = labS.t;
      const jenis = LAB_JENIS[t.jenis] ? t.jenis : 'buat';
      const kode = labKodePy(labS.ws);
      if (jenis !== 'tebak' && !labAdaBlok(labS.ws)) return alert('Kodingan masih kosong!');
      if (jenis === 'tebak' && !$id('labTebak').value.trim()) return alert('Ketik tebakan keluaranmu dulu.');

      let hasil = [];
      try { hasil = labHitungHasil(); } catch (e) { return alert(e.message); }
      const lulus = hasil.filter(h => h.lulus).length;
      if (hasil.length && lulus < hasil.length && !confirm(`Baru ${lulus} dari ${hasil.length} kasus uji yang lulus. Tetap kirim ke guru?`)) {
        labS.terakhir = hasil; $id('labHasil').innerHTML = labHasilHTML(hasil, { semua: false, tips: labTips(hasil, { tebak: jenis === 'tebak' }) });
        return;
      }

      const durasiDetik = Math.floor((Date.now() - labS.mulai) / 1000);
      // Penanda proses: tugas "buat" dari nol wajar butuh banyak aksi; tugas dengan kode awal cukup dicek waktunya.
      let statusIndikasi = 'Aman';
      if (jenis === 'buat' ? (durasiDetik < 15 || labS.aksi < 3) : durasiDetik < 10) statusIndikasi = '⚠️ Potensi Contek (Terlalu Cepat/Tanpa Proses)';

      const baris = {
        jawaban_kode: kode || '# (tebakan) ' + $id('labTebak').value, jawaban_blok: jenis === 'tebak' ? null : labSimpanState(labS.ws),
        durasi_detik: durasiDetik, total_aksi: labS.aksi, status_indikasi: statusIndikasi,
        hasil_uji: hasil.length ? { lulus, total: hasil.length, detail: hasil.map(h => ({ no: h.no, lulus: h.lulus })) } : null,
        jumlah_jalankan: labS.jalankan + labS.periksa, petunjuk_dibuka: labS.petunjuk
      };

      // Dikirim lewat server (keamanan_4b.sql): siswa_id dari token, waktu kirim & kirim_ke dihitung server.
      const { error: err } = await db.rpc('siswa_kirim_tugas', { p_token: sesiToken, p_tugas_id: String(t.id), p_data: baris });
      if (err) {
        if (galatSesi(err.message)) return sesiHabis();
        return alert('Gagal mengirim: ' + err.message + (/function|schema cache|does not exist/i.test(err.message) ? '\n\nBeritahu gurumu: SQL keamanan_4b.sql belum dijalankan.' : ''));
      }

      try { localStorage.removeItem(labS.kunci); } catch (_) {}
      clearInterval(labS.timer);
      alert('Tugas berhasil dikirim ke guru!' + (hasil.length ? `\nHasil uji: ${lulus}/${hasil.length} kasus lulus.` : ''));
      try { labS.ws.dispose(); } catch (_) {}
      labS = null;
      $id('labSection').classList.add('hidden');
      loadTugasSiswa();
    }

