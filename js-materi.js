// LMS Informatika SMA — js-materi.js: Bank materi & materi siswa.
// Dipecah dari index.html (2 Nov 2026), isi tidak diubah. File js-*.js dimuat berurutan oleh index.html.
    // ================= MODUL 1: BANK MATERI & MULTI MEDIA =================
    function setMateriMode(mode) {
      activeMateriMode = mode;
      document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));

      if (mode === 'ai') {
        document.querySelectorAll('.mode-btn')[0].classList.add('active');
        document.getElementById('materiSectionAI').classList.remove('hidden');
        document.getElementById('materiSectionMedia').classList.add('hidden');
      } else if (mode === 'manual') {
        document.querySelectorAll('.mode-btn')[1].classList.add('active');
        document.getElementById('materiSectionAI').classList.add('hidden');
        document.getElementById('materiSectionMedia').classList.add('hidden');
      } else if (mode === 'media') {
        document.querySelectorAll('.mode-btn')[2].classList.add('active');
        document.getElementById('materiSectionAI').classList.add('hidden');
        document.getElementById('materiSectionMedia').classList.remove('hidden');
      }
    }

    // ---------- Helper tampilan modul ----------
    const materiCache = {};
    let modulAktifId = null;
    let materiReadSet = new Set();

    function escHtml(s) {
      return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function isHtmlKonten(k) { return /<\/?[a-z][\s\S]*?>/i.test(k || ''); }
    function isModulA4(k) { return /class="a4-page"/.test(k || ''); }

    function renderKonten(k) {
      if (!k) return '<p class="mu">(Belum ada isi materi)</p>';
      if (isHtmlKonten(k)) return k;
      return `<div class="a4-page"><div class="a4-text">${escHtml(k)}</div></div>`;
    }

    function ringkasKonten(k, n = 150) {
      if (!k) return '';
      if (isModulA4(k)) return 'Modul lengkap format A4 — tekan tombol di bawah untuk membaca.';
      let t = k;
      if (isHtmlKonten(k)) {
        const doc = new DOMParser().parseFromString(k, 'text/html');
        doc.querySelectorAll('style,script').forEach(e => e.remove());
        t = doc.body.textContent || '';
      }
      t = t.replace(/\s+/g, ' ').trim();
      return t.length > n ? t.slice(0, n) + '…' : t;
    }

    function updateMatPreview() {
      const v = document.getElementById('matKonten').value.trim();
      const wrap = document.getElementById('matPreviewWrap');
      const box = document.getElementById('matPreview');
      if (!v) { wrap.classList.add('hidden'); box.innerHTML = ''; return; }
      wrap.classList.remove('hidden');
      box.innerHTML = renderKonten(v);
    }

    function bukaModul(id) {
      const m = materiCache[id];
      if (!m) return;
      modulAktifId = id;
      document.getElementById('modalJudul').textContent = m.judul || 'Materi';
      document.getElementById('modalBody').innerHTML = renderKonten(m.konten);
      const btn = document.getElementById('btnModalRead');
      if (activeUser && activeUser.role === 'siswa' && !materiReadSet.has(m.id)) {
        btn.classList.remove('hidden');
        btn.onclick = async () => { await tandaiMateriDibaca(id); btn.classList.add('hidden'); };
      } else {
        btn.classList.add('hidden');
      }
      document.getElementById('modalModul').classList.remove('hidden');
      document.getElementById('modalBody').scrollTop = 0;
      document.body.style.overflow = 'hidden';
    }

    function tutupModul() {
      document.getElementById('modalModul').classList.add('hidden');
      document.body.style.overflow = '';
    }

    // Simpan PDF: memakai dialog cetak browser (pilih "Simpan sebagai PDF")
    function cetakModul(id) {
      const m = materiCache[id || modulAktifId];
      if (!m) return;
      const area = document.getElementById('printArea');
      const oldTitle = document.title;
      area.innerHTML = renderKonten(m.konten);
      document.title = m.judul || 'Modul';
      document.body.classList.add('printing');
      const selesai = () => {
        document.body.classList.remove('printing');
        area.innerHTML = '';
        document.title = oldTitle;
        window.removeEventListener('afterprint', selesai);
      };
      window.addEventListener('afterprint', selesai);
      window.print();
    }

    async function generateMateriAI() {
      const topik = document.getElementById('matJudul').value.trim();
      const status = document.getElementById('matAIStatus');
      const btn = document.getElementById('btnGenMatAI');

      if (!topik) return alert('Isi Judul Topik Master terlebih dahulu!');
      btn.disabled = true;
      status.textContent = '🤖 AI sedang menyusun modul A4...';

      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-ai`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          },
          body: JSON.stringify({ prompt: topik, mode: 'materi', token: sesiToken })
        });

        const data = await response.json();
        if (response.status === 401) return sesiHabis(data.error);
        if (data.htmlA4) {
          document.getElementById('matKonten').value = data.htmlA4;
          updateMatPreview();
          status.textContent = '✅ Modul berhasil dibuat! Cek pratinjau di bawah, edit bila perlu, lalu simpan.';
        } else {
          throw new Error(data.error || ('Respons tidak berisi htmlA4: ' + JSON.stringify(data).slice(0, 150)));
        }
      } catch (err) {
        status.textContent = '❌ Gagal AI: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    }


    async function simpanBankMateri() {
      const judul = document.getElementById('matJudul').value.trim();
      const konten = document.getElementById('matKonten').value.trim();
      const tipe_media = document.getElementById('matTipeMedia').value;
      const url_media = document.getElementById('matUrlMedia').value.trim();

      if (!judul) return alert('Isi judul materi!');

      const { error } = await guruRPC('guru_simpan', { p_tabel: 'materi', p_data: { judul, konten, tipe_media, url_media } });
      if (error) return alert('Gagal menyimpan materi: ' + error.message);

      alert('Materi tersimpan ke Bank Master!');
      document.getElementById('matJudul').value = '';
      document.getElementById('matKonten').value = '';
      document.getElementById('matUrlMedia').value = '';
      document.getElementById('matAIStatus').textContent = '';
      updateMatPreview();
      loadBankMateriGuru();
    }

    async function loadBankMateriGuru() { return loadBank('materi'); }

    async function publishMateriMulti(materiId, targetKelas) {
      const { error } = await guruRPC('guru_publish', { p_bank: 'materi', p_id: String(materiId), p_kelas: [targetKelas] });
      if (error) return alert('Gagal publish: ' + error.message);
      alert(`Materi berhasil dipublish ke Kelas ${targetKelas}!`);
    }

    function getYouTubeEmbedUrl(url) {
      if (!url) return '';
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
      const match = url.match(regExp);
      return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : url;
    }

    async function loadMateriSiswa() {
      const { data } = await db.from('materi_published').select('*, materi(*)').eq('kelas', activeUser.kelas);
      const container = document.getElementById('listMateriSiswa');
      const rows = (data || []).filter(p => p.materi && !p.materi.diarsipkan);
      if (rows.length === 0) {
        container.innerHTML = '<p class="mu">Belum ada materi dipublish untuk kelasmu.</p>';
        return;
      }

      const { data: readLog } = await siswaBaca('materi_read_log');
      materiReadSet = new Set((readLog || []).map(r => r.materi_id));

      container.innerHTML = rows.map(p => {
        const m = p.materi;
        materiCache[m.id] = m;
        const isRead = materiReadSet.has(m.id);

        let mediaRenderHTML = '';
        if (m.tipe_media === 'youtube' && m.url_media) {
          const embedUrl = getYouTubeEmbedUrl(m.url_media);
          mediaRenderHTML = `
            <div class="media-preview-box">
              <iframe width="100%" height="315" src="${escHtml(embedUrl)}" frameborder="0" allowfullscreen style="border-radius:8px;"></iframe>
            </div>`;
        } else if ((m.tipe_media === 'pdf' || m.tipe_media === 'gdrive') && m.url_media) {
          mediaRenderHTML = `
            <div class="media-preview-box" style="display:flex; justify-content:space-between; align-items:center;">
              <span class="mu">📎 Lampiran Dokumen Modul / Media</span>
              <a href="${escHtml(m.url_media)}" target="_blank" style="color:var(--ac); font-weight:700; text-decoration:none;">🔗 Buka / Download Media ↗</a>
            </div>`;
        }

        const ringkas = ringkasKonten(m.konten);

        return `
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
              <b>${escHtml(m.judul)}</b>
              ${isRead ? '<span class="badge ok">✅ Sudah Dibaca</span>' : `<button class="ok" onclick="tandaiMateriDibaca('${m.id}')">Tandai Sudah Dibaca</button>`}
            </div>
            ${ringkas ? `<p class="mu" style="margin-top:8px; line-height:1.6; color:#334155;">${escHtml(ringkas)}</p>` : ''}
            ${m.konten ? `<div style="margin-top:12px;"><button onclick="bukaModul('${m.id}')">📖 Baca Modul</button></div>` : ''}
            ${mediaRenderHTML}
          </div>
        `;
      }).join('');
    }

    async function tandaiMateriDibaca(materiId) {
      // Ditulis lewat server (keamanan_4b.sql): siswa_id diambil dari token, bukan dari browser.
      const { error } = await db.rpc('siswa_tandai_dibaca', { p_token: sesiToken, p_materi_id: String(materiId) });
      if (error) { if (galatSesi(error.message)) return sesiHabis(); return alert('Gagal menyimpan: ' + error.message); }
      alert('Materi ditandai sudah dibaca! 🎉');
      await loadMateriSiswa();
    }

