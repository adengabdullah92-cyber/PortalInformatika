// LMS Informatika SMA — js-chatbot.js: Tutor siswa & Asisten guru.
// Dipecah dari index.html (2 Nov 2026), isi tidak diubah. File js-*.js dimuat berurutan oleh index.html.
    // ================= CHATBOT: TUTOR SISWA + ASISTEN GURU =================
    // C1: pengingat siswa dihitung server (fungsi SQL siswa_pengingat, chatbot_c1.sql), tanpa AI.
    // C2: tanya-jawab siswa dengan Tutor AI lewat Edge Function "chatbot" (kuota, kunci saat kuis, log dicek server).
    // C3: Asisten AI untuk guru (data kelas dianonimkan sebelum dikirim ke AI) + riwayat chat siswa per kelas.
    const CHAT_URL = `${SUPABASE_URL}/functions/v1/chatbot`;
    let chatData = null;            // pengingat siswa
    let chatMemuat = false;
    let chatPesan = [];             // percakapan: {dari: 'pengguna'|'ai'|'galat', isi, sumber}
    let chatInfo = null;            // {sisa, batas, terkunci}
    let chatRiwayatSiap = false;
    let chatMengirim = false;
    let chatMode = 'asisten';       // guru: 'asisten' | 'siswa'
    let chatSiswaData = null;       // guru: hasil guru_chat_siswa

    function chatAktif() { return !!(activeUser && (activeUser.role === 'siswa' || activeUser.role === 'guru')); }
    function chatGuru() { return !!(activeUser && activeUser.role === 'guru'); }
    function chatTerbuka() { return !$id('chatPanel').classList.contains('hidden'); }

    // Tombol disembunyikan saat siswa mengerjakan kuis/Lab (supaya tidak menutupi tombol Blockly).
    // Guru: tombol di kiri bawah; naik bila tombol keranjang paket tampil di HP.
    function chatFabCek() {
      const fab = $id('chatFab'); if (!fab) return;
      const sibuk = (typeof sesi !== 'undefined' && sesi) || (typeof labS !== 'undefined' && labS && labS.ws);
      fab.classList.toggle('hidden', !chatAktif() || !!sibuk || chatTerbuka());
      fab.classList.toggle('guru', chatGuru());
      const lbl = $id('chatFabLabel'); if (lbl) lbl.textContent = chatGuru() ? 'Asisten' : 'Tutor';
      const kj = $id('keranjangFab');
      fab.classList.toggle('naik', chatGuru() && kj && !kj.classList.contains('hidden') && window.innerWidth <= 640);
    }
    setInterval(chatFabCek, 1000);

    function chatSiapkanPanel() {
      const g = chatGuru();
      $id('chatFabLabel').textContent = g ? 'Asisten' : 'Tutor';
      $id('chatJudul').textContent = g ? '💬 Asisten Guru' : '💬 Tutor Informatika';
      $id('chatInfoTeks').textContent = g
        ? '🔒 Data siswa dikirim ke AI tanpa nama. Asisten hanya membaca data, tidak mengubah apa pun.'
        : '🔒 Percakapan dengan Tutor bisa dibaca oleh gurumu.';
      $id('chatAlat').classList.toggle('hidden', !g);
      $id('chatInput').maxLength = g ? 2000 : 500;
      if (g) {
        const kelasOpsi = DAFTAR_KELAS.map(k => `<option value="${k}">Kelas ${k}</option>`).join('');
        const kSel = $id('chatKelas'), kLama = kSel.value;
        kSel.innerHTML = '<option value="">Tanpa data kelas</option>' + kelasOpsi;
        kSel.value = kLama;
        const ksSel = $id('chatKelasSiswa'), ksLama = ksSel.value;
        ksSel.innerHTML = kelasOpsi; if (ksLama) ksSel.value = ksLama;
        const pSel = $id('chatPaket'), pLama = pSel.value;
        const pakets = ((bankState.paket && bankState.paket.items) || []).filter(x => !x.diarsipkan);
        pSel.innerHTML = '<option value="">Tanpa paket kuis</option>' + pakets.map(x => `<option value="${escHtml(String(x.id))}">${escHtml(x.judul || 'Paket ' + x.id)}</option>`).join('');
        pSel.value = pLama;
      }
    }

    function chatBadge() {
      const b = $id('chatBadge'); if (!b) return;
      const n = !chatGuru() && chatData ? (chatData.kuis.length + chatData.tugas.length + chatData.materi.length) : 0;
      b.textContent = n > 99 ? '99+' : String(n);
      b.classList.toggle('hidden', n === 0);
    }

    async function chatMuat() {
      if (!activeUser || activeUser.role !== 'siswa' || chatMemuat) return;
      chatMemuat = true;
      try {
        const r = await db.rpc('siswa_pengingat', { p_token: sesiToken });
        if (r.error) {
          if (galatSesi(r.error.message)) return sesiHabis();
          throw r.error;
        }
        chatData = { kuis: [], tugas: [], materi: [], ...(r.data || {}) };
      } catch (e) {
        chatData = { kuis: [], tugas: [], materi: [], galat: e.message || String(e) };
      } finally { chatMemuat = false; }
      chatBadge();
      if (chatTerbuka()) chatRender();
    }

    async function chatAPI(aksi, extra = {}) {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 70000);
      try {
        const res = await fetch(CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({ aksi, token: sesiToken, ...extra }),
          signal: ctrl.signal
        });
        let data;
        try { data = await res.json(); } catch (_) { throw new Error('Chat belum aktif di server (HTTP ' + res.status + ').'); }
        if (res.status === 401) sesiHabis(data.error);
        if (!res.ok || data.error) {
          const e = new Error((data.error || ('HTTP ' + res.status)) + (/Aksi tidak dikenal/.test(data.error || '') ? ' (deploy ulang Edge Function chatbot versi terbaru)' : ''));
          e.status = res.status; throw e;
        }
        return data;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Server tidak merespons. Periksa internet lalu coba lagi.');
        if (/Load failed|Failed to fetch|NetworkError/i.test(e.message || '')) throw new Error('Koneksi terputus. Periksa internet lalu coba lagi.');
        throw e;
      } finally { clearTimeout(tm); }
    }

    async function chatMuatRiwayat() {
      try {
        const d = await chatAPI(chatGuru() ? 'guru_riwayat' : 'riwayat');
        chatPesan = (d.pesan || []).map(p => ({ dari: p.dari, isi: p.isi, sumber: p.sumber || [] }));
        chatInfo = { sisa: d.sisa, batas: d.batas, terkunci: !!d.terkunci };
        chatRiwayatSiap = true;
      } catch (e) {
        chatInfo = { sisa: 0, batas: 0, terkunci: false, galat: e.message };
      }
      if (chatTerbuka()) chatRender();
    }

    // Teks AI → HTML aman: escape dulu, lalu **tebal**, `kode`, dan baris baru
    function chatFormat(t) {
      return escHtml(t)
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }

    function chatPengingatHTML() {
      const d = chatData;
      const nama = String((d && d.nama) || activeUser.nama || '').split(' ')[0];
      if (!d) return `<div class="chat-bubble chat-ai">Halo, <b>${escHtml(nama)}</b>! 👋 Memuat pengingat…</div>`;
      if (d.galat) return `<div class="chat-bubble chat-ai">Halo, <b>${escHtml(nama)}</b>! 👋 Pengingat belum bisa dimuat: ${escHtml(d.galat)}</div>`;
      const daftar = (judul, items, isi) => items.length ? `<div class="chat-bubble chat-ai"><h4>${judul}</h4>${items.map(isi).join('')}</div>` : '';
      const total = d.kuis.length + d.tugas.length + d.materi.length;
      let h = `<div class="chat-bubble chat-ai">Halo, <b>${escHtml(nama)}</b>! 👋 ${total
        ? 'Ini yang masih menunggumu:' : 'Semua kuis, tugas Lab, dan materi untuk kelasmu sudah beres. Mantap! 🎉'}</div>`;
      h += daftar('📝 Kuis yang perlu dikerjakan', d.kuis, k => `
        <div class="chat-item"><span>${escHtml(k.judul)}${k.jenis === 'ulangan' ? ' <span class="badge warn">Ulangan</span>' : ''}
          <small>${k.aktif ? 'Sedang dikerjakan' : (k.tutup_at ? 'Tutup ' + escHtml(tglPendek(k.tutup_at)) : 'Tanpa batas waktu')}</small></span>
          <button type="button" class="alt" onclick="chatKe('kuis')">${k.aktif ? 'Lanjutkan' : 'Buka'}</button></div>`);
      h += daftar('🧩 Tugas Lab belum dikirim', d.tugas, t => `
        <div class="chat-item"><span>${escHtml(t.judul)}${t.topik ? `<small>${escHtml(t.topik)}</small>` : ''}</span>
          <button type="button" class="alt" onclick="chatKe('lab', '${escHtml(String(t.id))}')">Kerjakan</button></div>`);
      h += daftar('📖 Materi belum ditandai dibaca', d.materi, m => `
        <div class="chat-item"><span>${escHtml(m.judul)}</span>
          <button type="button" class="alt" onclick="chatKe('materi', '${escHtml(String(m.id))}')">Baca</button></div>`);
      return h;
    }

    const CHAT_CEPAT = [
      ['Ringkas kondisi kelas', 'Ringkas kondisi kelas ini: apa yang sudah baik, apa yang perlu segera ditindaklanjuti.'],
      ['Rencana remedial', 'Susun rencana remedial singkat untuk topik yang paling lemah, termasuk aktivitas 1 pertemuan.'],
      ['Yang bikin bingung siswa', 'Dari pertanyaan siswa ke Tutor, konsep apa yang paling sering membingungkan? Beri saran cara menjelaskannya.'],
      ['Draf pengingat', 'Buat draf pesan singkat untuk grup kelas yang mengingatkan kuis dan tugas Lab yang belum dikerjakan.']
    ];

    function chatPercakapanHTML() {
      return chatPesan.map(p => {
        if (p.dari === 'pengguna') return `<div class="chat-bubble chat-saya">${escHtml(p.isi)}</div>`;
        if (p.dari === 'galat') return `<div class="chat-bubble chat-kunci">⚠️ ${escHtml(p.isi)}</div>`;
        const sumber = (p.sumber || []).length ? `<small class="chat-sumber">📚 ${p.sumber.map(escHtml).join(' • ')}</small>` : '';
        return `<div class="chat-bubble chat-ai">${chatFormat(p.isi)}${sumber}</div>`;
      }).join('') + (chatMengirim ? `<div class="chat-bubble chat-ai chat-mengetik">${chatGuru() ? 'Asisten' : 'Tutor'} sedang berpikir…</div>` : '');
    }

    function chatGuruSiswaHTML() {
      const d = chatSiswaData;
      if (!d) return '<p class="mu">Memuat chat siswa…</p>';
      if (d.galat) return `<div class="chat-bubble chat-kunci">⚠️ ${escHtml(d.galat)}</div>`;
      if (!d.siswa.length) return `<div class="chat-bubble">Belum ada siswa kelas ${escHtml(d.kelas)} yang bertanya ke Tutor dalam ${d.hari} hari terakhir.</div>`;
      return `<div class="chat-bubble"><b>${d.total_tanya}</b> pertanyaan dari <b>${d.siswa.length}</b> siswa kelas ${escHtml(d.kelas)} (${d.hari} hari terakhir).</div>` +
        d.siswa.map(x => `<details class="chat-bubble chat-siswa"><summary><span>${escHtml(x.nama)}</span><span class="mu">${x.jumlah_tanya} tanya • ${escHtml(tglPendek(x.terakhir))}</span></summary>
          ${x.pesan.map(p => p.dari === 'pengguna'
            ? `<div class="chat-bubble chat-saya">${escHtml(p.isi)}<small class="chat-sumber">${escHtml(tglPendek(p.waktu))}</small></div>`
            : `<div class="chat-bubble chat-ai">${chatFormat(p.isi)}${(p.sumber || []).length ? `<small class="chat-sumber">📚 ${p.sumber.map(escHtml).join(' • ')}</small>` : ''}</div>`).join('')}
        </details>`).join('');
    }

    function chatRender() {
      const box = $id('chatIsi'); if (!box) return;
      const g = chatGuru();
      const form = $id('chatInput').closest('form');
      let h = '';

      if (g && chatMode === 'siswa') {
        form.classList.add('hidden');
        box.innerHTML = chatGuruSiswaHTML();
        return;
      }
      form.classList.remove('hidden');

      let terkunci = false;
      if (g) {
        if (!chatPesan.length) {
          h += `<div class="chat-bubble chat-ai">Halo, <b>${escHtml(String(activeUser.nama || '').split(' ')[0])}</b>! Pilih kelas (dan paket kuis bila perlu) di atas supaya saya bisa membaca datanya, lalu tanyakan apa saja.
            <div class="chat-cepat">${CHAT_CEPAT.map((c, i) => `<button type="button" class="alt" onclick="chatCepat(${i})">${escHtml(c[0])}</button>`).join('')}</div></div>`;
        }
      } else {
        h += chatPengingatHTML();
        terkunci = !!((chatInfo && chatInfo.terkunci) || (chatData && chatData.terkunci));
        if (!chatPesan.length) {
          h += `<div class="chat-bubble chat-ai">💡 Bingung soal materi? Tanyakan di bawah. Aku akan membantumu berpikir lewat petunjuk dan contoh, bukan memberi jawaban jadi untuk tugas atau kuis.</div>`;
        }
      }
      h += chatPercakapanHTML();
      if (terkunci) h += `<div class="chat-bubble chat-kunci">⏳ Kamu sedang mengerjakan kuis. Tanya-jawab dengan Tutor dibuka lagi setelah kuismu dikirim.</div>`;
      box.innerHTML = h;
      box.scrollTop = box.scrollHeight;

      const inp = $id('chatInput'), btn = $id('chatKirimBtn');
      const habis = chatInfo && !chatInfo.galat && chatInfo.sisa <= 0;
      const siap = chatRiwayatSiap && !terkunci && !habis && !chatMengirim;
      inp.disabled = !siap; btn.disabled = !siap;
      inp.placeholder = !chatRiwayatSiap ? (chatInfo && chatInfo.galat ? chatInfo.galat : 'Memuat…')
        : terkunci ? 'Tutor ditutup selama kuis'
        : habis ? 'Jatah pertanyaan hari ini habis'
        : g ? 'Tanya Asisten…' : `Tulis pertanyaanmu… (sisa ${chatInfo.sisa} hari ini)`;
    }

    async function chatKirim() {
      const inp = $id('chatInput');
      const isi = (inp.value || '').trim();
      const g = chatGuru();
      if (!isi || chatMengirim) return;
      if (isi.length > (g ? 2000 : 500)) return alert(`Pertanyaan terlalu panjang (maksimal ${g ? 2000 : 500} karakter).`);
      chatPesan.push({ dari: 'pengguna', isi });
      inp.value = '';
      chatMengirim = true; chatRender();
      try {
        const d = g
          ? await chatAPI('guru_kirim', { pesan: isi, kelas: $id('chatKelas').value || null, paket_id: Number($id('chatPaket').value) || null })
          : await chatAPI('kirim', { pesan: isi });
        chatPesan.push({ dari: 'ai', isi: d.balasan, sumber: d.sumber || [] });
        chatInfo = { ...(chatInfo || {}), sisa: d.sisa, batas: d.batas };
      } catch (e) {
        chatPesan.push({ dari: 'galat', isi: e.message || String(e) });
        if (e.status === 423) chatInfo = { ...(chatInfo || {}), terkunci: true };
        if (e.status === 429 && /habis|tercapai/.test(e.message || '')) chatInfo = { ...(chatInfo || {}), sisa: 0 };
      } finally {
        chatMengirim = false; chatRender();
        if (!$id('chatInput').disabled) $id('chatInput').focus();
      }
    }

    function chatCepat(i) {
      const c = CHAT_CEPAT[i]; if (!c || chatMengirim) return;
      if (i !== 3 && !$id('chatKelas').value) { $id('chatKelas').focus(); return alert('Pilih kelas dulu supaya Asisten bisa membaca datanya.'); }
      $id('chatInput').value = c[1];
      chatKirim();
    }

    function chatGuruMode(m) {
      chatMode = m === 'siswa' ? 'siswa' : 'asisten';
      $id('chatTabAsisten').classList.toggle('aktif', chatMode === 'asisten');
      $id('chatTabSiswa').classList.toggle('aktif', chatMode === 'siswa');
      $id('chatPilihAsisten').classList.toggle('hidden', chatMode !== 'asisten');
      $id('chatPilihSiswa').classList.toggle('hidden', chatMode !== 'siswa');
      if (chatMode === 'siswa') {
        if ($id('chatKelas').value) $id('chatKelasSiswa').value = $id('chatKelas').value;
        chatGuruMuatSiswa();
      } else chatRender();
    }

    async function chatGuruMuatSiswa() {
      chatSiswaData = null; chatRender();
      try {
        chatSiswaData = await chatAPI('guru_chat_siswa', { kelas: $id('chatKelasSiswa').value, hari: Number($id('chatHari').value) || 14 });
      } catch (e) { chatSiswaData = { galat: e.message || String(e) }; }
      if (chatMode === 'siswa') chatRender();
    }

    function chatBuka() {
      if (!chatAktif()) return;
      chatSiapkanPanel();
      $id('chatPanel').classList.remove('hidden');
      chatFabCek();
      if (chatGuru()) { chatGuruMode(chatMode); if (!chatRiwayatSiap) chatMuatRiwayat(); return; }
      chatRender();
      chatMuat();
      chatMuatRiwayat();
    }
    function chatTutup() { $id('chatPanel').classList.add('hidden'); chatFabCek(); }

    function chatKe(tujuan, id) {
      chatTutup();
      if (tujuan === 'kuis') { switchTab('kuis'); return; }
      if (tujuan === 'materi') {
        switchTab('materi');
        if (id && typeof materiCache !== 'undefined' && materiCache[id] && materiCache[id].konten) bukaModul(id);
        return;
      }
      if (tujuan === 'lab') {
        switchTab('lab'); labModeSiswa('tugas');
        if (id && labTugasCache[String(id)]) bukaLab(id);
      }
    }

