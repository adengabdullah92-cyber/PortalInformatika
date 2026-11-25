// LMS Informatika SMA — js-wajah.js: Absen wajah.
//   Siswa : mendaftarkan wajah dari HP-nya (3 selfie), menunggu persetujuan guru.
//   Guru  : menyetujui pendaftaran, melihat status per kelas, impor pas foto,
//           dan ABSEN WAJAH (foto kelompok / sapu video) dari tab "Jadwal & Hadir".
// Server: Edge Function "absen" (absen.ts) + tabel wajah_siswa / wajah_pengajuan (wajah.sql).
// Pengenalan wajah berjalan di browser (face-api.js, dimuat HANYA saat fitur ini dipakai).
// Yang disimpan di server hanya kode angka wajah (128 angka), bukan foto.
//
// File ini bersifat TAMBAHAN: tidak mengubah isi file js lain. Untuk menyambung ke LMS,
// ia membungkus dua fungsi yang sudah ada (switchTab dan jadwalRenderAbsen). Untuk mencabut
// fitur: hapus baris <script src="js-wajah.js"> dan menu "navWajah" di index.html.

    const WJ_URL = `${SUPABASE_URL}/functions/v1/absen`;
    const WJ_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15';
    const WJ_AMBANG_BELAJAR = 0.42;   // hanya wajah yang dikenali sangat yakin yang dipelajari
    const WJ_VIDEO_JEDA = 450;        // ms antar-proses frame video (±2 kali per detik)
    const WJ_VIDEO_SUARA = 2;         // dikenali di ≥2 frame baru dihitung hadir

    const WJ = {
      mesin: null, stream: null, audio: null, wake: null, sudahInit: false,
      set: wjMuatSet(),
      sis: { st: null, reg: null, setuju: false },
      guru: { aju: [], total: 0, status: null, fotoUntuk: null },
      abs: null, tandai: null
    };

    const wjId = (id) => document.getElementById(id);
    const wjEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const wjTunggu = (ms) => new Promise(r => setTimeout(r, ms));

    function wjMuatSet() {
      const dasar = { th: 0.5, conf: 0.4, grid: 2, dim: 2000, alpa: true, belajar: true };
      try { return { ...dasar, ...JSON.parse(localStorage.getItem('wj_pengaturan') || '{}') }; } catch (_) { return dasar; }
    }
    function wjSimpanSet() { try { localStorage.setItem('wj_pengaturan', JSON.stringify(WJ.set)); } catch (_) {} }

    function wjToast(teks, ms = 3500) {
      let el = wjId('wjToast');
      if (!el) { el = document.createElement('div'); el.id = 'wjToast'; el.className = 'wj-toast'; document.body.appendChild(el); }
      el.textContent = teks; el.classList.add('tampil');
      clearTimeout(wjToast._t); wjToast._t = setTimeout(() => el.classList.remove('tampil'), ms);
    }

    // ================= SERVER =================
    async function wjAPI(aksi, extra = {}, opsi = {}) {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), opsi.timeout || 30000);
      try {
        const res = await fetch(WJ_URL, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ aksi, token: sesiToken, ...extra })
        });
        let data;
        try { data = await res.json(); } catch (_) { throw new Error('Function "absen" belum aktif (HTTP ' + res.status + ').'); }
        if (res.status === 401) sesiHabis(data.error || 'Sesi berakhir. Silakan masuk lagi.');
        if (!res.ok || data.error) { const e = new Error(data.error || ('HTTP ' + res.status)); e.status = res.status; throw e; }
        return data;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Server tidak merespons. Periksa koneksi internet lalu coba lagi.');
        if (/Load failed|Failed to fetch|NetworkError/i.test(e.message || '')) throw new Error('Function "absen" belum di-deploy atau koneksi terputus.');
        throw e;
      } finally { clearTimeout(tm); }
    }

    // ================= MESIN WAJAH (dimuat sekali, saat pertama dipakai) =================
    function wjMuatMesin(lapor) {
      if (WJ.mesin) return WJ.mesin;
      const info = (t) => { try { if (lapor) lapor(t); } catch (_) {} };
      WJ.mesin = (async () => {
        if (!window.faceapi) {
          info('Memuat pustaka wajah…');
          await new Promise((ok, gagal) => {
            const sc = document.createElement('script');
            sc.src = WJ_CDN + '/dist/face-api.js';
            sc.onload = ok;
            sc.onerror = () => gagal(new Error('Gagal memuat pustaka wajah (periksa internet).'));
            document.head.appendChild(sc);
          });
        }
        info('Memuat model wajah (±12 MB, hanya sekali, sebaiknya lewat Wi-Fi)…');
        await faceapi.tf.ready();
        const url = WJ_CDN + '/model/';
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(url),
          faceapi.nets.faceLandmark68Net.loadFromUri(url),
          faceapi.nets.faceRecognitionNet.loadFromUri(url)
        ]);
        const c = document.createElement('canvas'); c.width = c.height = 64;
        await faceapi.detectAllFaces(c, new faceapi.SsdMobilenetv1Options());   // pemanasan
        return true;
      })().catch(e => { WJ.mesin = null; throw e; });
      return WJ.mesin;
    }

    // ================= KAMERA =================
    async function wjNyalakanKamera(idVideo, hadap) {
      wjMatikanKamera();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Browser ini tidak mendukung kamera (harus lewat HTTPS).');
      const depan = hadap === 'user';
      WJ.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: depan ? 'user' : 'environment' }, width: { ideal: depan ? 1280 : 1920 }, height: { ideal: depan ? 720 : 1080 } }
      });
      const v = wjId(idVideo);
      v.srcObject = WJ.stream;
      try { await v.play(); } catch (_) {}
    }
    function wjMatikanKamera() {
      if (WJ.stream) { WJ.stream.getTracks().forEach(t => t.stop()); WJ.stream = null; }
      ['wjVidDaftar', 'wjVid'].forEach(id => { const v = wjId(id); if (v) v.srcObject = null; });
    }

    // ================= GAMBAR & WAJAH =================
    async function wjFileKeKanvas(file, maksSisi) {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((ok, gagal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => gagal(new Error('Gambar tidak bisa dibuka')); i.src = url; });
        let s = Math.min(1, maksSisi / Math.max(img.naturalWidth, img.naturalHeight));
        const piksel = img.naturalWidth * img.naturalHeight * s * s;
        if (piksel > 15e6) s *= Math.sqrt(15e6 / piksel);   // batas kanvas Safari
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c;
      } finally { URL.revokeObjectURL(url); }
    }

    function wjPotong(src, x, y, w, h) {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
      c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
      return c;
    }

    // Foto kecil wajah (±120 px) hanya untuk diperiksa guru
    function wjFotoKecil(kanvas, box) {
      const pad = box.width * 0.25;
      const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
      const w = Math.min(kanvas.width - x, box.width + pad * 2), h = Math.min(kanvas.height - y, box.height + pad * 2);
      const sisi = Math.max(w, h);
      const c = document.createElement('canvas'); c.width = c.height = 120;
      const g = c.getContext('2d');
      g.fillStyle = '#888'; g.fillRect(0, 0, 120, 120);
      const k = 120 / sisi;
      g.drawImage(kanvas, x, y, w, h, (120 - w * k) / 2, (120 - h * k) / 2, w * k, h * k);
      return c.toDataURL('image/jpeg', 0.7);
    }

    // Deteksi semua wajah. Foto dipecah jadi potongan yang saling tumpang-tindih karena detektor
    // memperkecil gambar ke 512 px sehingga wajah kecil di baris belakang bisa hilang.
    async function wjDeteksi(kanvas, grid, minConf) {
      const opsi = new faceapi.SsdMobilenetv1Options({ minConfidence: minConf, maxResults: 150 });
      const W = kanvas.width, H = kanvas.height;
      const petak = [{ x: 0, y: 0, w: W, h: H }];
      if (grid > 1) {
        const ov = 0.25, tw = W / (grid - (grid - 1) * ov), th = H / (grid - (grid - 1) * ov);
        for (let r = 0; r < grid; r++) for (let c = 0; c < grid; c++) {
          const x = Math.round(c * tw * (1 - ov)), y = Math.round(r * th * (1 - ov));
          petak.push({ x, y, w: Math.round(Math.min(tw, W - x)), h: Math.round(Math.min(th, H - y)) });
        }
      }
      const temu = [];
      for (const t of petak) {
        const src = (t.w === W && t.h === H) ? kanvas : wjPotong(kanvas, t.x, t.y, t.w, t.h);
        const res = await faceapi.detectAllFaces(src, opsi).withFaceLandmarks().withFaceDescriptors();
        for (const r of res) {
          const b = r.detection.box;
          temu.push({ box: { x: b.x + t.x, y: b.y + t.y, w: b.width, h: b.height }, skor: r.detection.score, descriptor: Array.from(r.descriptor) });
        }
      }
      temu.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
      const simpan = [];
      for (const f of temu) if (!simpan.some(k => wjTumpang(k.box, f.box) > 0.5)) simpan.push(f);
      return simpan;
    }
    function wjTumpang(a, b) {
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
    }

    function wjJarak(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
    function wjJarakMin(desc, siswa) { let m = Infinity; for (const v of siswa.d) { const x = wjJarak(desc, v); if (x < m) m = x; } return m; }

    // Satu wajah = satu siswa, satu siswa = satu wajah; pasangan dengan jarak terkecil didahulukan.
    function wjCocokkan(wajah, siswa, ambang) {
      const pasangan = [];
      wajah.forEach((f, fi) => {
        for (const s of siswa) {
          if (!s.d.length) continue;
          const d = wjJarakMin(f.descriptor, s);
          if (d < ambang) pasangan.push({ fi, sid: s.id, d });
        }
      });
      pasangan.sort((a, b) => a.d - b.d);
      const fPakai = new Set(), sPakai = new Set(), hasil = {};
      for (const p of pasangan) {
        if (fPakai.has(p.fi) || sPakai.has(p.sid)) continue;
        fPakai.add(p.fi); sPakai.add(p.sid); hasil[p.fi] = p;
      }
      return hasil;
    }

    // Nama file pas foto → siswa ("Ahmad Fauzi.jpg", "01 Ahmad Fauzi.jpg"). Nama yang ambigu tidak dicocokkan.
    function wjNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, ' ').trim(); }
    function wjCariSiswa(namaFile, siswa) {
      const dasar = wjNorm(String(namaFile).replace(/\.[^.]+$/, '').replace(/^[\d\s._-]+/, ''));
      if (!dasar) return null;
      const persis = siswa.filter(s => wjNorm(s.nama) === dasar);
      if (persis.length === 1) return persis[0];
      if (dasar.length < 4) return null;
      const sebagian = siswa.filter(s => { const n = wjNorm(s.nama); return n.includes(dasar) || dasar.includes(n); });
      return sebagian.length === 1 ? sebagian[0] : null;
    }

    // ================= INISIALISASI (dipanggil saat dashboard tampil) =================
    function wjInit() {
      if (!activeUser) return;
      wjId('navWajah').classList.remove('hidden');
      wjId('siswaWajahView').classList.add('hidden'); wjId('guruWajahView').classList.add('hidden');
      if (activeUser.role === 'guru') {
        wjId('navWajahTeks').textContent = 'Wajah';
        wjBangunGuru();
        wjId('guruWajahView').classList.remove('hidden');
        wjGuruMuatPengajuan(true);
      } else {
        wjId('navWajahTeks').textContent = 'Wajahku';
        wjBangunSiswa();
        wjId('siswaWajahView').classList.remove('hidden');
        wjSiswaMuat();
      }
    }

    function wjTabDibuka() {
      if (!activeUser) return;
      if (activeUser.role === 'guru') wjGuruMuatPengajuan();
      else if (!WJ.sis.reg) wjSiswaMuat();
    }

    // ================= SISWA =================
    const WJ_LANGKAH = ['hadap lurus ke kamera', 'menoleh sedikit ke kiri', 'menoleh sedikit ke kanan'];

    function wjBangunSiswa() {
      wjId('siswaWajahView').innerHTML = `
        <h2>📷 Wajahku</h2>
        <p class="mu" style="margin-bottom: 20px;">Daftarkan wajahmu supaya gurumu bisa mengabsen lewat foto kelas.</p>
        <div class="card"><div id="wjSiswaIsi"><p class="mu">Memuat…</p></div></div>
        <div class="card hidden" id="wjDaftarCard">
          <h3>📸 Ambil 3 foto wajahmu</h3>
          <div id="wjLangkah" class="wj-langkah"></div>
          <div class="wj-vwrap wj-selfie"><video id="wjVidDaftar" playsinline muted autoplay></video></div>
          <div class="wj-aksi">
            <button type="button" id="wjBtnAmbil" onclick="wjAmbil()">📸 Ambil foto</button>
            <button type="button" class="alt" onclick="wjDaftarBatal()">✖ Batal</button>
          </div>
          <div id="wjDaftarPesan" class="wj-pesan"></div>
          <div id="wjThumbs" class="wj-thumbs"></div>
          <div id="wjKirimBox" class="wj-aksi hidden">
            <button type="button" class="ok" id="wjBtnKirim" onclick="wjKirimDaftar()">📤 Kirim ke guru</button>
            <button type="button" class="alt" onclick="wjDaftarMulai(true)">↺ Ulangi</button>
          </div>
        </div>`;
    }

    async function wjSiswaMuat() {
      const box = wjId('wjSiswaIsi'); if (!box) return;
      try { WJ.sis.st = await wjAPI('status_saya'); wjSiswaRender(); }
      catch (e) { box.innerHTML = `<p class="mu">Gagal memuat: ${wjEsc(e.message)}</p><button type="button" class="alt" onclick="wjSiswaMuat()">🔄 Coba lagi</button>`; }
    }

    function wjSiswaRender() {
      const st = WJ.sis.st, box = wjId('wjSiswaIsi'); if (!st || !box) return;
      const label = { belum: ['warn', 'Belum terdaftar'], menunggu: ['warn', '⏳ Menunggu persetujuan guru'], disetujui: ['ok', '✅ Wajah terdaftar'], ditolak: ['bad', '❌ Pendaftaran ditolak'] }[st.status] || ['warn', st.status];
      let h = `<div class="wj-status"><span class="badge ${label[0]}">${label[1]}</span></div>`;
      if (st.status === 'ditolak' && st.alasan) h += `<p class="wj-alasan"><b>Catatan guru:</b> ${wjEsc(st.alasan)}</p>`;
      if (st.status === 'menunggu') h += '<p class="mu">Gurumu akan memeriksa fotomu. Setelah disetujui, foto dihapus dan hanya kode angka wajah yang tersimpan.</p>';
      if (st.status === 'disetujui') h += '<p class="mu">Wajahmu sudah bisa dikenali saat absen foto kelas. Kalau penampilanmu banyak berubah, kamu boleh mendaftar ulang.</p>';
      h += `<div class="wj-info">
          <b>Yang perlu kamu tahu</b>
          <ul>
            <li>Kamu mengambil 3 foto selfie. Dari tiap foto dibuat <b>kode angka</b> wajah, dan itulah yang disimpan.</li>
            <li>Foto kecil dikirim ke gurumu <b>hanya untuk dicek</b> bahwa itu benar kamu, lalu dihapus.</li>
            <li>Data wajah hanya dipakai untuk absen pelajaran Informatika.</li>
          </ul>
        </div>
        <label class="wj-setuju"><input type="checkbox" id="wjSetuju" ${WJ.sis.setuju ? 'checked' : ''} onchange="WJ.sis.setuju = this.checked"> Saya setuju wajah saya didaftarkan untuk absensi, dan orang tua/wali sudah mengetahuinya.</label>
        <div class="wj-aksi"><button type="button" onclick="wjDaftarMulai()">${st.status === 'belum' ? '📸 Mulai daftar (3 foto)' : '🔁 Daftar ulang (3 foto)'}</button></div>
        <p class="mu" style="font-size:0.8rem;">Pertama kali, model wajah (±12 MB) diunduh dulu. Sebaiknya lewat Wi-Fi.</p>`;
      box.innerHTML = h;
    }

    function wjPesanDaftar(t) { const el = wjId('wjDaftarPesan'); if (el) el.textContent = t || ''; }

    async function wjDaftarMulai(ulang) {
      if (!ulang && !(wjId('wjSetuju') && wjId('wjSetuju').checked)) return alert('Centang kotak persetujuan dulu.');
      WJ.sis.setuju = true;
      WJ.sis.reg = { desc: [], fotos: [], sibuk: false };
      wjId('wjDaftarCard').classList.remove('hidden');
      wjId('wjThumbs').innerHTML = ''; wjId('wjKirimBox').classList.add('hidden');
      wjId('wjBtnAmbil').disabled = true;
      wjId('wjDaftarCard').querySelector('.wj-vwrap').classList.remove('hidden');
      wjId('wjDaftarCard').querySelector('.wj-aksi').classList.remove('hidden');
      wjId('wjLangkah').textContent = '';
      wjId('wjDaftarCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      wjPesanDaftar('Menyiapkan model wajah dan kamera…');
      try {
        await wjMuatMesin(wjPesanDaftar);
        await wjNyalakanKamera('wjVidDaftar', 'user');
      } catch (e) { wjPesanDaftar('⚠️ ' + e.message); return; }
      wjId('wjBtnAmbil').disabled = false;
      wjLangkahTampil();
    }

    function wjLangkahTampil() {
      const n = WJ.sis.reg ? WJ.sis.reg.desc.length : 0;
      wjId('wjLangkah').innerHTML = `<b>Foto ${n + 1} dari 3:</b> ${WJ_LANGKAH[n]}`;
      wjPesanDaftar('Pastikan wajahmu terang, terlihat penuh, dan hanya ada kamu di kamera.');
    }

    function wjDaftarBatal(diam) {
      wjMatikanKamera();
      WJ.sis.reg = null;
      const c = wjId('wjDaftarCard'); if (c) c.classList.add('hidden');
      if (!diam) wjSiswaRender();
    }

    async function wjAmbil() {
      const reg = WJ.sis.reg, v = wjId('wjVidDaftar');
      if (!reg || reg.sibuk) return;
      if (!v.videoWidth) return wjPesanDaftar('Kamera belum siap, tunggu sebentar.');
      reg.sibuk = true; wjId('wjBtnAmbil').disabled = true; wjPesanDaftar('Memeriksa wajah…');
      try {
        const k = document.createElement('canvas'); k.width = v.videoWidth; k.height = v.videoHeight;
        k.getContext('2d').drawImage(v, 0, 0);
        const res = await faceapi.detectAllFaces(k, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 })).withFaceLandmarks().withFaceDescriptors();
        if (!res.length) { wjPesanDaftar('❌ Wajah tidak terdeteksi. Cari tempat yang lebih terang dan hadap kamera.'); return; }
        res.sort((a, b) => b.detection.box.area - a.detection.box.area);
        const b = res[0].detection.box;
        if (b.width < k.width * 0.2) { wjPesanDaftar('❌ Wajah terlalu kecil atau jauh. Dekatkan kamera ke wajahmu.'); return; }
        if (res[1] && res[1].detection.box.area > b.area * 0.4) { wjPesanDaftar('❌ Ada lebih dari satu wajah di kamera. Foto harus kamu sendiri.'); return; }
        reg.desc.push(Array.from(res[0].descriptor));
        reg.fotos.push(wjFotoKecil(k, b));
        const im = document.createElement('img'); im.src = reg.fotos[reg.fotos.length - 1]; im.alt = 'Foto ' + reg.fotos.length;
        wjId('wjThumbs').appendChild(im);
        if (reg.desc.length < 3) { wjLangkahTampil(); return; }
        wjSelesaiAmbil();
      } catch (e) { console.error(e); wjPesanDaftar('❌ Gagal memproses foto: ' + e.message); }
      finally { reg.sibuk = false; const btn = wjId('wjBtnAmbil'); if (btn && reg.desc.length < 3) btn.disabled = false; }
    }

    function wjSelesaiAmbil() {
      const reg = WJ.sis.reg;
      wjMatikanKamera();
      let antar = 0;
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) antar = Math.max(antar, wjJarak(reg.desc[i], reg.desc[j]));
      if (antar > 0.6) {
        alert('Wajah pada ketiga foto tampak berbeda. Ulangi dari awal, pastikan hanya wajahmu sendiri yang difoto.');
        wjDaftarMulai(true); return;
      }
      wjId('wjDaftarCard').querySelector('.wj-vwrap').classList.add('hidden');
      wjId('wjDaftarCard').querySelector('.wj-aksi').classList.add('hidden');
      wjId('wjLangkah').innerHTML = '<b>Periksa fotomu</b>, lalu kirim ke gurumu.';
      wjPesanDaftar('');
      wjId('wjKirimBox').classList.remove('hidden');
    }

    async function wjKirimDaftar() {
      const reg = WJ.sis.reg; if (!reg || reg.desc.length !== 3) return;
      const btn = wjId('wjBtnKirim'); btn.disabled = true; btn.textContent = '⏳ Mengirim…';
      try {
        await wjAPI('ajukan', { setuju: true, descriptors: reg.desc.map(d => d.map(x => Math.round(x * 1e4) / 1e4)), fotos: reg.fotos }, { timeout: 45000 });
        wjDaftarBatal(true);
        await wjSiswaMuat();
        wjToast('Terkirim. Tunggu persetujuan gurumu ya.');
      } catch (e) {
        btn.disabled = false; btn.textContent = '📤 Kirim ke guru';
        alert('Belum terkirim: ' + e.message);
      }
    }

    // ================= GURU: PERSETUJUAN, STATUS, IMPOR =================
    function wjBangunGuru() {
      const kelas = DAFTAR_KELAS.map(k => `<option value="${k}">${k}</option>`).join('');
      wjId('guruWajahView').innerHTML = `
        <h2>📷 Wajah & Absen Foto</h2>
        <p class="mu" style="margin-bottom: 20px;">Setujui pendaftaran wajah siswa, lihat status tiap kelas, dan impor pas foto. Absen wajah dijalankan dari tab <b>Jadwal & Hadir</b> (tombol 📷 Absen wajah pada daftar hadir).</p>

        <div class="card">
          <h3>✅ Persetujuan pendaftaran</h3>
          <div class="hd-pilih">
            <div><label class="mu">Kelas</label><select id="wjPKelas" onchange="wjGuruMuatPengajuan()"><option value="">Semua kelas</option>${kelas}</select></div>
            <button type="button" class="alt" onclick="wjGuruMuatPengajuan()">🔄 Muat</button>
          </div>
          <div id="wjPengajuanList" style="margin-top:12px;"><p class="mu">Memuat…</p></div>
        </div>

        <div class="card">
          <h3>👥 Status pendaftaran per kelas</h3>
          <div class="hd-pilih">
            <div><label class="mu">Kelas</label><select id="wjSKelas">${kelas}</select></div>
            <button type="button" onclick="wjGuruStatusKelas()">📊 Tampilkan</button>
          </div>
          <div id="wjStatusIsi" style="margin-top:12px;"><p class="mu">Pilih kelas lalu tekan Tampilkan.</p></div>
          <input type="file" id="wjFileSiswa" accept="image/*" class="hidden">
        </div>

        <div class="card">
          <h3>📥 Impor pas foto</h3>
          <p class="mu" style="margin-bottom:10px;">Beri nama file sama dengan nama siswa, mis. <b>Ahmad Fauzi.jpg</b> atau <b>01 Ahmad Fauzi.jpg</b>. Di iPhone/iPad, simpan fotonya di app <b>File</b> lalu pilih "Pilih File": foto dari app Foto biasanya bernama IMG_xxxx sehingga tidak bisa dicocokkan. Maksimal 5 wajah per siswa.</p>
          <div class="hd-pilih">
            <div><label class="mu">Kelas</label><select id="wjIKelas">${kelas}</select></div>
            <button type="button" onclick="wjId('wjFileImpor').value=''; wjId('wjFileImpor').click()">📁 Pilih pas foto</button>
          </div>
          <input type="file" id="wjFileImpor" accept="image/*" multiple class="hidden">
          <div id="wjImporLaporan" class="wj-pesan" style="margin-top:10px;"></div>
        </div>`;
      wjId('wjFileSiswa').addEventListener('change', e => { const f = e.target.files[0]; if (f) wjGuruFotoSiswaProses(f); });
      wjId('wjFileImpor').addEventListener('change', e => { if (e.target.files.length) wjImporMassal([...e.target.files]); });
    }

    function wjNavBadge() {
      const el = wjId('navWajahTeks'); if (!el || !activeUser || activeUser.role !== 'guru') return;
      el.textContent = WJ.guru.total > 0 ? `Wajah (${WJ.guru.total})` : 'Wajah';
    }

    async function wjGuruMuatPengajuan(diam) {
      const box = wjId('wjPengajuanList'); if (!box) return;
      if (!diam) box.innerHTML = '<p class="mu">Memuat…</p>';
      try {
        const kelas = wjId('wjPKelas') ? wjId('wjPKelas').value : '';
        const d = await wjAPI('pengajuan', { kelas });
        WJ.guru.aju = d.daftar || [];
        WJ.guru.total = d.total || 0;
        if (!kelas) wjNavBadge();
        wjRenderPengajuan(d.total || 0);
      } catch (e) {
        if (diam) return;   // function belum di-deploy: jangan ganggu pemuatan dashboard
        box.innerHTML = `<p class="mu">Gagal memuat: ${wjEsc(e.message)}</p>`;
      }
    }

    function wjRenderPengajuan(total) {
      const box = wjId('wjPengajuanList'), L = WJ.guru.aju;
      if (!L.length) { box.innerHTML = '<p class="mu">Tidak ada pendaftaran yang menunggu persetujuan. 🎉</p>'; return; }
      const bersih = L.filter(x => !x.mirip && !(x.jarak_antar > 0.5));
      let h = `<div class="hd-catatan">${total} pendaftaran menunggu${total > L.length ? ` (ditampilkan ${L.length} pertama)` : ''}. Periksa bahwa foto cocok dengan nama siswa.</div>`;
      if (bersih.length) h += `<div class="wj-aksi"><button type="button" class="ok" onclick="wjSetujuiBersih()">✅ Setujui semua tanpa peringatan (${bersih.length})</button></div>`;
      h += L.map(x => {
        const w = [];
        if (x.mirip) w.push(`⚠️ Wajah mirip dengan <b>${wjEsc(x.mirip.nama)}</b> (${wjEsc(x.mirip.kelas)}), jarak ${wjEsc(x.mirip.jarak)}. Pastikan ini bukan foto teman.`);
        if (x.jarak_antar > 0.5) w.push(`⚠️ Ketiga foto agak berbeda satu sama lain (${wjEsc(Number(x.jarak_antar).toFixed(2))}). Cek apakah orangnya sama.`);
        return `<div class="wj-aju" id="wjAju${Number(x.id)}">
          <div class="wj-aju-kepala"><b>${wjEsc(x.nama)}</b> <span class="badge">${wjEsc(x.kelas)}</span></div>
          <div class="wj-aju-foto">${(x.fotos || []).map((f, i) => `<img src="${wjEsc(f)}" alt="Foto ${i + 1} ${wjEsc(x.nama)}">`).join('')}</div>
          ${w.map(t => `<div class="wj-peringatan">${t}</div>`).join('')}
          <div class="wj-aksi">
            <button type="button" class="ok" onclick="wjPutuskan(${Number(x.id)}, true)">✅ Setujui</button>
            <button type="button" class="alt danger" onclick="wjPutuskan(${Number(x.id)}, false)">❌ Tolak</button>
          </div>
        </div>`;
      }).join('');
      box.innerHTML = h;
    }

    async function wjPutuskan(id, setuju) {
      let alasan = '';
      if (!setuju) {
        alasan = prompt('Alasan penolakan (akan dibaca siswa):', 'Foto kurang jelas, silakan daftar ulang.');
        if (alasan === null) return;
      }
      try {
        await wjAPI('putuskan', { id, setuju, alasan });
        WJ.guru.aju = WJ.guru.aju.filter(x => x.id !== id);
        WJ.guru.total = Math.max(0, WJ.guru.total - 1);
        wjNavBadge();
        if (!WJ.guru.aju.length && WJ.guru.total > 0) return wjGuruMuatPengajuan();
        wjRenderPengajuan(WJ.guru.total);
      } catch (e) { alert('Gagal: ' + e.message); }
    }

    async function wjSetujuiBersih() {
      const ids = WJ.guru.aju.filter(x => !x.mirip && !(x.jarak_antar > 0.5)).map(x => x.id);
      if (!ids.length) return;
      if (!confirm(`Setujui ${ids.length} pendaftaran yang tidak ada peringatan?\n\nPastikan kamu sudah memeriksa foto-fotonya.`)) return;
      try {
        const r = await wjAPI('setujui_banyak', { ids }, { timeout: 60000 });
        if (r.gagal && r.gagal.length) alert(`${r.gagal.length} pendaftaran gagal diproses. Muat ulang daftar lalu coba lagi.`);
        wjToast(`${r.ok} pendaftaran disetujui.`);
        wjGuruMuatPengajuan();
      } catch (e) { alert('Gagal: ' + e.message); }
    }

    async function wjGuruStatusKelas() {
      const kelas = wjId('wjSKelas').value, box = wjId('wjStatusIsi');
      box.innerHTML = '<p class="mu">Memuat…</p>';
      try {
        const d = await wjAPI('status_kelas', { kelas });
        WJ.guru.status = { kelas, siswa: d.siswa || [] };
        wjRenderStatusKelas();
      } catch (e) { box.innerHTML = `<p class="mu">Gagal memuat: ${wjEsc(e.message)}</p>`; }
    }

    function wjRenderStatusKelas() {
      const S = WJ.guru.status, box = wjId('wjStatusIsi'); if (!S) return;
      if (!S.siswa.length) { box.innerHTML = '<p class="mu">Belum ada siswa di kelas ini.</p>'; return; }
      const terdaftar = S.siswa.filter(s => s.n_daftar > 0).length;
      const baris = S.siswa.map((s, i) => {
        let lencana;
        if (s.pengajuan && s.pengajuan.status === 'menunggu') lencana = '<span class="badge warn">⏳ Menunggu</span>';
        else if (s.n_daftar > 0) lencana = `<span class="badge ok">✅ ${s.n_daftar} wajah${s.n_belajar ? ' +' + s.n_belajar + ' belajar' : ''}</span>`;
        else if (s.pengajuan && s.pengajuan.status === 'ditolak') lencana = '<span class="badge bad">Ditolak</span>';
        else lencana = '<span class="badge">Belum</span>';
        return `<tr><td>${i + 1}</td><td>${wjEsc(s.nama)}</td><td>${lencana}</td>
          <td class="wj-sel-aksi"><button type="button" class="alt" onclick="wjGuruFotoSiswa('${wjEsc(s.id)}')" title="Daftarkan lewat foto">📷</button>
          ${s.n_daftar || s.n_belajar || s.pengajuan ? `<button type="button" class="alt danger" onclick="wjGuruHapus('${wjEsc(s.id)}')" title="Hapus data wajah">🗑️</button>` : ''}</td></tr>`;
      }).join('');
      box.innerHTML = `<p class="mu">Kelas ${wjEsc(S.kelas)}: <b>${terdaftar}</b> dari ${S.siswa.length} siswa sudah terdaftar.</p>
        <div class="tbl-scroll"><table><thead><tr><th>No</th><th>Nama</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${baris}</tbody></table></div>`;
    }

    function wjGuruFotoSiswa(id) {
      WJ.guru.fotoUntuk = id;
      const inp = wjId('wjFileSiswa'); inp.value = ''; inp.click();
    }

    async function wjGuruFotoSiswaProses(file) {
      const id = WJ.guru.fotoUntuk; if (!id) return;
      wjToast('Memproses foto…', 8000);
      try {
        await wjMuatMesin(t => wjToast(t, 20000));
        const k = await wjFileKeKanvas(file, 1280);
        const res = await faceapi.detectAllFaces(k, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks().withFaceDescriptors();
        if (!res.length) return alert('Wajah tidak terdeteksi pada foto ini.');
        res.sort((a, b) => b.detection.box.area - a.detection.box.area);
        if (res.length > 1 && !confirm(`Ada ${res.length} wajah di foto. Yang dipakai wajah terbesar. Lanjutkan?`)) return;
        const r = await wjAPI('impor', { data: [{ siswa_id: id, descriptor: Array.from(res[0].descriptor) }] });
        if (r.penuh && r.penuh.length) alert('Data wajah siswa ini sudah penuh (5). Hapus dulu bila ingin mengganti.');
        else wjToast('Wajah tersimpan.');
        wjGuruStatusKelas();
      } catch (e) { alert('Gagal: ' + e.message); }
    }

    async function wjGuruHapus(id) {
      const s = WJ.guru.status && WJ.guru.status.siswa.find(x => String(x.id) === String(id));
      if (!confirm(`Hapus semua data wajah ${s ? s.nama : 'siswa ini'}?\n\nSiswa perlu mendaftar ulang agar bisa dikenali.`)) return;
      try { await wjAPI('hapus', { siswa_id: id }); wjGuruStatusKelas(); }
      catch (e) { alert('Gagal: ' + e.message); }
    }

    async function wjImporMassal(files) {
      const lap = wjId('wjImporLaporan'), kelas = wjId('wjIKelas').value;
      lap.textContent = 'Menyiapkan…';
      try {
        await wjMuatMesin(t => { lap.textContent = t; });
        const st = await wjAPI('status_kelas', { kelas });
        const siswa = st.siswa || [];
        if (!siswa.length) { lap.textContent = 'Kelas ini belum punya siswa.'; return; }
        const kirim = [], tdkCocok = [], tdkWajah = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          lap.textContent = `Memproses ${i + 1}/${files.length}: ${f.name}`;
          const s = wjCariSiswa(f.name, siswa);
          if (!s) { tdkCocok.push(f.name); continue; }
          try {
            const k = await wjFileKeKanvas(f, 1280);
            const res = await faceapi.detectAllFaces(k, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks().withFaceDescriptors();
            if (!res.length) { tdkWajah.push(f.name); continue; }
            res.sort((a, b) => b.detection.box.area - a.detection.box.area);
            kirim.push({ siswa_id: s.id, descriptor: Array.from(res[0].descriptor).map(x => Math.round(x * 1e4) / 1e4), nama: s.nama });
          } catch (_) { tdkWajah.push(f.name); }
        }
        let ok = 0; const penuh = [];
        for (let i = 0; i < kirim.length; i += 20) {
          const bagian = kirim.slice(i, i + 20);
          const r = await wjAPI('impor', { data: bagian.map(x => ({ siswa_id: x.siswa_id, descriptor: x.descriptor })) }, { timeout: 60000 });
          ok += r.ok || 0;
          (r.penuh || []).forEach(id => { const x = bagian.find(y => y.siswa_id === id); if (x) penuh.push(x.nama); });
        }
        const li = (a) => a.map(wjEsc).join(', ');
        lap.innerHTML = `✅ ${ok} foto berhasil didaftarkan.`
          + (tdkCocok.length ? `<br>❓ Nama file tidak cocok dengan siswa kelas ${wjEsc(kelas)} (${tdkCocok.length}): ${li(tdkCocok)}` : '')
          + (tdkWajah.length ? `<br>❌ Wajah tidak terdeteksi (${tdkWajah.length}): ${li(tdkWajah)}` : '')
          + (penuh.length ? `<br>⏭️ Dilewati, data wajah sudah penuh: ${li(penuh)}` : '');
        if (WJ.guru.status && WJ.guru.status.kelas === kelas) wjGuruStatusKelas();
      } catch (e) { lap.textContent = '⚠️ ' + e.message; }
    }

    // ================= GURU: ABSEN WAJAH (modal di Jadwal & Hadir) =================
    function wjBuatModal() {
      if (wjId('wjModal')) return;
      const el = document.createElement('div');
      el.id = 'wjModal'; el.className = 'modal hidden';
      el.innerHTML = `<div class="modal-box wj-modal-box">
        <div class="modal-bar"><b id="wjModalJudul">📷 Absen wajah</b><div class="modal-actions"><button type="button" class="alt" onclick="wjTutupAbsen()">✖ Tutup</button></div></div>
        <div class="modal-body" id="wjModalBody"></div></div>`;
      document.body.appendChild(el);
    }

    function wjBukaAbsen() {
      const a = hdAbsen; if (!a) return;
      wjBuatModal();
      WJ.abs = { ref: a, data: null, dikenali: new Map(), faces: 0, foto: 0, sibuk: false, video: null };
      wjId('wjModalJudul').textContent = `📷 Absen wajah • Kelas ${a.kelas}`;
      const S = WJ.set;
      wjId('wjModalBody').innerHTML = `
        <div id="wjAbsInfo" class="mu"></div>
        <div class="wj-aksi">
          <button type="button" id="wjBtnFoto" onclick="wjPilihFoto('kamera')" disabled>📷 Foto kelompok</button>
          <button type="button" class="alt" id="wjBtnGaleri" onclick="wjPilihFoto('galeri')" disabled>🖼️ Dari galeri</button>
          <button type="button" class="alt" id="wjBtnVideo" onclick="wjMulaiVideo()" disabled>🎥 Sapu video</button>
        </div>
        <input type="file" id="wjFileKam" accept="image/*" capture="environment" class="hidden">
        <input type="file" id="wjFileGal" accept="image/*" multiple class="hidden">
        <div id="wjVideoPanel" class="hidden">
          <div class="wj-vwrap"><video id="wjVid" playsinline muted autoplay></video><canvas id="wjVov"></canvas></div>
          <div class="wj-aksi"><span id="wjVStat" class="mu" style="flex:1;">Menyalakan kamera…</span><button type="button" class="alt danger" onclick="wjHentiVideo()">⏹ Selesai</button></div>
          <p class="mu" style="font-size:0.8rem;">Gerakkan kamera pelan dan berhenti 1–2 detik di tiap kelompok. Kuning = sedang dipastikan, hijau = tercatat. Jangkauan video lebih pendek daripada foto (±3–4 m), jadi berjalanlah ke tengah kelas untuk baris belakang.</p>
        </div>
        <div id="wjAbsProg" class="wj-pesan"></div>
        <div id="wjAbsRingkas" class="wj-ringkas"></div>
        <div id="wjAbsDaftar"></div>
        <details class="wj-set"><summary>⚙️ Pengaturan deteksi</summary>
          <label class="mu">Ambang kecocokan: <b id="wjValTh">${S.th.toFixed(2)}</b> <small>(lebih kecil = lebih ketat, lebih sedikit salah kenal)</small></label>
          <input type="range" id="wjSetTh" min="0.40" max="0.60" step="0.01" value="${S.th}">
          <label class="mu">Sensitivitas deteksi wajah</label>
          <select id="wjSetConf">${[[0.3, 'Tinggi (lebih banyak wajah tertangkap)'], [0.4, 'Sedang'], [0.55, 'Rendah (lebih sedikit salah deteksi)']].map(([v, t]) => `<option value="${v}" ${S.conf === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <label class="mu">Mode deteksi</label>
          <select id="wjSetGrid">${[[1, 'Cepat (seluruh foto sekaligus)'], [2, 'Detail 2×2 (disarankan)'], [3, 'Sangat detail 3×3 (lambat)']].map(([v, t]) => `<option value="${v}" ${S.grid === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <label class="mu">Resolusi proses foto</label>
          <select id="wjSetDim">${[[2000, '2000 px (disarankan)'], [2800, '2800 px (lebih detail, lambat)'], [4000, '4000 px (jangkauan terjauh, paling lambat)']].map(([v, t]) => `<option value="${v}" ${S.dim === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </details>
        <div class="wj-terap">
          <label class="wj-cek"><input type="checkbox" id="wjCekAlpa" ${S.alpa ? 'checked' : ''}> Tandai siswa yang belum terdeteksi sebagai <b>Alpa (A)</b></label>
          <label class="wj-cek"><input type="checkbox" id="wjCekBelajar" ${S.belajar ? 'checked' : ''}> Pelajari wajah yang dikenali dengan sangat yakin (akurasi naik di pertemuan berikutnya)</label>
          <button type="button" class="ok" id="wjBtnTerapkan" onclick="wjTerapkan()" style="width:100%;">✅ Terapkan ke daftar absen</button>
          <p class="mu" style="font-size:0.78rem;">Setelah diterapkan, periksa daftar lalu tekan <b>💾 Simpan absen</b> seperti biasa.</p>
        </div>
        <div id="wjAbsKanvas"></div>`;
      wjId('wjSetTh').oninput = e => { WJ.set.th = +e.target.value; wjId('wjValTh').textContent = WJ.set.th.toFixed(2); wjSimpanSet(); };
      wjId('wjSetConf').onchange = e => { WJ.set.conf = +e.target.value; wjSimpanSet(); };
      wjId('wjSetGrid').onchange = e => { WJ.set.grid = +e.target.value; wjSimpanSet(); };
      wjId('wjSetDim').onchange = e => { WJ.set.dim = +e.target.value; wjSimpanSet(); };
      wjId('wjCekAlpa').onchange = e => { WJ.set.alpa = e.target.checked; wjSimpanSet(); };
      wjId('wjCekBelajar').onchange = e => { WJ.set.belajar = e.target.checked; wjSimpanSet(); };
      wjId('wjFileKam').addEventListener('change', e => { if (e.target.files.length) wjProsesFoto([...e.target.files]); });
      wjId('wjFileGal').addEventListener('change', e => { if (e.target.files.length) wjProsesFoto([...e.target.files]); });
      wjId('wjModal').classList.remove('hidden');
      document.body.classList.add('wj-kunci');
      wjSiapkanAbsen();
    }

    async function wjSiapkanAbsen() {
      const A = WJ.abs, prog = (t) => { const el = wjId('wjAbsProg'); if (el && WJ.abs === A) el.textContent = t || ''; };
      prog('Menyiapkan data wajah kelas dan model…');
      try {
        const [d] = await Promise.all([wjAPI('data_kelas', { kelas: A.ref.kelas }, { timeout: 40000 }), wjMuatMesin(prog)]);
        if (WJ.abs !== A) return;
        A.data = d.siswa || [];
      } catch (e) { prog('⚠️ ' + e.message); return; }
      const punya = A.data.filter(s => s.d.length).length;
      if (!punya) {
        prog('Belum ada siswa kelas ini yang punya data wajah. Minta siswa mendaftar di menu Wajahku lalu setujui di tab Wajah, atau daftarkan lewat tab Wajah.');
      } else {
        prog('');
        ['wjBtnFoto', 'wjBtnGaleri', 'wjBtnVideo'].forEach(id => { const b = wjId(id); if (b) b.disabled = false; });
      }
      wjRenderAbs();
    }

    function wjRenderAbs() {
      const A = WJ.abs; if (!A || !A.data) return;
      const punya = A.data.filter(s => s.d.length), tanpa = A.data.filter(s => !s.d.length);
      wjId('wjAbsInfo').textContent = `${A.data.length} siswa • ${punya.length} punya data wajah`;
      wjId('wjAbsRingkas').innerHTML = `<span class="badge">${A.foto} foto/rekaman</span><span class="badge">${A.faces} wajah terlihat</span><span class="badge ok">${A.dikenali.size} dikenali</span>`;
      const dikenali = A.data.filter(s => A.dikenali.has(s.id)), belum = punya.filter(s => !A.dikenali.has(s.id));
      let h = '';
      if (dikenali.length) h += `<div class="wj-grup"><b>✅ Terdeteksi (${dikenali.length})</b> <small class="mu">ketuk untuk membatalkan</small><div class="wj-chips">${dikenali.map(s => {
        const k = A.dikenali.get(s.id);
        return `<button type="button" class="wj-chip ok" onclick="wjLepas('${wjEsc(s.id)}')">${wjEsc(s.nama)} <small>${k.manual ? 'manual' : k.d.toFixed(2)}</small> ✕</button>`;
      }).join('')}</div></div>`;
      if (belum.length) h += `<div class="wj-grup"><b>⬜ Belum terdeteksi (${belum.length})</b> <small class="mu">ketuk nama untuk menandai hadir manual</small><div class="wj-chips">${belum.map(s =>
        `<button type="button" class="wj-chip" onclick="wjManual('${wjEsc(s.id)}')">＋ ${wjEsc(s.nama)}</button>`).join('')}</div></div>`;
      if (tanpa.length) h += `<div class="wj-grup"><b>Belum punya data wajah (${tanpa.length})</b> <small class="mu">statusnya tidak diubah otomatis</small><div class="wj-chips">${tanpa.map(s => `<span class="wj-chip mati">${wjEsc(s.nama)}</span>`).join('')}</div></div>`;
      wjId('wjAbsDaftar').innerHTML = h;
    }

    function wjManual(id) { const A = WJ.abs; if (!A) return; A.dikenali.set(id, { d: 0, desc: null, manual: true }); wjRenderAbs(); }
    function wjLepas(id) { const A = WJ.abs; if (!A) return; A.dikenali.delete(id); if (A.video) delete A.video.suara[id]; wjRenderAbs(); }

    function wjPilihFoto(jenis) { const el = wjId(jenis === 'kamera' ? 'wjFileKam' : 'wjFileGal'); el.value = ''; el.click(); }

    function wjCatatDikenali(A, sid, d, desc) {
      const lama = A.dikenali.get(sid);
      if (!lama || lama.manual || d < lama.d) A.dikenali.set(sid, { d, desc, manual: false });
    }

    async function wjProsesFoto(files) {
      const A = WJ.abs; if (!A || A.sibuk || !A.data) return;
      A.sibuk = true;
      const prog = wjId('wjAbsProg'), { th, conf, grid, dim } = WJ.set;
      for (let i = 0; i < files.length; i++) {
        prog.textContent = `Memproses foto ${i + 1}/${files.length}… (bisa beberapa detik)`;
        await wjTunggu(30);
        try {
          const t0 = performance.now();
          const kanvas = await wjFileKeKanvas(files[i], dim);
          const wajah = await wjDeteksi(kanvas, grid, conf);
          const cocok = wjCocokkan(wajah, A.data, th);
          let baru = 0;
          for (const p of Object.values(cocok)) { if (!A.dikenali.has(p.sid)) baru++; wjCatatDikenali(A, p.sid, p.d, wajah[p.fi].descriptor); }
          A.foto++; A.faces += wajah.length;
          wjGambarHasil(kanvas, wajah, cocok, A);
          prog.textContent = `Foto ${A.foto}: ${wajah.length} wajah, ${Object.keys(cocok).length} dikenali, ${baru} baru hadir • ${((performance.now() - t0) / 1000).toFixed(1)} dtk`;
        } catch (e) { console.error(e); prog.textContent = '❌ Gagal memproses foto: ' + e.message; }
        wjRenderAbs();
      }
      A.sibuk = false;
    }

    function wjGambarHasil(kanvas, wajah, cocok, A) {
      const out = document.createElement('canvas'); out.width = kanvas.width; out.height = kanvas.height; out.className = 'wj-hasil';
      const g = out.getContext('2d'); g.drawImage(kanvas, 0, 0);
      const lw = Math.max(2, kanvas.width / 450), fs = Math.max(14, Math.round(kanvas.width / 70));
      g.font = `600 ${fs}px -apple-system, sans-serif`; g.textBaseline = 'bottom';
      wajah.forEach((f, fi) => {
        const p = cocok[fi], b = f.box;
        let warna = '#d1343e', label = '?';
        if (p) { warna = '#1a8f4c'; const s = A.data.find(x => x.id === p.sid); label = String(s ? s.nama : '').split(' ')[0] + ' ' + p.d.toFixed(2); }
        else if (b.w < 60) { warna = '#d97706'; label = '? kecil'; }
        g.lineWidth = lw; g.strokeStyle = warna; g.strokeRect(b.x, b.y, b.w, b.h);
        const tw = g.measureText(label).width + fs * 0.5, ty = Math.max(fs * 1.25, b.y);
        g.fillStyle = warna; g.fillRect(b.x, ty - fs * 1.25, tw, fs * 1.25);
        g.fillStyle = '#fff'; g.fillText(label, b.x + fs * 0.25, ty - fs * 0.12);
      });
      const cap = document.createElement('p'); cap.className = 'mu'; cap.style.margin = '10px 0 0';
      cap.textContent = `Foto ${A.foto}: hijau = dikenali, merah = tidak dikenali, oranye = wajah terlalu kecil`;
      wjId('wjAbsKanvas').append(cap, out);
    }

    // ---------- Sapu video ----------
    function wjBunyi() {
      try {
        const a = WJ.audio; if (!a) return;
        const o = a.createOscillator(), g = a.createGain();
        o.frequency.value = 1046; g.gain.setValueAtTime(0.15, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.15);
        o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 0.16);
      } catch (_) {}
    }

    async function wjMulaiVideo() {
      const A = WJ.abs; if (!A || A.sibuk || !A.data) return;
      try { WJ.audio = WJ.audio || new (window.AudioContext || window.webkitAudioContext)(); WJ.audio.resume(); } catch (_) {}
      try { await wjNyalakanKamera('wjVid', 'environment'); }
      catch (e) { return alert('Kamera tidak bisa dibuka: ' + e.message); }
      A.sibuk = true;
      A.video = { jalan: true, suara: {}, frame: 0, timer: null, kanvas: document.createElement('canvas') };
      wjId('wjVideoPanel').classList.remove('hidden');
      try { if (navigator.wakeLock) WJ.wake = await navigator.wakeLock.request('screen'); } catch (_) {}
      wjVideoLoop();
    }

    async function wjVideoLoop() {
      const A = WJ.abs; if (!A || !A.video || !A.video.jalan) return;
      const V = A.video, vid = wjId('wjVid'), t0 = performance.now();
      try {
        const w = vid.videoWidth, h = vid.videoHeight;
        if (w && h) {
          if (V.kanvas.width !== w) { V.kanvas.width = w; V.kanvas.height = h; }
          V.kanvas.getContext('2d').drawImage(vid, 0, 0, w, h);
          const wajah = await wjDeteksi(V.kanvas, Math.min(WJ.set.grid, 2), WJ.set.conf);
          if (!A.video || !A.video.jalan) return;
          const cocok = wjCocokkan(wajah, A.data, WJ.set.th);
          V.frame++;
          let berubah = false;
          for (const p of Object.values(cocok)) {
            const s = V.suara[p.sid] || (V.suara[p.sid] = { n: 0, d: Infinity, desc: null });
            s.n++;
            if (p.d < s.d) { s.d = p.d; s.desc = wajah[p.fi].descriptor; }
            const ada = A.dikenali.get(p.sid);
            if (ada) { if (!ada.manual && p.d < ada.d) { ada.d = p.d; ada.desc = s.desc; } }
            else if (s.n >= WJ_VIDEO_SUARA) { A.dikenali.set(p.sid, { d: s.d, desc: s.desc, manual: false }); berubah = true; wjBunyi(); }
          }
          if (berubah) wjRenderAbs();
          wjGambarOverlay(wajah, cocok, A, w, h);
          wjId('wjVStat').textContent = `${wajah.length} wajah di layar • dikenali ${A.dikenali.size}/${A.data.filter(s => s.d.length).length} • ${Math.round(performance.now() - t0)} ms/frame`;
        }
      } catch (e) { console.error(e); const el = wjId('wjVStat'); if (el) el.textContent = '⚠️ ' + e.message; }
      if (A.video && A.video.jalan) V.timer = setTimeout(wjVideoLoop, Math.max(60, WJ_VIDEO_JEDA - (performance.now() - t0)));
    }

    function wjGambarOverlay(wajah, cocok, A, w, h) {
      const ov = wjId('wjVov'); if (!ov) return;
      if (ov.width !== w) { ov.width = w; ov.height = h; }
      const g = ov.getContext('2d'); g.clearRect(0, 0, w, h);
      const lw = Math.max(2, w / 320), fs = Math.max(16, Math.round(w / 45));
      g.font = `600 ${fs}px -apple-system, sans-serif`; g.textBaseline = 'bottom';
      wajah.forEach((f, fi) => {
        const p = cocok[fi], b = f.box;
        let warna = 'rgba(209,52,62,.9)', label = '?';
        if (p) {
          const s = A.data.find(x => x.id === p.sid), ok = A.dikenali.has(p.sid);
          warna = ok ? 'rgba(26,143,76,.95)' : 'rgba(234,179,8,.95)';
          label = String(s ? s.nama : '').split(' ')[0] + (ok ? ' ✓' : ' …');
        }
        g.lineWidth = lw; g.strokeStyle = warna; g.strokeRect(b.x, b.y, b.w, b.h);
        const tw = g.measureText(label).width + fs * 0.5, ty = Math.max(fs * 1.25, b.y);
        g.fillStyle = warna; g.fillRect(b.x, ty - fs * 1.25, tw, fs * 1.25);
        g.fillStyle = '#fff'; g.fillText(label, b.x + fs * 0.25, ty - fs * 0.12);
      });
    }

    function wjHentiVideo() {
      const A = WJ.abs;
      if (A && A.video) { A.video.jalan = false; clearTimeout(A.video.timer); }
      wjMatikanKamera();
      try { if (WJ.wake) WJ.wake.release(); } catch (_) {} WJ.wake = null;
      const p = wjId('wjVideoPanel'); if (p) p.classList.add('hidden');
      if (A) {
        if (A.video) { A.foto++; A.faces += 0; wjId('wjAbsProg').textContent = `Sapu video selesai: ${A.video.frame} frame diproses, ${A.dikenali.size} siswa dikenali.`; A.video = null; }
        A.sibuk = false; wjRenderAbs();
      }
    }

    // ---------- Terapkan ke daftar absen yang sedang dibuka ----------
    async function wjTerapkan() {
      const A = WJ.abs, a = hdAbsen;
      if (!A || !a || A.ref !== a) { alert('Daftar absen yang dibuka sudah berganti. Tutup lalu buka lagi.'); return; }
      if (A.sibuk) return alert('Tunggu proses selesai atau tekan Selesai pada video dulu.');
      const alpa = wjId('wjCekAlpa').checked, belajar = wjId('wjCekBelajar').checked;
      const punya = new Map(A.data.map(s => [s.id, s]));
      const tanpa = a.siswa.filter(s => !A.dikenali.has(s.id) && punya.get(s.id) && punya.get(s.id).d.length && s.status === 'H');
      if (alpa && tanpa.length && !confirm(`${tanpa.length} siswa belum terdeteksi dan akan ditandai ALPA (A):\n\n${tanpa.map(s => s.nama).join(', ')}\n\nLanjutkan? (Ubah ke S/I di daftar bila ada keterangan.)`)) return;
      const tandai = new Set(); let nH = 0, nA = 0;
      a.siswa.forEach(s => {
        const k = A.dikenali.get(s.id);
        if (k) {
          if (s.status !== 'H' && s.status !== 'T') { s.status = 'H'; s.keterangan = ''; }
          if (!k.manual) tandai.add(s.id);
          nH++;
        } else if (alpa && tanpa.includes(s)) { s.status = 'A'; nA++; }
      });
      a.ubah = true;
      WJ.tandai = { ref: a, ids: tandai };
      if (belajar) {
        const data = [...A.dikenali].filter(([, k]) => !k.manual && k.desc && k.d <= WJ_AMBANG_BELAJAR)
          .map(([id, k]) => ({ siswa_id: id, descriptor: k.desc.map(x => Math.round(x * 1e4) / 1e4) }));
        if (data.length) wjAPI('belajar', { data }, { timeout: 40000 }).catch(e => console.warn('belajar gagal:', e.message));
      }
      wjTutupAbsen(true);
      jadwalRenderAbsen();
      wjToast(`Diterapkan: ${nH} hadir${nA ? `, ${nA} alpa` : ''}. Periksa daftar lalu tekan Simpan absen.`, 6000);
    }

    function wjTutupAbsen(langsung) {
      const A = WJ.abs;
      if (!langsung && A && A.dikenali.size && !confirm('Hasil deteksi belum diterapkan ke daftar absen. Tutup tanpa menerapkan?')) return;
      if (A && A.video) { A.video.jalan = false; clearTimeout(A.video.timer); }
      wjMatikanKamera();
      try { if (WJ.wake) WJ.wake.release(); } catch (_) {} WJ.wake = null;
      const m = wjId('wjModal'); if (m) m.classList.add('hidden');
      document.body.classList.remove('wj-kunci');
      WJ.abs = null;
    }

    // ================= SAMBUNGAN KE LMS =================
    // Tombol "Absen wajah" + tanda 📷 disuntikkan setiap kali daftar hadir digambar ulang.
    function wjSuntikTombol() {
      const a = hdAbsen, box = wjId('jdAbsen'); if (!a || !box) return;
      const r = box.querySelector('.hd-ringkas'); if (!r) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wj-btn-absen'; b.textContent = '📷 Absen wajah'; b.onclick = wjBukaAbsen;
      r.appendChild(b);
      if (WJ.tandai && WJ.tandai.ref === a) {
        box.querySelectorAll('.hd-siswa').forEach((el, i) => {
          const s = a.siswa[i], n = el.querySelector('.hd-nama');
          if (s && n && WJ.tandai.ids.has(s.id)) n.insertAdjacentHTML('beforeend', ' <span class="wj-tanda" title="Terdeteksi lewat wajah">📷</span>');
        });
      }
    }

    (function wjPasang() {
      if (typeof jadwalRenderAbsen === 'function') {
        const asli = jadwalRenderAbsen;
        jadwalRenderAbsen = function () {
          const r = asli.apply(this, arguments);
          try { wjSuntikTombol(); } catch (e) { console.error(e); }
          return r;
        };
      }
      if (typeof switchTab === 'function') {
        const asli = switchTab;
        switchTab = function (nama) {
          const r = asli.apply(this, arguments);
          if (nama === 'wajah') {
            wjId('navWajah').classList.add('active');
            wjId('tabWajah').classList.remove('hidden');
            wjTabDibuka();
          } else if (WJ.sis.reg) { wjDaftarBatal(true); }
          return r;
        };
      }
      // Menu muncul begitu dashboard tampil (login baru maupun pemulihan sesi)
      const lay = wjId('appLayout'); if (!lay) return;
      const cek = () => {
        if (lay.classList.contains('hidden')) {
          if (WJ.sudahInit) { WJ.sudahInit = false; WJ.sis = { st: null, reg: null, setuju: false }; wjMatikanKamera(); const n = wjId('navWajah'); if (n) n.classList.add('hidden'); }
          return;
        }
        if (typeof activeUser !== 'undefined' && activeUser && !WJ.sudahInit) { WJ.sudahInit = true; wjInit(); }
      };
      new MutationObserver(cek).observe(lay, { attributes: true, attributeFilter: ['class'] });
      cek();
      // Hemat baterai: video berhenti bila halaman disembunyikan
      document.addEventListener('visibilitychange', () => { if (document.hidden && WJ.abs && WJ.abs.video) wjHentiVideo(); });
    })();
