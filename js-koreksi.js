// LMS Informatika SMA — js-koreksi.js: Tab Koreksi / rekap per kelas.
// Dipecah dari index.html (2 Nov 2026), isi tidak diubah. File js-*.js dimuat berurutan oleh index.html.
    // ================= MODUL 4: REKAP PER KELAS =================
    let rekapBaris = [];

    // Ringkasan lab per siswa: satu pengumpulan TERBARU per tugas (bukan hanya pengumpulan pertama)
    function labRingkas(daftar) {
      if (!daftar.length) return null;
      const perTugas = new Map();
      daftar.forEach(k => {
        const a = perTugas.get(String(k.tugas_id));
        if (!a || String(k.dikirim_at || '') >= String(a.dikirim_at || '')) perTugas.set(String(k.tugas_id), k);
      });
      const arrK = [...perTugas.values()];
      const uji = arrK.map(kumUji).filter(Boolean);
      const pct = uji.length ? Math.round(uji.reduce((a, u) => a + (u.total ? u.lulus / u.total : 0), 0) / uji.length * 100) : null;
      return { n: arrK.length, pct, flag: arrK.filter(k => String(k.status_indikasi || '').includes('Potensi')).length };
    }

    async function renderModul4PerKelas() {
      const targetKelas = document.getElementById('filterKelasGroup').value;

      const { data: siswaList } = await ambilSiswaKelas(targetKelas);
      const tbody = document.getElementById('tbodyRekapKelas');
      rekapBaris = [];

      if (!siswaList || siswaList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="mu">Belum ada siswa terdaftar di kelas ini.</td></tr>';
        document.getElementById('statPartisipasi').textContent = '0%';
        document.getElementById('statRataRata').textContent = '0.0';
        document.getElementById('statWarning').textContent = '0';
        return;
      }

      const idKelas = siswaList.map(x => String(x.id));
      const [{ data: nilaiKuis }, { data: pengumpulan }, { data: readLogs }] = await Promise.all([
        guruBaca('nilai_kuis', 'siswa_id', idKelas),
        guruBaca('pengumpulan', 'siswa_id', idKelas),
        guruBaca('materi_read_log', 'siswa_id', idKelas)
      ]);

      // Kehadiran (H3): semester aktif bila ada; tabel kehadiran belum ada → kolom kosong saja
      let sem = (typeof hdData !== 'undefined' && hdData && hdData.semester) || null;
      const hadirMap = {};
      try {
        if (!sem && (typeof hdData === 'undefined' || !hdData)) {
          const jd = await guruRPC('guru_jadwal_data');
          if (!jd.error && jd.data) sem = jd.data.semester || null;
        }
        const rh = await guruRPC('guru_rekap_hadir', { p_kelas: targetKelas, p_dari: sem ? sem.mulai : '2000-01-01', p_sampai: sem ? sem.selesai : '2100-12-31' });
        if (!rh.error && rh.data) (rh.data.siswa || []).forEach(x => { hadirMap[String(x.id)] = x; });
      } catch (_) {}

      // Nilai paket kuis (dihitung server): rata-rata skor terbaik per paket
      let paketNilai = {}, paketGalat = '';
      try { paketNilai = (await kuisAPI('rekap_kelas', { kelas: targetKelas })).siswa || {}; }
      catch (e) { paketGalat = e.message; }

      let totalSkor = 0;
      let countSkor = 0;
      let totalWarning = 0;
      let partisipasiSelesai = 0;

      rekapBaris = [['Nama', 'Materi dibaca', 'Nilai paket kuis', 'Jumlah paket', 'Nilai soal lama', 'Lab koding (tugas / lulus uji)', 'Kehadiran %', 'Sakit', 'Izin', 'Alpa', 'Status']];
      const rowsHTML = siswaList.map(s => {
        const kuisSiswa = (nilaiKuis || []).filter(k => String(k.siswa_id) === String(s.id));
        const avgLama = kuisSiswa.length > 0 ? (kuisSiswa.reduce((a, b) => a + b.skor, 0) / kuisSiswa.length) : null;
        const baru = paketNilai[String(s.id)] || null;

        const nilaiPakai = baru ? baru.rata : avgLama;
        if (typeof nilaiPakai === 'number') { totalSkor += nilaiPakai; countSkor++; }

        const materiRead = (readLogs || []).filter(r => String(r.siswa_id) === String(s.id)).length;
        const labSiswa = labRingkas((pengumpulan || []).filter(p => String(p.siswa_id) === String(s.id)));

        if (materiRead > 0 || kuisSiswa.length > 0 || baru || labSiswa) partisipasiSelesai++;

        let badgeStatus = '<span class="badge ok">Aman</span>';
        let statusTeks = 'Aman';
        if (labSiswa && labSiswa.flag > 0) {
          badgeStatus = `<span class="badge bad">⚠️ ${labSiswa.flag} tugas perlu dicek</span>`;
          statusTeks = `${labSiswa.flag} tugas perlu dicek`;
          totalWarning++;
        }

        let selNilai;
        if (baru) selNilai = `<b>${baru.rata}</b> <span class="mu">(${baru.n} paket)</span>` + (avgLama !== null ? `<div class="mu" style="font-size:0.78rem;">soal lama: ${avgLama.toFixed(1)}</div>` : '');
        else if (avgLama !== null) selNilai = `<b>${avgLama.toFixed(1)}</b> <span class="mu">(soal lama)</span>`;
        else selNilai = '<b>Belum Kuis</b>';

        const hd = hadirMap[String(s.id)];
        const adaHadir = hd && (hd.H + hd.T + hd.S + hd.I + hd.D + hd.A) > 0;
        const hadirRendah = adaHadir && hd.persen !== null && hd.persen < 80;
        if (hadirRendah) {
          const b = `<span class="badge warn">📅 Kehadiran ${hd.persen}%</span>`;
          badgeStatus = statusTeks === 'Aman' ? b : badgeStatus + ' ' + b;
          statusTeks = statusTeks === 'Aman' ? `Kehadiran ${hd.persen}%` : `${statusTeks}; kehadiran ${hd.persen}%`;
        }
        const selHadir = adaHadir
          ? `<b class="${hadirRendah ? 'hd-rendah' : ''}">${hd.persen === null ? '-' : hd.persen + '%'}</b>` +
            `<div class="mu" style="font-size:0.78rem;">${['S', 'I', 'A'].filter(k => hd[k]).map(k => `${k} ${hd[k]}`).join(' • ') || 'tanpa absen'}${hd.T ? ` • T ${hd.T}` : ''}</div>`
          : '<span class="mu">Belum ada absen</span>';

        const labTeks = labSiswa ? `${labSiswa.n} tugas` + (labSiswa.pct !== null ? ` • lulus uji ${labSiswa.pct}%` : '') : '';
        rekapBaris.push([s.nama, materiRead, baru ? baru.rata : '', baru ? baru.n : 0, avgLama !== null ? avgLama.toFixed(1) : '', labTeks,
          adaHadir && hd.persen !== null ? hd.persen : '', adaHadir ? hd.S : '', adaHadir ? hd.I : '', adaHadir ? hd.A : '', statusTeks]);

        return `
          <tr>
            <td><b>${escHtml(s.nama)}</b></td>
            <td><span class="badge ok">✅ ${materiRead} Materi Dibaca</span></td>
            <td>${selNilai}</td>
            <td>${labSiswa ? escHtml(labTeks) : '<span class="mu">Belum Mengumpulkan</span>'}</td>
            <td>${selHadir}</td>
            <td>${badgeStatus}</td>
          </tr>
        `;
      }).join('');

      tbody.innerHTML = (paketGalat ? `<tr><td colspan="6" class="mu">⚠️ Nilai paket kuis belum bisa dimuat: ${escHtml(paketGalat)}</td></tr>` : '') + rowsHTML;

      const pctPartisipasi = Math.round((partisipasiSelesai / siswaList.length) * 100);
      const avgKelas = countSkor > 0 ? (totalSkor / countSkor).toFixed(1) : '0.0';

      document.getElementById('statPartisipasi').textContent = `${pctPartisipasi}%`;
      document.getElementById('statRataRata').textContent = avgKelas;
      document.getElementById('statWarning').textContent = totalWarning;
    }

    function exportKeExcel() {
      if (rekapBaris.length < 2) return alert('Belum ada data. Pilih kelas yang sudah memiliki siswa.');
      const kelas = document.getElementById('filterKelasGroup').value || 'kelas';
      unduhCSV(`rekap_${kelas}.csv`, rekapBaris);
    }
