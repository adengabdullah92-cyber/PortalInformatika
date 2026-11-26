// LMS Informatika SMA — js-passkey.js: login dengan passkey (Face ID / sidik jari / PIN HP).
// Server: Edge Function "passkey" (passkey.ts) + tabel passkey_* (passkey.sql).
// Biometrik diproses oleh HP; yang tersimpan di server hanya kunci publik.
// Password TETAP bisa dipakai sebagai cadangan. File ini tambahan: membungkus switchTab saja.

    const PP_URL = `${SUPABASE_URL}/functions/v1/passkey`;
    const PP = { daftar: [], maks: 5, sibuk: false, sudahInit: false };

    const ppId = (id) => document.getElementById(id);
    const ppEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function ppDidukung() {
      return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create && window.isSecureContext);
    }

    // ---------- base64url ----------
    function ppKeBuf(s) {
      const p = String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(s).length % 4)) % 4);
      const bin = atob(p), out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out.buffer;
    }
    function ppKeB64u(buf) {
      let s = ''; const b = new Uint8Array(buf);
      for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    async function ppAPI(aksi, extra = {}) {
      const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 30000);
      try {
        const res = await fetch(PP_URL, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ aksi, token: sesiToken, ...extra })
        });
        let data;
        try { data = await res.json(); } catch (_) { throw new Error('Function "passkey" belum aktif (HTTP ' + res.status + ').'); }
        if (!res.ok || data.error) { const e = new Error(data.error || ('HTTP ' + res.status)); e.status = res.status; throw e; }
        return data;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Server tidak merespons. Periksa koneksi internet.');
        if (/Load failed|Failed to fetch|NetworkError/i.test(e.message || '')) throw new Error('Function "passkey" belum di-deploy atau koneksi terputus.');
        throw e;
      } finally { clearTimeout(tm); }
    }

    function ppPesanGalat(e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return 'Dibatalkan atau waktu habis. Coba lagi.';
      if (e && e.name === 'InvalidStateError') return 'Perangkat ini sudah terdaftar.';
      if (e && e.name === 'SecurityError') return 'Alamat situs tidak cocok dengan pengaturan passkey (periksa secret PASSKEY_ORIGIN).';
      return (e && e.message) || 'Gagal.';
    }

    // ---------- Login (dipanggil dari tombol di halaman login) ----------
    async function ppLogin() {
      const err = ppId('loginErr');
      if (PP.sibuk) return;
      if (!ppDidukung()) { err.textContent = 'Browser ini belum mendukung passkey. Gunakan password.'; return; }
      PP.sibuk = true; err.textContent = 'Menunggu verifikasi di HP…';
      try {
        const { tid, opsi } = await ppAPI('masuk_opsi');
        const cred = await navigator.credentials.get({
          publicKey: {
            challenge: ppKeBuf(opsi.challenge), rpId: opsi.rpId, timeout: opsi.timeout || 120000,
            userVerification: 'required', allowCredentials: []
          }
        });
        if (!cred) throw new Error('Tidak ada passkey yang dipilih.');
        const r = cred.response;
        const data = await ppAPI('masuk_selesai', {
          tid,
          respons: {
            id: cred.id, rawId: ppKeB64u(cred.rawId), type: cred.type,
            response: {
              authenticatorData: ppKeB64u(r.authenticatorData), clientDataJSON: ppKeB64u(r.clientDataJSON),
              signature: ppKeB64u(r.signature), userHandle: r.userHandle ? ppKeB64u(r.userHandle) : undefined
            },
            clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
            authenticatorAttachment: cred.authenticatorAttachment || undefined
          }
        });
        if (data && data.token && data.akun && (data.peran === 'guru' || data.peran === 'siswa')) {
          err.textContent = '';
          sesiToken = data.token;
          activeUser = { ...data.akun, role: data.peran };
          sesiMulai();
          initDashboard();
        } else err.textContent = 'Login passkey gagal.';
      } catch (e) {
        console.error(e);
        err.textContent = ppPesanGalat(e);
      } finally { PP.sibuk = false; }
    }

    // ---------- Daftar passkey (setelah login) ----------
    function ppNamaPerangkat() {
      const u = navigator.userAgent || '';
      if (/iPhone/.test(u)) return 'iPhone';
      if (/iPad/.test(u)) return 'iPad';
      if (/Android/.test(u)) return 'HP Android';
      if (/Macintosh/.test(u)) return 'Mac';
      if (/Windows/.test(u)) return 'Komputer Windows';
      return 'Perangkat';
    }

    async function ppAktifkan() {
      const pesan = ppId('ppPesan'); if (!pesan || PP.sibuk) return;
      if (!ppDidukung()) { pesan.textContent = 'Browser ini belum mendukung passkey (butuh HTTPS dan browser terbaru).'; return; }
      PP.sibuk = true; pesan.textContent = 'Menyiapkan…';
      try {
        const { tid, opsi } = await ppAPI('daftar_opsi');
        const pk = {
          rp: opsi.rp, user: { ...opsi.user, id: ppKeBuf(opsi.user.id) },
          challenge: ppKeBuf(opsi.challenge), pubKeyCredParams: opsi.pubKeyCredParams, timeout: opsi.timeout || 120000,
          attestation: 'none', authenticatorSelection: opsi.authenticatorSelection,
          excludeCredentials: (opsi.excludeCredentials || []).map(c => ({ type: 'public-key', id: ppKeBuf(c.id), transports: c.transports }))
        };
        pesan.textContent = 'Ikuti perintah di HP (Face ID / sidik jari / PIN)…';
        const cred = await navigator.credentials.create({ publicKey: pk });
        if (!cred) throw new Error('Pendaftaran dibatalkan.');
        const r = cred.response;
        await ppAPI('daftar_selesai', {
          tid, nama: ppNamaPerangkat(),
          respons: {
            id: cred.id, rawId: ppKeB64u(cred.rawId), type: cred.type,
            response: {
              clientDataJSON: ppKeB64u(r.clientDataJSON), attestationObject: ppKeB64u(r.attestationObject),
              transports: r.getTransports ? r.getTransports() : []
            },
            clientExtensionResults: cred.getClientExtensionResults ? cred.getClientExtensionResults() : {},
            authenticatorAttachment: cred.authenticatorAttachment || undefined
          }
        });
        pesan.textContent = '✅ Passkey aktif. Lain kali kamu bisa masuk lewat tombol “Masuk dengan passkey”.';
        await ppMuat(true);
      } catch (e) {
        console.error(e);
        pesan.textContent = '⚠️ ' + ppPesanGalat(e);
      } finally { PP.sibuk = false; }
    }

    async function ppHapus(id) {
      if (!confirm('Hapus passkey ini? Perangkat itu tidak bisa lagi dipakai masuk dengan passkey.')) return;
      try { await ppAPI('hapus', { id }); await ppMuat(true); }
      catch (e) { alert('Gagal: ' + e.message); }
    }

    function ppTgl(iso) { try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return ''; } }

    async function ppMuat(diam) {
      const box = ppId('ppIsi'); if (!box) return;
      if (!diam) box.innerHTML = '<p class="mu">Memuat…</p>';
      try {
        const d = await ppAPI('saya');
        PP.daftar = d.daftar || []; PP.maks = d.maks || 5;
        ppRender();
      } catch (e) { box.innerHTML = `<p class="mu">Gagal memuat: ${ppEsc(e.message)}</p><button type="button" class="alt" onclick="ppMuat()">🔄 Coba lagi</button>`; }
    }

    function ppRender() {
      const box = ppId('ppIsi'); if (!box) return;
      const baris = PP.daftar.map(k => `<tr><td>${ppEsc(k.nama)}</td><td>${ppEsc(ppTgl(k.dibuat_at))}</td><td>${k.terakhir_at ? ppEsc(ppTgl(k.terakhir_at)) : '—'}</td>
        <td><button type="button" class="alt danger" onclick="ppHapus('${ppEsc(k.id)}')" title="Hapus">🗑️</button></td></tr>`).join('');
      box.innerHTML = `
        ${PP.daftar.length ? `<p class="mu">Perangkat dengan passkey aktif:</p><div class="tbl-scroll"><table><thead><tr><th>Perangkat</th><th>Dibuat</th><th>Terakhir dipakai</th><th></th></tr></thead><tbody>${baris}</tbody></table></div>`
          : '<p class="mu">Belum ada passkey aktif.</p>'}
        <div class="wj-aksi"><button type="button" onclick="ppAktifkan()" ${PP.daftar.length >= PP.maks ? 'disabled' : ''}>🔑 Aktifkan di perangkat ini</button></div>
        <div id="ppPesan" class="wj-pesan"></div>
        ${ppDidukung() ? '' : '<p class="mu">⚠️ Browser ini belum mendukung passkey. Gunakan Safari/Chrome terbaru lewat HTTPS.</p>'}`;
    }

    function ppBangun() {
      ppId('ppView').innerHTML = `
        <h2>🔑 Login Cepat (Passkey)</h2>
        <p class="mu" style="margin-bottom: 20px;">Masuk ke LMS memakai Face ID, sidik jari, atau PIN HP. Tanpa mengetik password.</p>
        <div class="card"><div id="ppIsi"><p class="mu">Memuat…</p></div></div>
        <div class="card"><div class="wj-info">
          <b>Yang perlu kamu tahu</b>
          <ul>
            <li>Wajah/sidik jarimu <b>tidak dikirim ke LMS</b>. Verifikasi dilakukan oleh HP-mu sendiri.</li>
            <li>Password tetap bisa dipakai kapan saja sebagai cadangan.</li>
            <li>Passkey tersimpan di akun iCloud/Google di HP-mu. Jangan aktifkan di HP yang dipakai bersama orang lain.</li>
            <li>Kehilangan HP? Masuk dengan password, lalu hapus passkey perangkat itu di sini.</li>
          </ul></div></div>`;
    }

    // ---------- Sambungan ke LMS ----------
    (function ppPasang() {
      // Tombol di halaman login hanya muncul bila browser mendukung
      const tombol = ppId('ppBtnLogin');
      if (tombol && ppDidukung()) tombol.classList.remove('hidden');

      if (typeof switchTab === 'function') {
        const asli = switchTab;
        switchTab = function (nama) {
          const r = asli.apply(this, arguments);
          if (nama === 'passkey') {
            ppId('navPasskey').classList.add('active');
            ppId('tabPasskey').classList.remove('hidden');
            ppMuat();
          }
          return r;
        };
      }
      const lay = ppId('appLayout'); if (!lay) return;
      const cek = () => {
        if (lay.classList.contains('hidden')) {
          if (PP.sudahInit) { PP.sudahInit = false; const n = ppId('navPasskey'); if (n) n.classList.add('hidden'); }
          return;
        }
        if (typeof activeUser !== 'undefined' && activeUser && !PP.sudahInit) {
          PP.sudahInit = true; ppBangun(); ppId('navPasskey').classList.remove('hidden');
        }
      };
      new MutationObserver(cek).observe(lay, { attributes: true, attributeFilter: ['class'] });
      cek();
    })();
