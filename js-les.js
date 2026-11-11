// LMS Informatika SMA — js-les.js: buku catatan LES PRIVAT Matematika (khusus guru, terpisah dari data sekolah).
// Murid & jadwal, catat sesi terlaksana (1 jam / 1,5 jam / 1 sesi), rekap bulanan per murid (pertemuan ke- & fee),
// unduh Excel, kirim rekap lewat WhatsApp, tarif & teks pengingat. Server: les_l1.sql (RPC guru_les_*).
// Pengingat pagi 08.00 & pencatatan setelah les lewat bot Telegram (telegram.ts).

    const LES_JENIS = { jam1: '1 jam', jam15: '1,5 jam', sesi: '1 sesi' };
    const LES_HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const LES_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const lesState = { data: null, bulan: null, rekap: null, editSesi: null, editMurid: null, siap: false };

    const lesRp = n => 'Rp' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const lesHariIni = () => (typeof hdTanggalHariIni === 'function' ? hdTanggalHariIni() : new Date().toISOString().slice(0, 10));
    const lesIsodow = iso => ((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
    function lesTgl(iso) { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${LES_HARI[lesIsodow(String(iso).slice(0, 10))]}, ${d} ${LES_BULAN[m - 1]} ${y}`; }
    function lesTglPendek(iso) { const [, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${LES_HARI[lesIsodow(String(iso).slice(0, 10))].slice(0, 3)} ${d} ${LES_BULAN[m - 1].slice(0, 3)}`; }
    function lesNamaBulan(iso) { const [y, m] = String(iso).split('-').map(Number); return `${LES_BULAN[m - 1]} ${y}`; }
    function lesNomorWA(no) {
      let d = String(no || '').replace(/\D/g, '');
      if (!d) return null;
      if (d.startsWith('0')) d = '62' + d.slice(1); else if (d.startsWith('8')) d = '62' + d;
      return d.length >= 10 && d.length <= 15 ? d : null;
    }
    function lesFee(jenis) {
      const s = (lesState.data && lesState.data.setelan) || {};
      const jam = Number(s.tarif_jam ?? 120000), sesi = Number(s.tarif_sesi ?? 180000);
      return jenis === 'jam1' ? jam : jenis === 'jam15' ? Math.round(jam * 1.5) : sesi;
    }

    function lesInit() {
      if (!activeUser || activeUser.role !== 'guru') return;
      const nav = $id('navLes'); if (nav) nav.classList.remove('hidden');
    }

    async function lesTabDibuka() {
      if (!lesState.bulan) lesState.bulan = lesHariIni().slice(0, 7) + '-01';
      if (!lesState.siap) await lesMuatSemua();
    }

    async function lesMuatSemua() {
      $id('lesRekap').innerHTML = '<p class="mu">Memuat…</p>';
      const r = await guruRPC('guru_les_data');
      if (r.error) {
        $id('lesRekap').innerHTML = `<p class="hd-rendah">Gagal memuat data les: ${escHtml(r.error.message)}${/function|does not exist|schema/i.test(r.error.message) ? ' — jalankan <b>les_l1.sql</b> di Supabase.' : ''}</p>`;
        return;
      }
      lesState.data = r.data || { murid: [], setelan: {} };
      lesState.siap = true;
      lesRenderSetelan();
      lesRenderMurid();
      lesIsiFormSesi();
      await lesMuatRekap();
    }

    async function lesMuatRekap() {
      $id('lesBulanJudul').textContent = lesNamaBulan(lesState.bulan);
      const r = await guruRPC('guru_les_rekap', { p_bulan: lesState.bulan });
      if (r.error) { $id('lesRekap').innerHTML = `<p class="hd-rendah">Gagal memuat rekap: ${escHtml(r.error.message)}</p>`; return; }
      lesState.rekap = r.data;
      lesRenderRekap();
    }

    function lesGeserBulan(arah) {
      const [y, m] = lesState.bulan.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 + arah, 1));
      lesState.bulan = d.toISOString().slice(0, 7) + '-01';
      lesMuatRekap();
    }

    // ---------- Rekap bulanan ----------
    function lesRenderRekap() {
      const r = lesState.rekap || { murid: [] };
      $id('lesTotal').innerHTML = `<b>${r.total_pertemuan || 0}</b> pertemuan · <b>${lesRp(r.total_fee)}</b>`;
      const murid = (r.murid || []).filter(m => Number(m.jumlah) > 0 || m.aktif);
      if (!murid.length) {
        $id('lesRekap').innerHTML = '<div class="card"><p class="mu">Belum ada murid les. Tambahkan di bagian <b>👥 Murid & jadwal</b> di bawah.</p></div>';
        return;
      }
      $id('lesRekap').innerHTML = murid.map(m => {
        const baris = (m.sesi || []).map(s => `
          <tr>
            <td class="les-ke">${s.ke}</td>
            <td>${escHtml(lesTglPendek(s.tanggal))}</td>
            <td>${escHtml(s.jam_mulai)}${s.jam_selesai ? '–' + escHtml(s.jam_selesai) : ''}</td>
            <td>${escHtml(s.label)}</td>
            <td class="les-fee">${lesRp(s.fee)}</td>
            <td class="les-ket">${escHtml(s.keterangan || '')}</td>
            <td class="les-aksi"><button class="alt" title="Ubah" onclick="lesUbahSesi(${Number(s.id)})">✏️</button><button class="alt" title="Hapus" onclick="lesHapusSesi(${Number(s.id)})">🗑</button></td>
          </tr>`).join('');
        const wa = lesNomorWA(m.wa);
        return `<div class="card les-murid">
          <div class="les-murid-head">
            <h3>${escHtml(m.nama)}${m.aktif ? '' : ' <span class="badge">nonaktif</span>'}</h3>
            <span><b>${m.jumlah}</b> pertemuan · <b>${lesRp(m.total)}</b></span>
          </div>
          ${m.sesi && m.sesi.length ? `<div class="tbl-scroll"><table class="les-tabel">
            <thead><tr><th>Ke</th><th>Tanggal</th><th>Jam</th><th>Jenis</th><th>Fee</th><th>Keterangan</th><th></th></tr></thead>
            <tbody>${baris}</tbody></table></div>` : '<p class="mu">Belum ada sesi bulan ini.</p>'}
          <div class="les-murid-aksi">
            <button class="alt" onclick="lesCatatUntuk(${Number(m.murid_id)})">＋ Catat sesi</button>
            ${m.sesi && m.sesi.length ? `${wa ? `<a class="btn-link" href="https://wa.me/${wa}?text=${encodeURIComponent(lesTeksRekap(m))}" target="_blank" rel="noopener">📲 Kirim rekap via WA</a>` : ''}
              <button class="alt" onclick="lesSalinRekap(${Number(m.murid_id)})">📋 Salin rekap</button>` : ''}
          </div>
        </div>`;
      }).join('');
    }

    function lesTeksRekap(m) {
      const baris = [`Rekap les Matematika ${m.nama} — ${lesNamaBulan(lesState.bulan)}`, ''];
      (m.sesi || []).forEach(s => baris.push(`${s.ke}. ${lesTgl(s.tanggal)} · ${s.jam_mulai}${s.jam_selesai ? '–' + s.jam_selesai : ''} · ${s.label} · ${lesRp(s.fee)}`));
      baris.push('', `Total: ${m.jumlah} pertemuan · ${lesRp(m.total)}`, '', 'Terima kasih.');
      return baris.join('\n');
    }

    async function lesSalinRekap(muridId) {
      const m = ((lesState.rekap || {}).murid || []).find(x => Number(x.murid_id) === Number(muridId));
      if (!m) return;
      const teks = lesTeksRekap(m);
      try { await navigator.clipboard.writeText(teks); alert('Rekap disalin. Tempel di WhatsApp/email.'); }
      catch (_) { prompt('Salin teks rekap ini:', teks); }
    }

    async function lesUnduhExcel() {
      const r = lesState.rekap;
      if (!r) return;
      const baris = [[`Rekap Les Matematika — ${lesNamaBulan(lesState.bulan)}`],
        [`Total: ${r.total_pertemuan || 0} pertemuan · ${lesRp(r.total_fee)}`], [],
        ['Murid', 'Ke', 'Tanggal', 'Jam', 'Jenis', 'Fee (Rp)', 'Keterangan']];
      (r.murid || []).forEach(m => (m.sesi || []).forEach(s => baris.push([m.nama, s.ke, lesTgl(s.tanggal),
        `${s.jam_mulai}${s.jam_selesai ? '–' + s.jam_selesai : ''}`, s.label, Number(s.fee), s.keterangan || ''])));
      baris.push([]);
      baris.push(['Ringkasan per murid']);
      (r.murid || []).filter(m => Number(m.jumlah) > 0).forEach(m => baris.push([`${m.nama}: ${m.jumlah} pertemuan · ${lesRp(m.total)}`]));
      try { await unduhExcel('Rekap_Les_' + lesState.bulan.slice(0, 7), baris, { sheet: 'Rekap les', header: 3 }); }
      catch (e) { alert('Gagal membuat Excel: ' + (e.message || e)); }
    }

    // ---------- Catat / ubah sesi ----------
    function lesMuridAktif() { return ((lesState.data || {}).murid || []).filter(m => m.aktif); }

    function lesIsiFormSesi(sesi) {
      const pilih = $id('lesSesiMurid');
      const daftar = sesi ? ((lesState.data || {}).murid || []) : lesMuridAktif();
      pilih.innerHTML = daftar.length ? daftar.map(m => `<option value="${Number(m.id)}">${escHtml(m.nama)}</option>`).join('')
        : '<option value="">(tambahkan murid dulu)</option>';
      lesState.editSesi = sesi ? Number(sesi.id) : null;
      $id('lesSesiJudul').textContent = sesi ? '✏️ Ubah sesi' : '✍️ Catat sesi les';
      $id('lesSesiBatal').classList.toggle('hidden', !sesi);
      if (sesi) {
        pilih.value = String(sesi.murid_id);
        $id('lesSesiTanggal').value = String(sesi.tanggal).slice(0, 10);
        $id('lesSesiMulai').value = sesi.jam_mulai || '';
        $id('lesSesiSelesai').value = sesi.jam_selesai || '';
        $id('lesSesiJenis').value = sesi.jenis;
        $id('lesSesiKet').value = sesi.keterangan || '';
      } else {
        $id('lesSesiTanggal').value = lesHariIni();
        $id('lesSesiKet').value = '';
        lesSesiOtomatis();
      }
      lesSesiInfoFee();
    }

    // Isi jam & jenis dari jadwal murid pada hari yang dipilih
    function lesSesiOtomatis() {
      if (lesState.editSesi) return lesSesiInfoFee();
      const m = ((lesState.data || {}).murid || []).find(x => String(x.id) === $id('lesSesiMurid').value);
      if (!m) return;
      const tgl = $id('lesSesiTanggal').value;
      const j = tgl ? (m.jadwal || []).find(x => Number(x.hari) === lesIsodow(tgl)) : null;
      $id('lesSesiMulai').value = j ? j.jam_mulai : '';
      $id('lesSesiSelesai').value = j ? j.jam_selesai : '';
      $id('lesSesiJenis').value = m.jenis_default || 'sesi';
      lesSesiInfoFee();
    }

    function lesSesiInfoFee() {
      const j = $id('lesSesiJenis').value;
      $id('lesSesiFee').textContent = lesState.editSesi ? '' : `Fee: ${lesRp(lesFee(j))}`;
    }

    function lesCatatUntuk(muridId) {
      lesIsiFormSesi();
      $id('lesSesiMurid').value = String(muridId);
      lesSesiOtomatis();
      $id('lesSesiCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function lesUbahSesi(id) {
      let s = null, muridId = null;
      ((lesState.rekap || {}).murid || []).forEach(m => (m.sesi || []).forEach(x => { if (Number(x.id) === Number(id)) { s = x; muridId = m.murid_id; } }));
      if (!s) return;
      lesIsiFormSesi({ ...s, murid_id: muridId });
      $id('lesSesiCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function lesSimpanSesi() {
      const murid = Number($id('lesSesiMurid').value);
      const tanggal = $id('lesSesiTanggal').value;
      const mulai = $id('lesSesiMulai').value, selesai = $id('lesSesiSelesai').value;
      if (!murid) return alert('Pilih murid dulu (tambahkan murid di bagian Murid & jadwal).');
      if (!tanggal || !mulai) return alert('Isi tanggal dan jam mulai.');
      if (selesai && selesai <= mulai) return alert('Jam selesai harus setelah jam mulai.');
      if (!lesState.editSesi && tanggal > lesHariIni()) return alert('Hanya les yang sudah terlaksana yang dicatat (tanggalnya masih di masa depan).');
      const tombol = $id('lesSesiSimpan'); tombol.disabled = true;
      const r = await guruRPC('guru_les_sesi_simpan', {
        p_id: lesState.editSesi, p_murid_id: murid, p_tanggal: tanggal, p_jam_mulai: mulai, p_jam_selesai: selesai || null,
        p_jenis: $id('lesSesiJenis').value, p_keterangan: $id('lesSesiKet').value.trim() || null
      });
      tombol.disabled = false;
      if (r.error) return alert('Gagal menyimpan: ' + r.error.message);
      const info = lesState.editSesi ? '✅ Perubahan disimpan.' : `✅ Tercatat${r.data && r.data.ke ? ` — pertemuan ke-${r.data.ke} bulan ini` : ''}.`;
      lesIsiFormSesi();
      $id('lesSesiPesan').textContent = info;
      setTimeout(() => { const p = $id('lesSesiPesan'); if (p && p.textContent === info) p.textContent = ''; }, 5000);
      if (tanggal.slice(0, 7) !== lesState.bulan.slice(0, 7)) lesState.bulan = tanggal.slice(0, 7) + '-01';
      await lesMuatRekap();
    }

    async function lesHapusSesi(id) {
      if (!confirm('Hapus catatan sesi ini? Nomor pertemuan sesudahnya akan bergeser.')) return;
      const r = await guruRPC('guru_les_sesi_hapus', { p_id: Number(id) });
      if (r.error) return alert('Gagal menghapus: ' + r.error.message);
      if (lesState.editSesi === Number(id)) lesIsiFormSesi();
      await lesMuatRekap();
    }

    // ---------- Murid & jadwal ----------
    function lesRingkasJadwal(j) {
      return (j || []).map(x => `${LES_HARI[x.hari]} ${x.jam_mulai}–${x.jam_selesai}`).join(' · ') || 'belum ada jadwal';
    }

    function lesRenderMurid() {
      const daftar = (lesState.data || {}).murid || [];
      $id('lesMuridJumlah').textContent = `(${daftar.filter(m => m.aktif).length} aktif)`;
      $id('lesMuridDaftar').innerHTML = daftar.length ? daftar.map(m => `
        <div class="les-murid-baris ${m.aktif ? '' : 'nonaktif'}">
          <div><b>${escHtml(m.nama)}</b>${m.aktif ? '' : ' <span class="badge">nonaktif</span>'}
            <div class="mu">${escHtml(lesRingkasJadwal(m.jadwal))} · biasanya ${escHtml(LES_JENIS[m.jenis_default] || m.jenis_default)}${m.wa ? ' · WA ' + escHtml(m.wa) : ' · <span class="hd-rendah">belum ada no. WA</span>'}</div></div>
          <div class="les-aksi"><button class="alt" onclick="lesUbahMurid(${Number(m.id)})">✏️ Ubah</button><button class="alt" onclick="lesHapusMurid(${Number(m.id)})">🗑</button></div>
        </div>`).join('') : '<p class="mu">Belum ada murid les.</p>';
    }

    function lesBarisJadwalHTML(j = {}) {
      return `<div class="les-jadwal-baris">
        <select class="lj-hari">${LES_HARI.slice(1).map((h, i) => `<option value="${i + 1}" ${Number(j.hari) === i + 1 ? 'selected' : ''}>${h}</option>`).join('')}</select>
        <input type="time" class="lj-mulai" value="${escHtml(j.jam_mulai || '')}">
        <span>–</span>
        <input type="time" class="lj-selesai" value="${escHtml(j.jam_selesai || '')}">
        <button type="button" class="alt" title="Hapus jadwal" onclick="this.parentElement.remove()">✕</button>
      </div>`;
    }
    function lesTambahJadwal() { $id('lesMuridJadwal').insertAdjacentHTML('beforeend', lesBarisJadwalHTML()); }

    function lesFormMurid(m) {
      lesState.editMurid = m ? Number(m.id) : null;
      $id('lesMuridForm').classList.remove('hidden');
      $id('lesMuridFormJudul').textContent = m ? `✏️ Ubah murid: ${m.nama}` : '＋ Murid baru';
      $id('lesMNama').value = m ? m.nama : '';
      $id('lesMWa').value = m ? (m.wa || '') : '';
      $id('lesMEmail').value = m ? (m.email || '') : '';
      $id('lesMJenis').value = m ? m.jenis_default : 'sesi';
      $id('lesMCatatan').value = m ? (m.catatan || '') : '';
      $id('lesMAktif').checked = m ? !!m.aktif : true;
      $id('lesMAktifBaris').classList.toggle('hidden', !m);
      $id('lesMuridJadwal').innerHTML = (m && m.jadwal && m.jadwal.length ? m.jadwal : [{}]).map(lesBarisJadwalHTML).join('');
      $id('lesMNama').focus();
    }
    function lesUbahMurid(id) { const m = ((lesState.data || {}).murid || []).find(x => Number(x.id) === Number(id)); if (m) lesFormMurid(m); }
    function lesTutupFormMurid() { $id('lesMuridForm').classList.add('hidden'); lesState.editMurid = null; }

    async function lesSimpanMurid() {
      const nama = $id('lesMNama').value.trim();
      if (!nama) return alert('Nama murid wajib diisi.');
      const wa = $id('lesMWa').value.trim();
      if (wa && !lesNomorWA(wa)) return alert('Nomor WA tidak valid. Contoh: 0812-3456-7890');
      const jadwal = [];
      for (const b of $id('lesMuridJadwal').querySelectorAll('.les-jadwal-baris')) {
        const mulai = b.querySelector('.lj-mulai').value, selesai = b.querySelector('.lj-selesai').value;
        if (!mulai && !selesai) continue;
        if (!mulai || !selesai) return alert('Lengkapi jam mulai dan jam selesai jadwal.');
        if (selesai <= mulai) return alert('Jam selesai jadwal harus setelah jam mulai.');
        jadwal.push({ hari: Number(b.querySelector('.lj-hari').value), jam_mulai: mulai, jam_selesai: selesai });
      }
      const r = await guruRPC('guru_les_murid_simpan', { p_id: lesState.editMurid, p_data: {
        nama, wa, email: $id('lesMEmail').value.trim(), jenis_default: $id('lesMJenis').value,
        catatan: $id('lesMCatatan').value.trim(), aktif: lesState.editMurid ? $id('lesMAktif').checked : true, jadwal } });
      if (r.error) return alert('Gagal menyimpan murid: ' + r.error.message);
      lesTutupFormMurid();
      lesState.siap = false;
      await lesMuatSemua();
    }

    async function lesHapusMurid(id) {
      const m = ((lesState.data || {}).murid || []).find(x => Number(x.id) === Number(id));
      if (!m || !confirm(`Hapus murid ${m.nama}? Bila sudah punya catatan sesi, murid hanya dinonaktifkan supaya rekap lama tetap ada.`)) return;
      const r = await guruRPC('guru_les_murid_hapus', { p_id: Number(id) });
      if (r.error) return alert('Gagal: ' + r.error.message);
      if (r.data === 'dinonaktifkan') alert(`${m.nama} dinonaktifkan (rekap lama tetap tersimpan).`);
      lesState.siap = false;
      await lesMuatSemua();
    }

    // ---------- Tarif & teks pengingat ----------
    function lesRenderSetelan() {
      const s = (lesState.data || {}).setelan || {};
      $id('lesTarifJam').value = s.tarif_jam ?? 120000;
      $id('lesTarifSesi').value = s.tarif_sesi ?? 180000;
      $id('lesPesanWa').value = s.pesan_wa || '';
      $id('lesSetelanInfo').textContent = `${lesRp(s.tarif_jam ?? 120000)}/jam · 1,5 jam ${lesRp(Math.round((s.tarif_jam ?? 120000) * 1.5))} · ${lesRp(s.tarif_sesi ?? 180000)}/sesi`;
    }

    async function lesSimpanSetelan() {
      const jam = Number($id('lesTarifJam').value), sesi = Number($id('lesTarifSesi').value);
      if (!(jam > 0) || !(sesi > 0)) return alert('Isi tarif dengan angka lebih dari 0.');
      const pesan = $id('lesPesanWa').value.trim();
      const nilai = { tarif_jam: Math.round(jam), tarif_sesi: Math.round(sesi), pesan_wa: pesan || 'Halo {nama}, mengingatkan les Matematika hari ini ({hari}) pukul {jam}. Sampai ketemu!' };
      const r = await guruRPC('guru_pengaturan_simpan', { p_kunci: 'les', p_nilai: nilai });
      if (r.error) return alert('Gagal menyimpan: ' + r.error.message);
      lesState.data.setelan = nilai;
      lesRenderSetelan();
      lesSesiInfoFee();
      alert('✅ Tarif & pesan disimpan. Tarif baru berlaku untuk sesi yang dicatat setelah ini (catatan lama tidak berubah).');
    }
