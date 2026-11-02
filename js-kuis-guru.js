// LMS Informatika SMA — js-kuis-guru.js: Generator soal, impor, bank soal, paket (guru).
// Dipecah dari index.html (2 Nov 2026), isi tidak diubah. File js-*.js dimuat berurutan oleh index.html.
    // ================= MODUL 2: BANK KUIS AI & SOAL =================
    // ================= GENERATOR SOAL AI (Tahap 1) =================
    let draftSoal = [];
    let draftCtx = null;
    let uidSeq = 1;
    const $id = (x) => document.getElementById(x);

    function htmlKeTeks(html) {
      if (!html) return '';
      if (!isHtmlKonten(html)) return html;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('style,script').forEach(e => e.remove());
      doc.querySelectorAll('br').forEach(e => e.replaceWith('\n'));
      doc.querySelectorAll('h1,h2,h3,h4,p,li,div,pre,tr,dt,dd').forEach(e => e.append('\n'));
      doc.querySelectorAll('b,strong,span,th,td').forEach(e => e.append(' '));
      return (doc.body.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    async function panggilEdge(body, timeoutMs = 140000) {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ ...body, token: sesiToken }),
          signal: ctrl.signal
        });
        let data;
        try { data = await res.json(); } catch (_) { throw new Error('Respons server tidak terbaca (HTTP ' + res.status + ')'); }
        if (res.status === 401) sesiHabis(data.error);
        if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));
        return data;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Waktu habis (tidak ada respons dari server). Tekan "Tes koneksi AI" untuk mengetahui penyebabnya.');
        if (/Load failed|Failed to fetch/i.test(e.message)) throw new Error('Koneksi ke server AI gagal. Coba lagi, atau kurangi jumlah soal.');
        throw e;
      } finally { clearTimeout(tm); }
    }

    function isiPilihanMateriAI() {
      const sel = $id('aiMateri');
      if (!sel) return;
      const lama = sel.value;
      const daftar = (bankState.materi.items || []).filter(m => !m.diarsipkan).slice();
      if (daftar.some(m => m.created_at)) daftar.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      else daftar.reverse();
      sel.innerHTML = daftar.length
        ? '<option value="">— Pilih materi —</option>' + daftar.map(m => `<option value="${escHtml(m.id)}">${escHtml(m.judul || '(tanpa judul)')}</option>`).join('')
        : '<option value="">(Bank Materi masih kosong)</option>';
      if (lama && daftar.some(m => String(m.id) === lama)) sel.value = lama;
    }

    function aiSumberChange() {
      const materi = $id('aiSumber').value === 'materi';
      $id('aiBoxMateri').classList.toggle('hidden', !materi);
      $id('aiBoxTopik').classList.toggle('hidden', materi);
    }

    async function generateSoalAI() {
      const status = $id('aiKuisStatus');
      const btn = $id('btnGenSoalAI');
      const sumber = $id('aiSumber').value;
      let topik = '', materiTeks = '', materiId = null;

      if (sumber === 'materi') {
        const id = $id('aiMateri').value;
        if (!id) return alert('Pilih materi dulu.');
        const m = bankState.materi.items.find(x => String(x.id) === String(id));
        if (!m) return alert('Materi tidak ditemukan. Muat ulang halaman.');
        materiTeks = htmlKeTeks(m.konten);
        if (materiTeks.length < 80) return alert('Isi materi ini terlalu pendek atau hanya berupa tautan media. Pilih materi lain, atau gunakan "topik bebas".');
        topik = m.judul || ''; materiId = m.id;
      } else {
        topik = $id('aiTopik').value.trim();
        if (!topik) return alert('Isi topik soal!');
      }

      const fokus = $id('aiFokus').value.trim();
      const jumlah = parseInt($id('aiJumlah').value) || 10;
      const tingkat = $id('aiTingkat').value;
      const jenis = $id('aiJenis').value;

      const hindari = (bankState.kuis.items || [])
        .filter(q => materiId ? String(q.sumber_materi_id) === String(materiId) : (q.topik || '').toLowerCase().includes(topik.toLowerCase()))
        .map(q => q.pertanyaan).filter(Boolean).slice(-30);

      btn.disabled = true;
      const PER_BAGIAN = 5;
      const bagian = Math.ceil(jumlah / PER_BAGIAN);
      let hasil = [], dibuang = 0, semuaDiperiksa = true, galat = null;

      try {
        for (let b = 0; b < bagian; b++) {
          const n = Math.min(PER_BAGIAN, jumlah - b * PER_BAGIAN);
          status.textContent = `🤖 AI sedang membuat soal... bagian ${b + 1} dari ${bagian} (${n} soal, sekitar 15–40 detik)`;
          const sudah = hasil.map(s => s.pertanyaan);
          const data = await panggilEdge({
            mode: 'soal', topik, fokus, materiTeks, jumlah: n, tingkat, jenis,
            hindari: [...hindari, ...sudah].slice(-30)
          }, 100000);
          hasil = hasil.concat(data.soal || []);
          dibuang += data.dibuang || 0;
          if (!data.diperiksa) semuaDiperiksa = false;
        }
      } catch (err) {
        galat = err;
      }
      btn.disabled = false;

      if (!hasil.length) {
        status.textContent = '❌ Gagal: ' + (galat ? galat.message : 'AI tidak menghasilkan soal. Coba lagi.');
        return;
      }

      draftCtx = { topik, fokus, materiTeks, materiId, judulGrup: topik };
      draftSoal = hasil.map(s => ({ ...s, uid: uidSeq++, pilih: !s.peringatan, level: s.level || '', loading: false }));
      const perhatian = draftSoal.filter(d => d.peringatan).length;
      status.textContent = `✅ ${draftSoal.length} soal siap diperiksa.` +
        (semuaDiperiksa ? (perhatian ? ` ⚠️ ${perhatian} soal ditandai pemeriksa AI (tidak dicentang otomatis).` : ' Pemeriksa AI tidak menemukan masalah.') : ' ⚠️ Pemeriksa AI tidak berjalan, periksa kunci dengan teliti.') +
        (dibuang ? ` (${dibuang} soal tidak valid dibuang.)` : '') +
        (galat ? ` ⚠️ Bagian berikutnya gagal: ${galat.message} Soal yang sudah berhasil tetap ditampilkan.` : '');
      renderDraft();
    }

    // ================= TAHAP 4: IMPOR SOAL GURU =================
    // Guru menempel teks (atau memilih berkas .txt/.csv). CSV berkepala standar dibaca langsung di browser
    // (tanpa AI); selain itu teks dipotong per beberapa soal lalu dirapikan AI (mode 'impor').
    // Hasilnya masuk ke draftSoal yang sama dengan generator Tahap 1.
    const IMPOR_MAKS = 40000;      // karakter total
    const IMPOR_POTONG = 4500;     // karakter per panggilan AI

    function impNorm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

    // Baca CSV (RFC 4180: tanda kutip ganda, baris baru di dalam sel). Pemisah ; , atau tab ditebak dari baris pertama.
    function impBacaCSV(teks) {
      const t = String(teks).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
      const baris1 = t.split('\n')[0] || '';
      const hit = { ';': 0, ',': 0, '\t': 0 };
      let kutip = false;
      for (const c of baris1) { if (c === '"') kutip = !kutip; else if (!kutip && c in hit) hit[c]++; }
      const sep = Object.keys(hit).sort((a, b) => hit[b] - hit[a])[0];
      if (!hit[sep]) return null;
      const rows = []; let row = [], sel = '', k = false;
      for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (k) {
          if (c === '"') { if (t[i + 1] === '"') { sel += '"'; i++; } else k = false; }
          else sel += c;
        } else if (c === '"' && sel === '') k = true;
        else if (c === sep) { row.push(sel); sel = ''; }
        else if (c === '\n') { row.push(sel); rows.push(row); row = []; sel = ''; }
        else sel += c;
      }
      if (sel !== '' || row.length) { row.push(sel); rows.push(row); }
      return rows.filter(r => r.some(x => String(x).trim() !== ''));
    }

    function impKolom(header) {
      const h = header.map(x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
      const cari = (...nama) => h.findIndex(x => nama.includes(x));
      const opsi = ['a', 'b', 'c', 'd', 'e'].map(L => cari(L, 'opsi' + L, 'pilihan' + L, 'option' + L, 'jawaban' + L));
      return {
        tanya: cari('pertanyaan', 'soal', 'butirsoal', 'question'),
        opsi,
        kunci: cari('kunci', 'kuncijawaban', 'jawaban', 'jawabanbenar', 'answer', 'key'),
        bahas: cari('pembahasan', 'penjelasan', 'explanation'),
        topik: cari('topik', 'subtopik'),
        tingkat: cari('tingkat', 'kesulitan'),
        tipe: cari('tipe', 'jenis', 'jenissoal'),
      };
    }

    function impBoolToken(x) {
      const t = String(x || '').trim().toLowerCase();
      if (['b', 'benar', 'true', 't', '1', 'ya', 'y'].includes(t)) return true;
      if (['s', 'salah', 'false', 'f', '0', 'tidak', 'n'].includes(t)) return false;
      return null;
    }

    // Mengembalikan {soal, ditolak} bila teks berupa CSV berkepala standar; selain itu null.
    function impDariCSV(teks) {
      const rows = impBacaCSV(teks);
      if (!rows || rows.length < 2) return null;
      const c = impKolom(rows[0]);
      const nOpsi = c.opsi.filter(i => i >= 0).length;
      if (c.tanya < 0 || nOpsi < 2 || c.kunci < 0) return null;

      const soal = [], ditolak = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const sel = i => (i >= 0 ? String(row[i] ?? '').trim() : '');
        const pertanyaan = sel(c.tanya);
        const cuplikan = pertanyaan.replace(/\s+/g, ' ').slice(0, 100);
        const tolak = alasan => ditolak.push({ cuplikan: cuplikan || `(baris ${r + 1})`, alasan: `Baris ${r + 1}: ${alasan}` });
        if (!pertanyaan) { tolak('pertanyaan kosong.'); continue; }

        const opsi = c.opsi.map(sel).filter(x => x !== '');
        const kRaw = sel(c.kunci);
        const tipeRaw = sel(c.tipe).toLowerCase();
        let tipe = /kompleks/.test(tipeRaw) ? 'pg_kompleks' : /^(bs|benar|b\/s)/.test(tipeRaw) || /benar.*salah/.test(tipeRaw) ? 'bs' : /^(pg|pilihan)/.test(tipeRaw) ? 'pg' : '';
        const hurufKunci = /^[A-Ea-e]{2,5}$/.test(kRaw) ? kRaw.toUpperCase().split('') : (kRaw.toUpperCase().match(/\b[A-E]\b/g) || []);
        if (!tipe) {
          const tok = kRaw.split(/[\s,;|/]+/).filter(Boolean);
          const mirip = tok.length === opsi.length && tok.length >= 2 && tok.every(x => impBoolToken(x) !== null) && tok.some(x => !/^[a-e]$/i.test(x));
          tipe = mirip ? 'bs' : new Set(hurufKunci).size >= 2 ? 'pg_kompleks' : 'pg';
        }

        let kunci, kosong = false;
        const catatan = [];
        if (tipe === 'bs') {
          if (opsi.length < 2 || opsi.length > 6) { tolak(`jumlah pernyataan ${opsi.length} (harus 2–6).`); continue; }
          const ks = kRaw.split(/[\s,;|/]+/).filter(Boolean).map(impBoolToken);
          if (ks.length === opsi.length && ks.every(x => x !== null)) kunci = ks;
          else { kunci = opsi.map(() => null); kosong = true; }
        } else {
          if (opsi.length < 3 || opsi.length > 5) { tolak(`jumlah pilihan ${opsi.length} (harus 3–5).`); continue; }
          if (tipe === 'pg') {
            const m = /^\s*\(?([A-Ea-e])(?![A-Za-z0-9])/.exec(kRaw);
            const k = m ? m[1].toUpperCase() : '';
            if (k && HURUF.indexOf(k) < opsi.length) kunci = k; else { kunci = ''; kosong = true; }
          } else {
            const ks = [...new Set(hurufKunci)].filter(x => HURUF.indexOf(x) < opsi.length).sort();
            if (ks.length) { kunci = ks; if (ks.length < 2) catatan.push('PG kompleks butuh minimal 2 jawaban benar.'); }
            else { kunci = []; kosong = true; }
          }
        }
        if (kosong) catatan.push('Kunci pada baris ini tidak terbaca. Pilih kunci sendiri.');

        const tg = sel(c.tingkat).toLowerCase();
        soal.push({
          tipe, pertanyaan, opsi, kunci,
          pembahasan: sel(c.bahas),
          topik: sel(c.topik),
          tingkat: ['mudah', 'sedang', 'sulit'].includes(tg) ? tg : 'sedang',
          level: '',
          peringatan: catatan.join(' '),
        });
      }
      return { soal, ditolak };
    }

    // Potong teks panjang menjadi bagian-bagian ≤ ~IMPOR_POTONG karakter di batas soal bernomor (nomor berurutan),
    // atau di baris kosong bila tidak ada nomor.
    function impPotong(teks, maks = IMPOR_POTONG) {
      const t = String(teks).replace(/\r\n?/g, '\n').trim();
      if (t.length <= maks + 800) return [t];
      const baris = t.split('\n');
      const hasil = []; let cur = [], len = 0, nomorTerakhir = null;
      for (let i = 0; i < baris.length; i++) {
        const l = baris[i];
        const m = /^\s*(?:soal\s*(?:no\.?\s*)?)?(\d{1,3})\s*[.)]/i.exec(l);
        const batasNomor = !!m && (nomorTerakhir === null || Number(m[1]) === nomorTerakhir + 1);
        if (batasNomor) nomorTerakhir = Number(m[1]);
        const batasKosong = !m && l.trim() === '' && baris[i + 1] !== undefined && baris[i + 1].trim() !== '';
        const boleh = nomorTerakhir !== null ? batasNomor : batasKosong;
        if (len >= maks && cur.length && (boleh || len >= maks * 2)) {
          hasil.push(cur.join('\n').trim()); cur = []; len = 0;
        }
        cur.push(l); len += l.length + 1;
      }
      if (cur.join('').trim()) hasil.push(cur.join('\n').trim());
      return hasil;
    }

    function impLaporan(ditolak) {
      const el = $id('impLaporan');
      if (!el) return;
      if (!ditolak || !ditolak.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
      el.classList.remove('hidden');
      el.innerHTML = `<details open><summary><b>⚠️ ${ditolak.length} butir tidak bisa diimpor</b> (ketik ulang atau buat manual)</summary><ul style="margin:6px 0 0 18px;">` +
        ditolak.map(x => `<li><span class="mu">${escHtml(x.cuplikan)}</span> — ${escHtml(x.alasan)}</li>`).join('') + '</ul></details>';
    }

    async function impMuatBerkas(inp) {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (/\.(docx?|xlsx?|pdf|pptx?)$/i.test(f.name)) {
        inp.value = '';
        return alert('Berkas Word/Excel/PDF belum bisa dibaca langsung.\n\n• Word/PDF: salin isinya lalu tempel di kotak.\n• Excel: pilih Simpan sebagai → CSV, lalu pilih berkas CSV-nya.');
      }
      if (f.size > 400 * 1024) { inp.value = ''; return alert('Berkas terlalu besar. Bagi menjadi beberapa berkas.'); }
      const buf = await f.arrayBuffer();
      let teks;
      try { teks = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch (e) { teks = new TextDecoder('windows-1252').decode(buf); }
      $id('impTeks').value = teks.replace(/^﻿/, '');
      if (!$id('impJudul').value.trim()) $id('impJudul').value = f.name.replace(/\.[^.]+$/, '').slice(0, 60);
      $id('impNamaBerkas').textContent = `📄 ${f.name}`;
      inp.value = '';
    }

    function impUnduhContoh() {
      unduhCSV('contoh-impor-soal.csv', [
        ['pertanyaan', 'a', 'b', 'c', 'd', 'e', 'kunci', 'pembahasan', 'topik', 'tingkat', 'tipe'],
        ['Urutan langkah untuk menyelesaikan masalah disebut ...', 'Variabel', 'Algoritma', 'Kompilator', 'Basis data', '', 'B', 'Algoritma adalah urutan langkah berhingga.', 'Algoritma', 'mudah', 'pg'],
        ['Pilih semua yang termasuk tipe data dasar.', 'Integer', 'Boolean', 'Monitor', 'String', '', 'A,B,D', '', 'Tipe data', 'sedang', 'pg_kompleks'],
        ['Tentukan benar atau salah tiap pernyataan.', 'Flowchart menggambarkan alur algoritma', 'Pseudocode harus ditulis dalam bahasa Python', 'Perulangan mengulang blok instruksi', '', '', 'B;S;B', '', 'Algoritma', 'sedang', 'bs'],
      ], { csv: true });
    }

    async function imporSoal() {
      const status = $id('aiKuisStatus');
      const btn = $id('btnImpor');
      const teks = String($id('impTeks').value || '').replace(/^﻿/, '');
      if (teks.trim().length < 20) return alert('Tempel teks soal atau pilih berkas dulu.');
      if (teks.length > IMPOR_MAKS) return alert(`Teks terlalu panjang (${teks.length.toLocaleString('id-ID')} karakter, maksimal ${IMPOR_MAKS.toLocaleString('id-ID')}). Bagi menjadi beberapa kali impor.`);
      const judul = $id('impJudul').value.trim() || 'Soal impor';

      btn.disabled = true;
      let hasil = [], ditolak = [], semuaDiperiksa = true, galat = null, lewatAI = true;
      try {
        const csv = impDariCSV(teks);
        if (csv) {
          lewatAI = false;
          hasil = csv.soal; ditolak = csv.ditolak;
        } else {
          const bagian = impPotong(teks);
          for (let b = 0; b < bagian.length; b++) {
            status.textContent = `🤖 AI sedang merapikan soal... bagian ${b + 1} dari ${bagian.length} (sekitar 20–60 detik)`;
            try {
              const data = await panggilEdge({ mode: 'impor', teks: bagian[b], topik: judul }, 110000);
              hasil = hasil.concat(data.soal || []);
              ditolak = ditolak.concat(data.ditolak || []);
              if (!data.diperiksa) semuaDiperiksa = false;
            } catch (err) {
              galat = err;
              if (bagian.length === 1) break;
              ditolak.push({ cuplikan: `Bagian ${b + 1} dari ${bagian.length}`, alasan: 'gagal dirapikan: ' + err.message });
            }
          }
        }
      } catch (err) {
        galat = err;
      }
      btn.disabled = false;
      impLaporan(ditolak);

      if (!hasil.length) {
        status.textContent = '❌ ' + (galat ? 'Gagal: ' + galat.message : 'Tidak ada soal yang bisa diimpor. Lihat daftar di bawah.');
        return;
      }

      // Tandai soal yang sudah ada di Bank Soal (atau kembar di dalam impor ini)
      const ada = new Set((bankState.kuis.items || []).map(q => impNorm(q.pertanyaan)));
      let kembar = 0;
      hasil.forEach(s => {
        const k = impNorm(s.pertanyaan);
        if (ada.has(k)) { kembar++; s.peringatan = [s.peringatan, 'Pertanyaan yang sama sudah ada di Bank Soal (atau dobel di impor ini).'].filter(Boolean).join(' '); }
        ada.add(k);
        if (!s.topik) s.topik = judul;
      });

      draftCtx = { topik: judul, fokus: '', materiTeks: '', materiId: null, judulGrup: judul, impor: true };
      draftSoal = hasil.map(s => ({ ...s, uid: uidSeq++, pilih: !s.peringatan, level: s.level || '', loading: false, impor: true }));
      const perhatian = draftSoal.filter(d => d.peringatan).length;
      status.textContent = `✅ ${draftSoal.length} soal siap diperiksa` + (lewatAI ? '' : ' (dibaca langsung dari CSV, tanpa AI)') + '.' +
        (perhatian ? ` ⚠️ ${perhatian} soal perlu dicek dan tidak dicentang otomatis.` : '') +
        (lewatAI && !semuaDiperiksa ? ' ⚠️ Pemeriksa AI tidak berjalan; cocokkan kunci sendiri.' : '') +
        (kembar ? ` (${kembar} soal kembar dengan Bank Soal.)` : '') +
        (galat ? ` ⚠️ ${galat.message}` : '');
      renderDraft();
      $id('draftArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function tesKoneksiAI() {
      const status = $id('aiKuisStatus');
      status.textContent = '🩺 Menguji koneksi ke AI...';
      const t0 = Date.now();
      try {
        const d = await panggilEdge({ mode: 'ping' }, 30000);
        status.textContent = `✅ AI merespons dalam ${(d.ms / 1000).toFixed(1)} detik (model: ${d.model}). Total bolak-balik dari perangkat ini: ${((Date.now() - t0) / 1000).toFixed(1)} detik.`;
      } catch (e) {
        status.textContent = '❌ Tes gagal: ' + e.message;
      }
    }

    function draftCardHTML(d, i) {
      if (d.loading) return `<div class="draft-card"><p class="mu">⏳ Membuat ulang soal ${i + 1}...</p></div>`;
      let opsiHTML = '';
      if (d.tipe === 'pg') {
        opsiHTML = d.opsi.map((o, k) => `
          <div class="opt-line">
            <input type="radio" name="kunci-${d.uid}" ${d.kunci === HURUF[k] ? 'checked' : ''} onchange="draftSetKunciPG(${i}, '${HURUF[k]}')" title="Tandai sebagai kunci">
            <b>${HURUF[k]}.</b>
            <input type="text" value="${escHtml(o)}" oninput="draftSetOpsi(${i}, ${k}, this.value)">
          </div>`).join('') + '<div class="mu" style="font-size:0.78rem;">Titik bulat = kunci jawaban</div>';
      } else if (d.tipe === 'pg_kompleks') {
        opsiHTML = d.opsi.map((o, k) => `
          <div class="opt-line">
            <input type="checkbox" ${d.kunci.includes(HURUF[k]) ? 'checked' : ''} onchange="draftSetKunciKompleks(${i}, '${HURUF[k]}', this.checked)" title="Tandai sebagai kunci">
            <b>${HURUF[k]}.</b>
            <input type="text" value="${escHtml(o)}" oninput="draftSetOpsi(${i}, ${k}, this.value)">
          </div>`).join('') + '<div class="mu" style="font-size:0.78rem;">Kotak centang = jawaban yang benar (minimal 2)</div>';
      } else {
        opsiHTML = d.opsi.map((o, k) => `
          <div class="opt-line">
            <b>${k + 1}.</b>
            <input type="text" value="${escHtml(o)}" oninput="draftSetOpsi(${i}, ${k}, this.value)">
            <select onchange="draftSetKunciBS(${i}, ${k}, this.value)">
              ${d.kunci[k] === null || d.kunci[k] === undefined ? '<option value="" selected>— pilih —</option>' : ''}
              <option value="B" ${d.kunci[k] === true ? 'selected' : ''}>Benar</option>
              <option value="S" ${d.kunci[k] === false ? 'selected' : ''}>Salah</option>
            </select>
            ${d.opsi.length > 2 ? `<button class="alt danger" style="padding:4px 10px;" onclick="draftBsHapus(${i}, ${k})" title="Hapus pernyataan">✕</button>` : ''}
          </div>`).join('') + (d.opsi.length < 6 ? `<button class="alt" style="padding:4px 12px; font-size:0.8rem;" onclick="draftBsTambah(${i})">+ Pernyataan</button>` : '');
      }

      return `
        <div class="draft-card ${d.pilih ? '' : 'unchecked'} ${d.peringatan ? 'warn' : ''}">
          <div class="draft-head">
            <input type="checkbox" ${d.pilih ? 'checked' : ''} onchange="draftPilih(${i}, this.checked)" title="Masukkan ke bank">
            <span class="badge">#${i + 1}</span>
            <span class="badge">${TIPE_LABEL[d.tipe]}</span>
            <select onchange="draftSet(${i}, 'tingkat', this.value)">
              ${['mudah', 'sedang', 'sulit'].map(x => `<option value="${x}" ${d.tingkat === x ? 'selected' : ''}>${x}</option>`).join('')}
            </select>
            ${d.level ? `<span class="badge">${escHtml(d.level)}</span>` : ''}
            <input type="text" value="${escHtml(d.topik)}" placeholder="topik" oninput="draftSet(${i}, 'topik', this.value)">
          </div>
          ${d.peringatan ? `<div class="draft-warn">⚠️ ${escHtml(d.peringatan)}</div>` : ''}
          <label class="mu">Pertanyaan</label>
          <textarea rows="3" oninput="draftSet(${i}, 'pertanyaan', this.value)">${escHtml(d.pertanyaan)}</textarea>
          ${opsiHTML}
          <label class="mu" style="display:block; margin-top:10px;">Pembahasan</label>
          <textarea rows="3" oninput="draftSet(${i}, 'pembahasan', this.value)">${escHtml(d.pembahasan)}</textarea>
          <div class="draft-actions">
            ${d.impor ? '' : `<button class="alt" onclick="draftUlang(${i})">🔄 Buat ulang soal ini</button>`}
            <button class="alt danger" onclick="draftBuang(${i})">🗑️ Buang</button>
          </div>
        </div>`;
    }

    function renderDraft() {
      const area = $id('draftArea');
      if (!draftSoal.length) { area.classList.add('hidden'); area.innerHTML = ''; return; }
      area.classList.remove('hidden');
      if (ktAktif !== 'buat') ktPilih('buat');   // draf (mis. dari remedial) selalu ditampilkan di sub-tab Buat Soal
      const n = draftSoal.filter(d => d.pilih).length;
      area.innerHTML = `
        <div class="draft-bar">
          <b>✏️ Review Draf (${draftSoal.length} soal)</b>
          <span class="mu" id="draftCount">${n} dicentang</span>
          <button class="alt" onclick="draftPilihSemua(true)">Centang semua</button>
          <button class="alt" onclick="draftPilihSemua(false)">Kosongkan</button>
          <button class="ok" onclick="simpanDraftTerpilih()">💾 Masukkan yang dicentang ke bank</button>
        </div>
        ${draftSoal.map((d, i) => draftCardHTML(d, i)).join('')}
        <button class="ok" onclick="simpanDraftTerpilih()">💾 Masukkan yang dicentang ke bank</button>`;
    }

    function updateDraftCount() {
      const el = $id('draftCount');
      if (el) el.textContent = draftSoal.filter(d => d.pilih).length + ' dicentang';
    }
    function draftSet(i, f, v) { draftSoal[i][f] = v; }
    function draftSetOpsi(i, k, v) { draftSoal[i].opsi[k] = v; }
    function draftSetKunciPG(i, huruf) { draftSoal[i].kunci = huruf; }
    function draftSetKunciKompleks(i, huruf, on) {
      const s = new Set(draftSoal[i].kunci);
      if (on) s.add(huruf); else s.delete(huruf);
      draftSoal[i].kunci = [...s].sort();
    }
    function draftSetKunciBS(i, k, v) { draftSoal[i].kunci[k] = v === 'B' ? true : v === 'S' ? false : null; }
    function draftBsTambah(i) { const d = draftSoal[i]; d.opsi.push(''); d.kunci.push(true); renderDraft(); }
    function draftBsHapus(i, k) { const d = draftSoal[i]; d.opsi.splice(k, 1); d.kunci.splice(k, 1); renderDraft(); }
    function draftPilih(i, on) {
      draftSoal[i].pilih = on;
      const card = document.querySelectorAll('#draftArea .draft-card')[i];
      if (card) card.classList.toggle('unchecked', !on);
      updateDraftCount();
    }
    function draftPilihSemua(on) { draftSoal.forEach(d => d.pilih = on); renderDraft(); }
    function draftBuang(i) { if (!confirm('Buang soal ini dari draf?')) return; draftSoal.splice(i, 1); renderDraft(); }

    async function draftUlang(i) {
      if (!draftCtx) return alert('Konteks generate hilang. Generate ulang dari awal.');
      const lama = draftSoal[i];
      lama.loading = true; renderDraft();
      try {
        const data = await panggilEdge({
          mode: 'soal', topik: draftCtx.topik, fokus: draftCtx.fokus, materiTeks: draftCtx.materiTeks,
          jumlah: 1, tingkat: lama.tingkat, jenis: lama.tipe,
          hindari: draftSoal.map(d => d.pertanyaan).filter(Boolean)
        });
        const s = (data.soal || [])[0];
        if (!s) throw new Error('AI tidak menghasilkan soal baru.');
        draftSoal[i] = { ...s, uid: uidSeq++, pilih: !s.peringatan, level: s.level || '', loading: false };
      } catch (err) {
        lama.loading = false;
        alert('Gagal membuat ulang: ' + err.message);
      }
      renderDraft();
    }

    function validasiDraft(d, nomor) {
      const gagal = (m) => `Soal #${nomor}: ${m}`;
      if (!String(d.pertanyaan || '').trim()) return gagal('pertanyaan masih kosong.');
      if (d.opsi.some(o => !String(o || '').trim())) return gagal('ada pilihan/pernyataan yang kosong.');
      if (d.tipe === 'pg' && !HURUF.includes(d.kunci)) return gagal('kunci belum dipilih.');
      if (d.tipe === 'pg_kompleks' && (!Array.isArray(d.kunci) || d.kunci.length < 2)) return gagal('PG kompleks minimal 2 jawaban benar (kalau hanya 1, ubah jadi pilihan ganda).');
      if (d.tipe === 'bs' && (d.opsi.length < 2 || d.kunci.length !== d.opsi.length)) return gagal('benar/salah minimal 2 pernyataan lengkap dengan kuncinya.');
      if (d.tipe === 'bs' && d.kunci.some(k => k !== true && k !== false)) return gagal('ada pernyataan yang kuncinya (Benar/Salah) belum dipilih.');
      return null;
    }

    async function simpanDraftTerpilih() {
      const terpilih = draftSoal.map((d, i) => ({ d, nomor: i + 1 })).filter(x => x.d.pilih);
      if (!terpilih.length) return alert('Centang minimal satu soal.');
      for (const { d, nomor } of terpilih) {
        const err = validasiDraft(d, nomor);
        if (err) return alert(err);
      }

      const rows = terpilih.map(({ d }) => {
        const pg = d.tipe === 'pg';
        return {
          judul: `Soal: ${draftCtx ? draftCtx.judulGrup : (d.topik || 'AI')}`,
          pertanyaan: d.pertanyaan.trim(),
          tipe: d.tipe,
          opsi: d.opsi.map(o => String(o).trim()),
          kunci: d.kunci,
          pembahasan: (d.pembahasan || '').trim() || null,
          topik: (d.topik || '').trim() || null,
          tingkat: d.tingkat,
          level_kognitif: d.level || null,
          sumber_materi_id: draftCtx && draftCtx.materiId ? String(draftCtx.materiId) : null,
          // kolom lama diisi untuk soal PG agar tetap kompatibel
          pilihan_a: pg ? d.opsi[0] : null, pilihan_b: pg ? d.opsi[1] : null, pilihan_c: pg ? d.opsi[2] : null,
          pilihan_d: pg ? d.opsi[3] : null, pilihan_e: pg ? d.opsi[4] : null,
          kunci_jawaban: pg ? d.kunci : null
        };
      });

      const { error } = await guruRPC('guru_simpan_banyak', { p_tabel: 'kuis', p_rows: rows });
      if (error) {
        return alert('Gagal menyimpan soal: ' + error.message +
          (/column|schema cache|constraint/i.test(error.message) ? '\n\nKemungkinan migrasi SQL Tahap 1 belum dijalankan di Supabase.' : ''));
      }
      alert(`${rows.length} soal masuk ke Bank Soal!`);
      draftSoal = draftSoal.filter(d => !d.pilih);
      renderDraft();
      $id('aiKuisStatus').textContent = draftSoal.length ? `✅ Tersimpan. Sisa ${draftSoal.length} soal di draf.` : '✅ Semua soal tersimpan ke Bank Soal.';
      loadBankSoalGuru();
    }

    // ================= TAHAP 2A: PAKET KUIS (sisi guru) =================
    let paketSel = [];                 // id soal di keranjang paket (berurutan)
    const paketSoalCache = {};         // id paket -> soal beku (dari RPC guru)
    const paketLihatOpen = new Set();
    let paketEditId = null;

    const JENIS_PAKET = { latihan: 'Latihan', ulangan: 'Ulangan' };
    const PEMBAHASAN_LABEL = { langsung: 'Langsung setelah kirim', setelah_tutup: 'Setelah paket ditutup', tidak: 'Tidak ditampilkan' };

    function keInputDT(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d)) return '';
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    function dariInputDT(v) {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d) ? null : d.toISOString();
    }
    function tglPendek(iso) {
      return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    function jadwalTeks(p) {
      if (!p.buka_at && !p.tutup_at) return 'tanpa jadwal';
      return `${p.buka_at ? tglPendek(p.buka_at) : 'sekarang'} → ${p.tutup_at ? tglPendek(p.tutup_at) : 'tanpa batas'}`;
    }
    function paketRingkas(p) {
      return [
        JENIS_PAKET[p.jenis] || p.jenis,
        `${p.jumlah_soal || 0} soal`,
        p.durasi_menit ? `${p.durasi_menit} menit` : 'tanpa timer',
        `maks ${p.maks_percobaan}x`
      ].join(' • ');
    }

    // ---------- Pemilih soal (keranjang) ----------
    function paketBankAktif() { return (bankState.kuis.items || []).filter(q => !q.diarsipkan); }

    function paketFilterBank() {
      const q = ($id('pkCari') ? $id('pkCari').value : '').trim().toLowerCase();
      const topik = $id('pkTopik') ? $id('pkTopik').value : '';
      const tingkat = $id('pkTingkat') ? $id('pkTingkat').value : '';
      const tipe = $id('pkTipe') ? $id('pkTipe').value : '';
      return paketBankAktif().filter(x =>
        (!q || `${x.pertanyaan || ''} ${x.topik || ''}`.toLowerCase().includes(q)) &&
        (!topik || (x.topik || '') === topik) &&
        (!tingkat || x.tingkat === tingkat) &&
        (!tipe || (x.tipe || 'pg') === tipe));
    }

    function renderPaketPicker() {
      if (!$id('pkList')) return;
      const aktif = new Set(paketBankAktif().map(x => String(x.id)));
      paketSel = paketSel.filter(id => aktif.has(id));
      const sel = $id('pkTopik');
      const cur = sel.value;
      const topik = [...new Set(paketBankAktif().map(x => x.topik).filter(Boolean))].sort();
      sel.innerHTML = '<option value="">Semua topik</option>' + topik.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
      sel.value = topik.includes(cur) ? cur : '';
      pkRenderList();
    }

    function pkRenderList() {
      const daftar = paketFilterBank();
      const set = new Set(paketSel);
      $id('pkList').innerHTML = daftar.length ? daftar.map(x => {
        const id = String(x.id);
        const t = String(x.pertanyaan || x.judul || '').replace(/\s+/g, ' ').trim();
        const meta = [TIPE_LABEL[x.tipe || 'pg'], x.topik, x.tingkat].filter(Boolean).join(' • ');
        return `<label class="pk-row"><input type="checkbox" ${set.has(id) ? 'checked' : ''} onchange="paketToggle('${id}', this.checked)"><div><div>${escHtml(t.length > 140 ? t.slice(0, 140) + '…' : t)}</div><div class="mu" style="font-size:0.75rem;">${escHtml(meta)}</div></div></label>`;
      }).join('') : '<p class="mu" style="padding:10px;">Tidak ada soal yang cocok dengan filter.</p>';
      pkUpdateCount(daftar.length);
    }

    function pkUpdateCount(tampil) {
      const el = $id('pkCount');
      if (el) el.textContent = `${paketSel.length} soal terpilih` + (tampil !== undefined ? ` • ${tampil} tampil` : '');
      keranjangUpdate();
    }

    function paketToggle(id, on) {
      id = String(id);
      const i = paketSel.indexOf(id);
      if (on && i < 0) paketSel.push(id);
      if (!on && i >= 0) paketSel.splice(i, 1);
      pkUpdateCount();
    }

    function paketPilihTampil(on) {
      paketFilterBank().forEach(x => {
        const id = String(x.id);
        const i = paketSel.indexOf(id);
        if (on && i < 0) paketSel.push(id);
        if (!on && i >= 0) paketSel.splice(i, 1);
      });
      pkRenderList();
      renderBank('kuis');
    }

    function paketKosongkan() {
      paketSel = [];
      pkRenderList();
      renderBank('kuis');
    }

    function paketAcak() {
      const n = Math.max(1, parseInt($id('pkAcakN').value) || 10);
      const daftar = paketFilterBank();
      if (!daftar.length) return alert('Tidak ada soal pada filter ini.');
      paketSel = shuffleArray(daftar).slice(0, n).map(x => String(x.id));
      pkRenderList();
      renderBank('kuis');
      $id('pkStatus').textContent = `🎲 ${paketSel.length} soal diacak dari ${daftar.length} soal yang tampil (pilihan sebelumnya diganti).`;
    }

    // ================= TAB KUIS GURU: sub-tab, mode kartu, keranjang mengambang =================
    const KT_PANE = ['buat', 'bank', 'paket'];
    let ktAktif = 'buat';

    function ktPilih(nama, simpan = true) {
      if (!KT_PANE.includes(nama)) nama = 'buat';
      ktAktif = nama;
      KT_PANE.forEach(k => {
        const pane = $id('ktPane-' + k), btn = $id('btnKt-' + k);
        if (pane) pane.classList.toggle('hidden', k !== nama);
        if (btn) btn.classList.toggle('active', k === nama);
      });
      keranjangUpdate();
      if (simpan && activeUser) sesiSimpan({ kt: nama });
    }

    function ktMode(m) {
      const imp = m === 'imp';
      $id('ktModeAI').classList.toggle('hidden', imp);
      $id('boxImpor').classList.toggle('hidden', !imp);
      $id('btnKtAI').classList.toggle('active', !imp);
      $id('btnKtImp').classList.toggle('active', imp);
    }

    // Keranjang mengambang: tampil di sub-tab Buat Soal / Bank Soal bila ada soal yang dipilih untuk paket
    function keranjangUpdate() {
      const fab = $id('keranjangFab');
      if (!fab) return;
      const n = paketSel.length;
      const tabKuisAktif = $id('tabKuis') && !$id('tabKuis').classList.contains('hidden');
      const tampil = !!(activeUser && activeUser.role === 'guru' && tabKuisAktif && ktAktif !== 'paket' && n > 0);
      fab.classList.toggle('hidden', !tampil);
      const el = $id('keranjangN'); if (el) el.textContent = n;
    }

    function keranjangBuka() {
      ktPilih('paket');
      const judul = $id('pkJudul');
      if (judul && judul.scrollIntoView) judul.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function paketTambah(id) {
      id = String(id);
      const i = paketSel.indexOf(id);
      if (i >= 0) paketSel.splice(i, 1); else paketSel.push(id);
      pkRenderList();
      renderBank('kuis');
      $id('pkStatus').textContent = `${paketSel.length} soal di keranjang paket.`;
    }

    function pkJenisChange() {
      const ul = $id('pkJenis').value === 'ulangan';
      const m = $id('pkMaks');
      if (ul) m.value = '1';
      m.disabled = ul;
    }

    // ---------- Buat paket ----------
    async function buatPaket(btn) {
      const judul = $id('pkJudul').value.trim();
      if (!judul) return alert('Isi judul paket.');
      if (!paketSel.length) return alert('Pilih minimal satu soal dari Bank Soal.');

      const jenis = $id('pkJenis').value;
      const durasiRaw = $id('pkDurasi').value.trim();
      let durasi = null;
      if (durasiRaw) {
        durasi = parseInt(durasiRaw);
        if (!(durasi > 0)) return alert('Durasi harus berupa menit lebih dari 0, atau kosongkan untuk tanpa timer.');
      }
      const buka = dariInputDT($id('pkBuka').value);
      const tutup = dariInputDT($id('pkTutup').value);
      if (buka && tutup && new Date(tutup) <= new Date(buka)) return alert('Waktu tutup harus setelah waktu buka.');
      const maks = jenis === 'ulangan' ? 1 : (parseInt($id('pkMaks').value) || 3);

      btn.disabled = true;
      const { error } = await db.rpc('guru_buat_paket', {
        p_user: activeUser.username,
        p_pass: sesiToken,
        p_judul: judul,
        p_jenis: jenis,
        p_durasi: durasi,
        p_acak_soal: $id('pkAcakSoal').value === 'ya',
        p_acak_opsi: $id('pkAcakOpsi').value === 'ya',
        p_maks: maks,
        p_buka: buka,
        p_tutup: tutup,
        p_pembahasan: $id('pkPembahasan').value,
        p_skema: $id('pkSkema').value,
        p_soal_ids: paketSel
      });
      btn.disabled = false;

      if (error) {
        if (galatSesi(error.message)) return sesiHabis();
        return alert('Gagal membuat paket: ' + error.message +
          (/function|schema cache|does not exist|relation/i.test(error.message) ? '\n\nKemungkinan SQL migrasi Tahap 2A belum dijalankan di Supabase.' : ''));
      }
      const n = paketSel.length;
      alert(`Paket "${judul}" dibuat dengan ${n} soal. Atur publish ke kelas di Daftar Paket di bawah.`);
      paketSel = [];
      $id('pkJudul').value = '';
      $id('pkDurasi').value = '';
      $id('pkBuka').value = '';
      $id('pkTutup').value = '';
      $id('pkStatus').textContent = `✅ Paket "${judul}" dibuat (${n} soal).`;
      pkRenderList();
      renderBank('kuis');
      await loadPaketGuru();
    }

    // ---------- Detail, lihat soal, pengaturan ----------
    function paketDetailHTML(p) {
      const id = String(p.id);
      let h = `<div class="pk-info">
        <div><b>Jenis:</b> ${escHtml(JENIS_PAKET[p.jenis] || p.jenis)}</div>
        <div><b>Durasi:</b> ${p.durasi_menit ? p.durasi_menit + ' menit' : 'tanpa timer'}</div>
        <div><b>Percobaan:</b> maks ${p.maks_percobaan}x${p.jenis === 'latihan' ? ' (skor terbaik dipakai)' : ''}</div>
        <div><b>Acak:</b> soal ${p.acak_soal ? 'ya' : 'tidak'}, opsi ${p.acak_opsi ? 'ya' : 'tidak'}</div>
        <div><b>Jadwal:</b> ${escHtml(jadwalTeks(p))}</div>
        <div><b>Pembahasan:</b> ${escHtml(PEMBAHASAN_LABEL[p.tampil_pembahasan] || p.tampil_pembahasan)}</div>
        <div><b>PG kompleks:</b> ${p.skema_kompleks === 'semua_atau_nol' ? 'semua-atau-nol' : 'parsial'}</div>
      </div>`;
      if (paketEditId === id) h += paketFormEditHTML(p);
      if (paketHasilOpen.has(id)) h += paketHasilHTML(id);
      if (paketAnalisisOpen.has(id)) h += paketAnalisisHTML(id);
      if (paketLihatOpen.has(id)) {
        const soal = paketSoalCache[id];
        h += soal
          ? (soal.length ? soal.map((x, i) => `<div class="pk-soal"><div class="mu" style="font-weight:700;">Soal ${i + 1}</div>${soalDetailHTML(x)}</div>`).join('') : '<p class="mu">Paket ini tidak berisi soal.</p>')
          : '<p class="mu">Memuat soal…</p>';
      }
      return h;
    }

    async function paketLihat(id) {
      id = String(id);
      if (paketLihatOpen.has(id)) {
        paketLihatOpen.delete(id);
        return renderBank('paket');
      }
      paketLihatOpen.add(id);
      renderBank('paket');
      if (!paketSoalCache[id]) {
        const { data, error } = await db.rpc('guru_detail_paket', {
          p_user: activeUser.username, p_pass: sesiToken, p_id: Number(id)
        });
        if (error) {
          if (galatSesi(error.message)) return sesiHabis();
          paketLihatOpen.delete(id);
          renderBank('paket');
          return alert('Gagal memuat soal paket: ' + error.message);
        }
        paketSoalCache[id] = data || [];
        renderBank('paket');
      }
    }

    function paketAtur(id) {
      id = String(id);
      paketEditId = paketEditId === id ? null : id;
      renderBank('paket');
    }

    function paketFormEditHTML(p) {
      const ul = p.jenis === 'ulangan';
      const pilihMaks = [...new Set([1, 2, 3, p.maks_percobaan])].sort((a, b) => a - b);
      const opt = (v, cur, t) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`;
      return `<div class="pk-edit">
        <div class="gen-grid">
          <div><label class="mu">Judul paket</label><input type="text" id="pe-judul" value="${escHtml(p.judul)}"></div>
          <div><label class="mu">Durasi (menit, kosong = tanpa timer)</label><input type="number" id="pe-durasi" min="1" value="${p.durasi_menit || ''}"></div>
          <div><label class="mu">Maks percobaan${ul ? ' (ulangan: 1x)' : ''}</label>
            <select id="pe-maks" ${ul ? 'disabled' : ''}>${pilihMaks.map(n => opt(n, p.maks_percobaan, n + 'x')).join('')}</select></div>
          <div><label class="mu">Acak urutan soal</label>
            <select id="pe-acaksoal">${opt('ya', p.acak_soal ? 'ya' : 'tidak', 'Ya')}${opt('tidak', p.acak_soal ? 'ya' : 'tidak', 'Tidak')}</select></div>
          <div><label class="mu">Acak urutan opsi</label>
            <select id="pe-acakopsi">${opt('ya', p.acak_opsi ? 'ya' : 'tidak', 'Ya')}${opt('tidak', p.acak_opsi ? 'ya' : 'tidak', 'Tidak')}</select></div>
          <div><label class="mu">Pembahasan tampil</label>
            <select id="pe-pembahasan">${Object.keys(PEMBAHASAN_LABEL).map(k => opt(k, p.tampil_pembahasan, PEMBAHASAN_LABEL[k])).join('')}</select></div>
          <div><label class="mu">Penilaian PG kompleks</label>
            <select id="pe-skema">${opt('parsial', p.skema_kompleks, 'Parsial (nilai sebagian)')}${opt('semua_atau_nol', p.skema_kompleks, 'Semua-atau-nol')}</select></div>
          <div><label class="mu">Dibuka</label><input type="datetime-local" id="pe-buka" value="${keInputDT(p.buka_at)}"></div>
          <div><label class="mu">Ditutup</label><input type="datetime-local" id="pe-tutup" value="${keInputDT(p.tutup_at)}"></div>
        </div>
        <div class="bank-actions">
          <button onclick="paketSimpanAtur('${p.id}')">💾 Simpan pengaturan</button>
          <button class="alt" onclick="paketAtur('${p.id}')">Batal</button>
        </div>
        <p class="mu" style="font-size:0.78rem;">Isi soal tidak bisa diubah setelah paket dibuat. Untuk soal berbeda, buat paket baru.</p>
      </div>`;
    }

    async function paketSimpanAtur(id) {
      const p = bankState.paket.items.find(x => String(x.id) === String(id));
      if (!p) return;
      const judul = $id('pe-judul').value.trim();
      if (!judul) return alert('Judul tidak boleh kosong.');
      const durasiRaw = $id('pe-durasi').value.trim();
      let durasi = null;
      if (durasiRaw) {
        durasi = parseInt(durasiRaw);
        if (!(durasi > 0)) return alert('Durasi harus berupa menit lebih dari 0, atau kosongkan untuk tanpa timer.');
      }
      const buka = dariInputDT($id('pe-buka').value);
      const tutup = dariInputDT($id('pe-tutup').value);
      if (buka && tutup && new Date(tutup) <= new Date(buka)) return alert('Waktu tutup harus setelah waktu buka.');

      const upd = {
        judul,
        durasi_menit: durasi,
        maks_percobaan: p.jenis === 'ulangan' ? 1 : (parseInt($id('pe-maks').value) || p.maks_percobaan),
        acak_soal: $id('pe-acaksoal').value === 'ya',
        acak_opsi: $id('pe-acakopsi').value === 'ya',
        tampil_pembahasan: $id('pe-pembahasan').value,
        skema_kompleks: $id('pe-skema').value,
        buka_at: buka,
        tutup_at: tutup
      };
      const { error } = await guruRPC('guru_simpan', { p_tabel: 'paket', p_data: upd, p_id: String(id) });
      if (error) return alert('Gagal menyimpan pengaturan: ' + error.message);
      paketEditId = null;
      await loadPaketGuru();
    }

    async function loadPaketGuru() {
      await loadBank('paket');
    }

    async function loadBankSoalGuru() {
      await loadBank('kuis');
      renderPaketPicker();
    }

    async function publishKuisMulti(kuisId, targetKelas) {
      const { error } = await guruRPC('guru_publish', { p_bank: 'kuis', p_id: String(kuisId), p_kelas: [targetKelas] });
      if (error) return alert('Gagal publish: ' + error.message);
      alert(`Kuis berhasil dipublish ke Kelas ${targetKelas}!`);
    }

