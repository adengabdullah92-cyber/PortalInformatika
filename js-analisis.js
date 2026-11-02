// LMS Informatika SMA — js-analisis.js: Analisis butir, remedial, hasil paket (guru).
// Dipecah dari index.html (2 Nov 2026), isi tidak diubah. File js-*.js dimuat berurutan oleh index.html.
    // ================= TAHAP 3: ANALISIS BUTIR SOAL & REMEDIAL (guru) =================
    const paketAnalisisOpen = new Set();
    const paketAnalisisCache = {};
    const paketAnalisisParam = {};

    function anParam(id) { return paketAnalisisParam[id] || (paketAnalisisParam[id] = { kelas: '', percobaan: 'pertama', ambang: 70 }); }

    async function paketAnalisis(id) {
      id = String(id);
      if (paketAnalisisOpen.has(id)) { paketAnalisisOpen.delete(id); return renderBank('paket'); }
      paketAnalisisOpen.add(id);
      await muatAnalisis(id);
    }

    async function muatAnalisis(id) {
      id = String(id);
      delete paketAnalisisCache[id];
      renderBank('paket');
      const p = anParam(id);
      try {
        paketAnalisisCache[id] = await kuisAPI('analisis', { paket_id: Number(id), kelas: p.kelas, percobaan: p.percobaan, ambang: p.ambang }, { timeout: 45000 });
      } catch (e) {
        paketAnalisisOpen.delete(id);
        alert('Gagal memuat analisis: ' + e.message + (/Aksi tidak dikenal/.test(e.message) ? '\n\nDeploy dulu Edge Function kuis-siswa versi terbaru.' : ''));
      }
      renderBank('paket');
    }

    function anTerapkan(id) {
      const p = anParam(id);
      p.kelas = $id('an-kelas-' + id).value;
      p.percobaan = $id('an-perc-' + id).value;
      const a = Number($id('an-ambang-' + id).value);
      p.ambang = isFinite(a) && a > 0 && a <= 100 ? a : 70;
      muatAnalisis(id);
    }

    const AN_KESULITAN = { sulit: ['bad', 'Sulit'], sedang: ['ok', 'Sedang'], mudah: ['warn', 'Mudah'] };
    const AN_DAYA = { 'sangat baik': 'ok', baik: 'ok', cukup: 'warn', rendah: 'bad', negatif: 'bad' };
    const pctTeks = (x) => (x === null || x === undefined ? '-' : Math.round(x * 100) + '%');

    function paketAnalisisHTML(id) {
      const a = paketAnalisisCache[id];
      if (!a) return '<p class="mu">Memuat analisis…</p>';
      const p = anParam(id);
      const r = a.ringkas || {};
      const opt = (v, cur, t) => `<option value="${escHtml(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${escHtml(t)}</option>`;
      let h = `<div class="an-panel">
        <div class="an-kontrol">
          <div><label class="mu">Kelas</label><select id="an-kelas-${id}">${opt('', a.kelas_dipilih, 'Semua kelas')}${(a.kelas_tersedia || []).map(k => opt(k, a.kelas_dipilih, k)).join('')}</select></div>
          <div><label class="mu">Data yang dianalisis</label><select id="an-perc-${id}">${opt('pertama', p.percobaan, 'Percobaan pertama (kemampuan awal)')}${opt('terbaik', p.percobaan, 'Percobaan terbaik')}</select></div>
          <div><label class="mu">Ambang remedial (skor/% )</label><input type="number" id="an-ambang-${id}" min="1" max="100" value="${escHtml(p.ambang)}"></div>
          <button class="alt" onclick="anTerapkan('${id}')">🔄 Terapkan</button>
        </div>`;
      if (!r.peserta) {
        return h + `<p class="mu">Belum ada siswa yang menyelesaikan paket ini${r.dikecualikan ? ` (${r.dikecualikan} percobaan lama tidak punya rincian jawaban dan tidak bisa dianalisis)` : ''}.</p></div>`;
      }
      h += `<div class="ks-badges">
          <span class="badge">${r.peserta} siswa dianalisis</span>
          <span class="badge ok">Rata-rata skor ${r.rata}</span>
          <span class="badge">Tertinggi ${r.tertinggi} • Terendah ${r.terendah}</span>
          <span class="badge ${r.perlu_remedial ? 'warn' : 'ok'}">${r.perlu_remedial} siswa di bawah ${a.ambang}</span>
        </div>`;
      if (r.dikecualikan) h += `<p class="mu">${r.dikecualikan} percobaan lama tidak punya rincian jawaban, jadi tidak ikut dianalisis.</p>`;
      if (!r.daya_beda_aktif) h += '<p class="mu">ℹ️ Daya beda baru dihitung bila ada minimal 10 siswa; sebelum itu hanya tingkat kesulitan dan sebaran jawaban yang tampil.</p>';

      // ---- topik ----
      h += '<h4 style="margin:14px 0 6px;">📚 Penguasaan per topik</h4>';
      h += (a.topik || []).map((t, i) => {
        const kelasBar = t.p === null ? '' : t.perlu_remedial ? 'bad' : t.p * 100 < a.ambang + 10 ? 'warn' : '';
        const idxRek = (a.rekomendasi || []).findIndex(x => x.topik === t.nama);
        return `<div class="an-topik">
          <div class="an-topik-baris"><b>${escHtml(t.nama)}</b><span class="mu">${t.butir} soal</span><span>${pctTeks(t.p)}</span>
            ${t.perlu_remedial ? '<span class="badge warn">Perlu remedial</span>' : ''}
            ${idxRek >= 0 ? `<button class="alt" onclick="analisisRemedialTopik('${id}', ${idxRek})">🛟 Buat soal remedial (AI)</button>` : ''}</div>
          <div class="an-bar"><i class="${kelasBar}" style="width:${Math.round((t.p || 0) * 100)}%"></i></div>
        </div>`;
      }).join('');

      // ---- butir ----
      const butir = (a.butir || []).slice().sort((x, y) => (x.p ?? 2) - (y.p ?? 2));
      h += '<h4 style="margin:14px 0 6px;">🔬 Analisis tiap soal (terurut dari yang paling sulit)</h4>';
      h += butir.map(b => {
        const kes = AN_KESULITAN[b.kesulitan] || ['', '-'];
        let isi = '';
        if (b.tipe === 'bs') {
          isi = (b.pernyataan || []).map((x, k) => `<div class="an-opsi"><span class="an-teks">${k + 1}. ${escHtml(x.teks)} <span class="mu">(kunci: ${x.kunci ? 'Benar' : 'Salah'})</span></span>
            <div class="an-bar"><i class="${(x.pct_benar ?? 0) < 0.5 ? 'bad' : ''}" style="width:${Math.round((x.pct_benar || 0) * 100)}%"></i></div><span class="mu">${pctTeks(x.pct_benar)} menjawab benar</span></div>`).join('');
        } else {
          isi = (b.sebaran || []).map(x => `<div class="an-opsi ${b.pengecoh && b.pengecoh.i === x.i ? 'pengecoh' : ''}">
            <span class="an-teks"><b>${HURUF[x.i] || x.i + 1}.</b> ${escHtml(x.teks)} ${x.kunci ? '<span class="badge ok">kunci</span>' : ''}${b.pengecoh && b.pengecoh.i === x.i ? ' <span class="badge warn">pengecoh terpopuler</span>' : ''}</span>
            <div class="an-bar"><i class="${x.kunci ? '' : 'bad'}" style="width:${Math.round(x.pct * 100)}%"></i></div><span class="mu">${x.n} siswa (${pctTeks(x.pct)})</span></div>`).join('') +
            (b.kosong ? `<div class="mu">${b.kosong} siswa tidak menjawab.</div>` : '');
        }
        return `<details class="an-butir">
          <summary><b>No ${b.no}</b> ${escHtml(TIPE_LABEL[b.tipe] || b.tipe)} • ${escHtml(b.topik || '(tanpa topik)')}
            <span class="badge ${kes[0]}">${kes[1]} ${pctTeks(b.p)}</span>
            ${b.daya_beda !== null ? `<span class="badge ${AN_DAYA[b.daya_kategori] || ''}">Daya beda ${b.daya_beda} (${escHtml(b.daya_kategori)})</span>` : ''}
            ${b.flags.length ? `<span class="badge warn">⚠️ ${b.flags.length} catatan</span>` : ''}
            <div class="mu" style="margin-top:4px;">${escHtml((b.pertanyaan || '').slice(0, 110))}${(b.pertanyaan || '').length > 110 ? '…' : ''}</div></summary>
          <div class="an-isi">
            <div class="soal-teks">${escHtml(b.pertanyaan)}</div>
            ${isi}
            ${b.flags.map(f => `<div class="an-flag">⚠️ ${escHtml(f)}</div>`).join('')}
            <div class="ks-aksi"><button class="alt" onclick="analisisRemedialSoal('${id}', ${b.no})">🛟 Buat soal serupa (AI)</button></div>
          </div></details>`;
      }).join('');

      // ---- siswa ----
      const sis = (a.siswa || []).filter(x => x.perlu_remedial);
      h += `<h4 style="margin:14px 0 6px;">🧑‍🎓 Siswa yang perlu remedial (skor &lt; ${escHtml(a.ambang)})</h4>`;
      h += sis.length
        ? `<div class="tbl-scroll"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Skor</th><th>Topik yang lemah</th></tr></thead><tbody>${sis.map(x =>
            `<tr><td>${escHtml(x.nama)}</td><td>${escHtml(x.kelas)}</td><td><b>${x.skor}</b></td><td>${x.topik_lemah.length ? x.topik_lemah.map(t => `<span class="badge warn">${escHtml(t)}</span>`).join(' ') : '<span class="mu">-</span>'}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="mu">Tidak ada siswa di bawah ambang. 🎉</p>';

      h += `<div class="bank-actions" style="margin-top:12px;">
        <button class="alt" onclick="unduhAnalisisButir('${id}')">📥 Excel analisis soal</button>
        <button class="alt" onclick="unduhAnalisisSiswa('${id}')">📥 Excel siswa remedial</button></div></div>`;
      return h;
    }

    function unduhAnalisisButir(id) {
      const a = paketAnalisisCache[id]; if (!a || !a.butir) return;
      const baris = [['No', 'Jenis', 'Topik', 'Tingkat', 'Peserta', 'Tingkat kesulitan (% benar)', 'Kategori', 'Daya beda', 'Kategori daya beda', 'Pengecoh terpopuler', 'Catatan']];
      a.butir.forEach(b => baris.push([b.no, TIPE_LABEL[b.tipe] || b.tipe, b.topik, b.tingkat, b.n, b.p === null ? '' : Math.round(b.p * 100), b.kesulitan || '', b.daya_beda ?? '', b.daya_kategori || '', b.pengecoh ? b.pengecoh.teks : '', b.flags.join(' | ')]));
      unduhCSV('analisis_soal_' + (a.paket.judul || 'paket').replace(/[^\w-]+/g, '_') + '.csv', baris);
    }
    function unduhAnalisisSiswa(id) {
      const a = paketAnalisisCache[id]; if (!a || !a.siswa) return;
      const baris = [['Nama', 'Kelas', 'Skor', 'Perlu remedial', 'Topik lemah']];
      a.siswa.forEach(s => baris.push([s.nama, s.kelas, s.skor, s.perlu_remedial ? 'Ya' : 'Tidak', s.topik_lemah.join(' | ')]));
      unduhCSV('siswa_remedial_' + (a.paket.judul || 'paket').replace(/[^\w-]+/g, '_') + '.csv', baris);
    }

    // ---- remedial: isi generator soal (Tahap 1) lalu langsung jalankan ----
    function anBersih(t, n) { return String(t || '').replace(/["\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }

    function isiGeneratorRemedial(o) {
      const materi = o.materiId ? (bankState.materi.items || []).find(m => String(m.id) === String(o.materiId) && !m.diarsipkan) : null;
      isiPilihanMateriAI();
      if (materi) { $id('aiSumber').value = 'materi'; aiSumberChange(); $id('aiMateri').value = String(materi.id); }
      else { $id('aiSumber').value = 'topik'; aiSumberChange(); $id('aiTopik').value = o.topik; }
      $id('aiFokus').value = o.fokus;
      $id('aiJumlah').value = '5';
      $id('aiTingkat').value = 'sedang';
      $id('aiJenis').value = 'pg';
      const box = $id('aiSumber').closest('.card') || $id('aiSumber');
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      generateSoalAI();
    }

    function analisisRemedialTopik(id, idx) {
      const a = paketAnalisisCache[id]; const rek = a && a.rekomendasi && a.rekomendasi[idx];
      if (!rek) return;
      const contoh = rek.contoh.map(c => `soal "${anBersih(c.pertanyaan, 120)}"${c.pengecoh ? ` (siswa sering memilih: ${anBersih(c.pengecoh, 80)})` : ''}`).join('; ');
      const nama = rek.topik === '(tanpa topik)' ? a.paket.judul : rek.topik;
      isiGeneratorRemedial({
        topik: nama, materiId: rek.materi_id,
        fokus: anBersih(`Remedial untuk siswa yang belum paham. Banyak yang keliru pada ${contoh}. Buat soal BARU (bukan salinan) yang menguji konsep yang sama dan memakai pengecoh yang mirip dengan kesalahan tersebut.`, 600)
      });
    }

    function analisisRemedialSoal(id, no) {
      const a = paketAnalisisCache[id]; const b = a && a.butir.find(x => x.no === no);
      if (!b) return;
      const nama = b.topik || a.paket.judul;
      isiGeneratorRemedial({
        topik: nama, materiId: b.materi_id,
        fokus: anBersih(`Remedial untuk soal "${anBersih(b.pertanyaan, 150)}"${b.pengecoh ? ` yang sering dijawab keliru dengan: ${anBersih(b.pengecoh.teks, 80)}` : ''}. Buat soal BARU yang menguji konsep yang sama dari sudut pandang berbeda.`, 600)
      });
    }

    // ================= TAHAP 2B: HASIL PAKET (sisi guru) =================
    const paketHasilOpen = new Set();
    const paketHasilCache = {};

    async function paketHasil(id) {
      id = String(id);
      if (paketHasilOpen.has(id)) { paketHasilOpen.delete(id); return renderBank('paket'); }
      paketHasilOpen.add(id);
      renderBank('paket');
      await muatHasilPaket(id);
    }

    async function muatHasilPaket(id) {
      id = String(id);
      delete paketHasilCache[id];
      renderBank('paket');
      try {
        paketHasilCache[id] = await kuisAPI('rekap', { paket_id: Number(id) });
      } catch (e) {
        paketHasilOpen.delete(id);
        alert('Gagal memuat hasil: ' + e.message);
      }
      renderBank('paket');
    }

    function paketHasilHTML(id) {
      const h = paketHasilCache[String(id)];
      if (!h) return '<p class="mu">Memuat hasil…</p>';
      let out = `<div class="bank-actions">
          <button class="alt" onclick="muatHasilPaket('${id}')">🔄 Muat ulang</button>
          <button class="alt" onclick="unduhHasilPaket('${id}')">📥 Unduh Excel</button>
        </div>`;
      if (!h.kelas.length) return out + '<p class="mu">Paket ini belum dipublish ke kelas mana pun.</p>';
      out += h.kelas.map(k => `
        <div class="hs-kelas">
          <div><b>${escHtml(k.kelas)}</b> <span class="mu">— ${k.sudah}/${k.jumlah} siswa sudah mengerjakan • rata-rata skor terbaik: ${k.rata === null ? '-' : k.rata}</span></div>
          <div class="tbl-scroll"><table>
            <thead><tr><th>Nama</th><th>Skor terbaik</th><th>Percobaan</th><th>Status</th><th></th></tr></thead>
            <tbody>${k.siswa.map(s => `
              <tr>
                <td>${escHtml(s.nama)}</td>
                <td><b>${s.skor_terbaik === null ? '-' : s.skor_terbaik}</b></td>
                <td>${s.percobaan.length ? s.percobaan.map(x => `${x.ke}: ${x.skor}${x.terlambat ? '⏰' : ''}`).join(' • ') : '<span class="mu">-</span>'}</td>
                <td>${s.aktif ? '<span class="badge warn">Sedang mengerjakan</span>' : s.selesai ? '<span class="badge ok">Selesai</span>' : '<span class="badge">Belum</span>'}</td>
                <td>${s.jumlah_percobaan ? `<button class="alt danger" onclick="paketResetSiswa('${id}', '${s.id}', this.dataset.nama)" data-nama="${escHtml(s.nama)}">Reset</button>` : ''}</td>
              </tr>`).join('')}
            </tbody></table></div>
        </div>`).join('');
      return out;
    }

    async function paketResetSiswa(paketId, siswaId, nama) {
      if (!confirm(`Reset SEMUA percobaan ${nama} di paket ini?\n\nSkor dan jawabannya dihapus, dan ia bisa mengerjakan dari awal. Tidak bisa dibatalkan.`)) return;
      try {
        await kuisAPI('reset', { paket_id: Number(paketId), siswa_id: String(siswaId) });
        await muatHasilPaket(paketId);
      } catch (e) { alert('Gagal reset: ' + e.message); }
    }

    function unduhHasilPaket(id) {
      const h = paketHasilCache[String(id)];
      if (!h || !h.kelas.length) return alert('Belum ada data untuk diunduh.');
      const baris = [['Kelas', 'Nama', 'Skor terbaik', 'Jumlah percobaan selesai', 'Detail percobaan', 'Status']];
      h.kelas.forEach(k => k.siswa.forEach(s => baris.push([
        k.kelas, s.nama, s.skor_terbaik === null ? '' : s.skor_terbaik, s.selesai,
        s.percobaan.map(x => `${x.ke}:${x.skor}`).join(' | '),
        s.aktif ? 'Sedang mengerjakan' : s.selesai ? 'Selesai' : 'Belum'
      ])));
      unduhCSV('hasil_' + (h.paket.judul || 'paket').replace(/[^\w-]+/g, '_') + '.csv', baris);
    }

    // CSV dengan pemisah titik koma + BOM (terbaca benar di Excel berlokal Indonesia & Google Sheets)
    // Semua unduhan kini berbentuk Excel (.xlsx). CSV hanya bila opsi.csv (mis. contoh format impor soal)
    // atau bila pustaka Excel gagal dimuat (cadangan).
    function unduhCSV(namaFile, baris, opsi = {}) {
      if (!opsi.csv && typeof unduhExcel === 'function') {
        unduhExcel(namaFile, baris, opsi).catch(e => {
          console.warn('Excel gagal, beralih ke CSV:', e);
          alert('File Excel gagal dibuat (' + (e.message || e) + '). Diunduh sebagai CSV, tetap bisa dibuka di Excel.');
          unduhCSV(namaFile, baris, { ...opsi, csv: true });
        });
        return;
      }
      const esc = v => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const isi = '\ufeff' + baris.map(r => r.map(esc).join(';')).join('\r\n');
      const blob = new Blob([isi], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = namaFile;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

