// LMS Informatika SMA — js-robot.js: Robot penjelajah.
// Dipecah dari index.html (2 Nov 2026), isi tidak diubah. File js-*.js dimuat berurutan oleh index.html.
      // ================= ROBOT PENJELAJAH (Lab Koding) =================
    // Robot kertas di dunia kotak-kotak. Siswa menyusun balok, robot berjalan di peta.
    // 10 level (urutan -> perulangan -> percabangan -> variabel). Setiap "Periksa" disimpan ke Supabase
    // (robot_riwayat = histori, robot_progres = ringkasan per level). Penilaian dihitung di browser siswa.
    const RB_BATAS_AKSI = 3000;
    const RB_DIR = ['N', 'E', 'S', 'W'];
    const RB_D = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };

    // Peta: '#' dinding, '.' lantai, 'S' awal, 'G' bendera (tujuan), '*' bintang. Peta pertama = peta contoh,
    // peta berikutnya = peta uji (panjang lorong / letak bintang berbeda) supaya siswa tidak sekadar menghitung langkah.
    const ROBOT_LEVEL = [
      { no: 1, judul: 'Maju!', konsep: 'Urutan', ikon: '⬆️', misi: 'Antar robot ke bendera 🏁. Robot menghadap ke kanan dan harus maju 4 kotak.',
        gerak: ['maju'], fitur: [], sensor: [], maks_blok: null, ucapan: null,
        peta: [{ arah: 'E', baris: ['#######', '#S...G#', '#######'] }],
        petunjuk: ['Buka kategori Gerak di sebelah kiri, lalu seret balok "maju" ke area putih.', 'Satu balok maju = satu kotak. Tempel balok maju berikutnya tepat di bawahnya, seperti menyusun puzzle.'], pseudo: null },
      { no: 2, judul: 'Belok', konsep: 'Urutan', ikon: '↪️', misi: 'Robot harus berbelok untuk mencapai bendera. Perhatikan ke mana robot menghadap.',
        gerak: ['maju', 'kiri', 'kanan'], fitur: [], sensor: [], maks_blok: null, ucapan: null,
        peta: [{ arah: 'E', baris: ['######', '#S...#', '####.#', '####G#', '######'] }],
        petunjuk: ['Robot maju ke kanan dulu, lalu jalannya turun ke bawah.', 'Belok kanan membuat robot yang menghadap kanan menjadi menghadap bawah. Maju 3, belok, lalu maju lagi.'], pseudo: null },
      { no: 3, judul: 'Ulangi!', konsep: 'Perulangan', ikon: '🔁', misi: 'Lorongnya panjang (8 kotak). Pakai perulangan, jangan menempel 8 balok maju. Batas: 4 balok.',
        gerak: ['maju', 'kiri', 'kanan'], fitur: ['ulang'], sensor: [], maks_blok: 4, ucapan: null,
        peta: [{ arah: 'E', baris: ['###########', '#S.......G#', '###########'] }],
        petunjuk: ['Ambil balok "repeat ... times" dari kategori Perulangan. Taruh balok maju DI DALAM mulutnya.', 'Isi angkanya sama dengan banyak kotak yang harus dilewati robot.'],
        pseudo: 'ULANGI ... KALI\n    maju' },
      { no: 4, judul: 'Tangga', konsep: 'Perulangan', ikon: '🪜', misi: 'Robot naik tangga kertas ke bendera. Polanya berulang. Batas: 7 balok.',
        gerak: ['maju', 'kiri', 'kanan'], fitur: ['ulang'], sensor: [], maks_blok: 7, ucapan: null,
        peta: [{ arah: 'E', baris: ['######', '####G#', '###..#', '##..##', '#S.###', '######'] }],
        petunjuk: ['Lihat polanya: maju, belok kiri, maju, belok kanan. Pola itu diulang 3 kali.', 'Taruh keempat balok pola itu di dalam satu balok perulangan.'],
        pseudo: 'ULANGI ... KALI\n    maju\n    belok ...\n    maju\n    belok ...' },
      { no: 5, judul: 'Pungut Bintang', konsep: 'Perulangan', ikon: '⭐', misi: 'Ambil SEMUA bintang di lorong, lalu sampai di bendera. Batas: 8 balok.',
        gerak: ['maju', 'kiri', 'kanan', 'ambil'], fitur: ['ulang'], sensor: [], maks_blok: 8, ucapan: null,
        peta: [{ arah: 'E', baris: ['##########', '#S.*.*.*G#', '##########'] }],
        petunjuk: ['Balok "ambil bintang" hanya berguna kalau robot berdiri tepat di kotak berbintang.', 'Bintang muncul tiap 2 kotak: maju, maju, ambil. Ulangi pola itu, lalu maju sekali lagi ke bendera.'],
        pseudo: 'ULANGI ... KALI\n    maju\n    maju\n    ambil bintang\nmaju' },
      { no: 6, judul: 'Sampai di Bendera', konsep: 'Perulangan sampai', ikon: '🏁', misi: 'Panjang lorong berbeda di setiap peta. Robot harus terus maju SAMPAI di bendera, tanpa menghitung langkah.',
        gerak: ['maju', 'kiri', 'kanan'], fitur: ['sampai'], sensor: ['tujuan'], maks_blok: null, ucapan: null,
        peta: [{ arah: 'E', baris: ['########', '#S....G#', '########'] }, { arah: 'E', baris: ['######', '#S..G#', '######'] }, { arah: 'E', baris: ['###########', '#S.......G#', '###########'] }],
        petunjuk: ['Balok "repeat while" punya menu: ganti menjadi "until" (sampai).', 'Kondisinya: robot sudah di bendera? (kategori Sensor). Isinya: maju.'],
        pseudo: 'ULANGI SAMPAI robot di bendera\n    maju' },
      { no: 7, judul: 'Ikuti Lorong', konsep: 'Percabangan', ikon: '🌀', misi: 'Lorong berbentuk spiral dan selalu berbelok ke kanan. Robot harus memutuskan sendiri: maju atau belok?',
        gerak: ['maju', 'kiri', 'kanan'], fitur: ['sampai', 'jika'], sensor: ['tembok', 'tujuan'], maks_blok: null, ucapan: null,
        peta: [
          { arah: 'E', baris: ['#######', '#S....#', '#####.#', '#...#.#', '#.#G#.#', '#.....#', '#######'] },
          { arah: 'E', baris: ['#####', '#S..#', '#G#.#', '#...#', '#####'] },
          { arah: 'E', baris: ['#########', '#S......#', '#######.#', '#.....#.#', '#.###G#.#', '#.......#', '#########'] }
        ],
        petunjuk: ['Di dalam perulangan, gunakan balok "jika ... maka ... jika tidak" (kategori Jika).', 'Kalau ada tembok di depan, robot belok kanan. Kalau tidak, robot maju.'],
        pseudo: 'ULANGI SAMPAI robot di bendera\n    JIKA ada tembok di depan\n        belok ...\n    JIKA TIDAK\n        maju' },
      { no: 8, judul: 'Cari Bintang', konsep: 'Percabangan', ikon: '🔍', misi: 'Letak bintang berbeda di setiap peta. Ambil semua bintang dan sampai di bendera. Robot harus mengecek sendiri apakah ada bintang.',
        gerak: ['maju', 'kiri', 'kanan', 'ambil'], fitur: ['sampai', 'jika'], sensor: ['bintang', 'tujuan'], maks_blok: null, ucapan: null,
        peta: [
          { arah: 'E', baris: ['###########', '#S.*..*..G#', '###########'] },
          { arah: 'E', baris: ['########', '#S*.*.G#', '########'] },
          { arah: 'E', baris: ['###########', '#S.**.*..G#', '###########'] }
        ],
        petunjuk: ['Sebelum maju, tanyakan: ada bintang di sini? (kategori Sensor).', 'Kalau ya, ambil bintang. Setelah itu, maju.'],
        pseudo: 'ULANGI SAMPAI robot di bendera\n    JIKA ada bintang di sini\n        ambil bintang\n    maju' },
      { no: 9, judul: 'Hitung Langkah', konsep: 'Variabel', ikon: '🔢', misi: 'Robot harus MENGATAKAN berapa langkah yang ia tempuh sampai bendera. Hitung dengan sebuah variabel.',
        gerak: ['maju', 'kiri', 'kanan', 'katakan'], fitur: ['sampai', 'variabel', 'matematika'], sensor: ['tujuan'], maks_blok: null, ucapan: 'langkah',
        peta: [{ arah: 'E', baris: ['########', '#S....G#', '########'] }, { arah: 'E', baris: ['#####', '#S.G#', '#####'] }, { arah: 'E', baris: ['###########', '#S.......G#', '###########'] }],
        petunjuk: ['Buat variabel bernama "langkah" (kategori Variabel). Beri nilai awal 0 sebelum robot jalan.', 'Setiap kali robot maju, tambahkan 1 ke variabel: langkah = langkah + 1. Di akhir, katakan isi variabel itu.'],
        pseudo: 'langkah ← 0\nULANGI SAMPAI robot di bendera\n    maju\n    langkah ← langkah + ...\nkatakan langkah' },
      { no: 10, judul: 'Kolektor Bintang', konsep: 'Gabungan', ikon: '🏆', misi: 'Ikuti lorong spiral, ambil semua bintang, sampai di bendera, lalu katakan BERAPA bintang yang berhasil diambil.',
        gerak: ['maju', 'kiri', 'kanan', 'ambil', 'katakan'], fitur: ['sampai', 'jika', 'variabel', 'matematika'], sensor: ['tembok', 'bintang', 'tujuan'], maks_blok: null, ucapan: 'bintang',
        peta: [
          { arah: 'E', baris: ['#######', '#S.*..#', '#####.#', '#.*.#*#', '#.#G#.#', '#..*..#', '#######'] },
          { arah: 'E', baris: ['#####', '#S*.#', '#G#*#', '#...#', '#####'] },
          { arah: 'E', baris: ['#########', '#S.*....#', '#######.#', '#..*..#.#', '#.###G#.#', '#...*...#', '#########'] }
        ],
        petunjuk: ['Gabungkan semua yang sudah kamu pelajari: ikuti lorong (level 7), ambil bintang (level 8), hitung dengan variabel (level 9).', 'Variabel "total" bertambah 1 hanya saat robot mengambil bintang. Beri nilai awal 0.'],
        pseudo: 'total ← 0\nULANGI SAMPAI robot di bendera\n    JIKA ada bintang di sini\n        ambil bintang\n        total ← total + ...\n    JIKA ada tembok di depan\n        belok ...\n    JIKA TIDAK\n        maju\nkatakan total' }
    ];

    // ---------- Mesin robot ----------
    function robotParse(p) {
      const baris = p.baris;
      const h = baris.length, w = Math.max(...baris.map(s => s.length));
      const sel = baris.map(s => Array.from(s.padEnd(w, '#')));
      let mulai = null, tujuan = null;
      const bintang = new Set();
      sel.forEach((row, r) => row.forEach((ch, c) => {
        if (ch === 'S') { mulai = { r, c }; row[c] = '.'; }
        else if (ch === 'G') { tujuan = { r, c }; row[c] = '.'; }
        else if (ch === '*') { bintang.add(r + ',' + c); row[c] = '.'; }
      }));
      return { w, h, dinding: sel.map(row => row.map(ch => ch === '#')), mulai, arah: p.arah || 'E', tujuan, bintang };
    }

    function robotJarak(pt) {   // langkah terpendek dari awal ke bendera (BFS)
      if (!pt.mulai || !pt.tujuan) return null;
      const jarak = new Map([[pt.mulai.r + ',' + pt.mulai.c, 0]]);
      const antre = [pt.mulai];
      while (antre.length) {
        const { r, c } = antre.shift();
        for (const k of RB_DIR) {
          const nr = r + RB_D[k][0], nc = c + RB_D[k][1], key = nr + ',' + nc;
          if (nr < 0 || nc < 0 || nr >= pt.h || nc >= pt.w || pt.dinding[nr][nc] || jarak.has(key)) continue;
          jarak.set(key, jarak.get(r + ',' + c) + 1); antre.push({ r: nr, c: nc });
        }
      }
      const j = jarak.get(pt.tujuan.r + ',' + pt.tujuan.c);
      return j === undefined ? null : j;
    }

    function robotHarapanUcapan(lv, pt) {
      if (lv.ucapan === 'langkah') return robotJarak(pt);
      if (lv.ucapan === 'bintang') return pt.bintang.size;
      return null;
    }

    function robotSimulasi(kode, pt) {
      const st = { r: pt.mulai.r, c: pt.mulai.c, d: RB_DIR.indexOf(pt.arah), ada: new Set(pt.bintang), diambil: 0, langkah: 0 };
      const jejak = [{ t: 'awal', r: st.r, c: st.c, d: st.d }];
      const ucapan = [];
      let status = 'selesai', galat = null, aksi = 0;
      const cek = () => { if (++aksi > RB_BATAS_AKSI) throw new Error('__AKSI__'); };
      const adaTembok = (r, c) => r < 0 || c < 0 || r >= pt.h || c >= pt.w || pt.dinding[r][c];
      const cat = (t, extra = {}) => jejak.push({ t, r: st.r, c: st.c, d: st.d, ...extra });
      const api = {
        maju() {
          cek();
          const [dr, dc] = RB_D[RB_DIR[st.d]];
          const nr = st.r + dr, nc = st.c + dc;
          if (adaTembok(nr, nc)) { cat('tabrak'); throw new Error('__TABRAK__'); }
          st.r = nr; st.c = nc; st.langkah++; cat('maju');
        },
        kiri() { cek(); st.d = (st.d + 3) % 4; cat('kiri'); },
        kanan() { cek(); st.d = (st.d + 1) % 4; cat('kanan'); },
        ambil() { cek(); const k = st.r + ',' + st.c; const ok = st.ada.delete(k); if (ok) st.diambil++; cat('ambil', { k, ok }); },
        katakan(v) { cek(); const teks = String(v); ucapan.push(teks); cat('katakan', { teks }); },
        tembok(arah) {
          const off = arah === 'KIRI' ? 3 : arah === 'KANAN' ? 1 : 0;
          const [dr, dc] = RB_D[RB_DIR[(st.d + off) % 4]];
          return adaTembok(st.r + dr, st.c + dc);
        },
        tujuan() { return !!pt.tujuan && st.r === pt.tujuan.r && st.c === pt.tujuan.c; },
        bintang() { return st.ada.has(st.r + ',' + st.c); }
      };
      try {
        new Function('__r_maju', '__r_kiri', '__r_kanan', '__r_ambil', '__r_katakan', '__r_tembok', '__r_tujuan', '__r_bintang', '__lt', kode)(
          api.maju, api.kiri, api.kanan, api.ambil, api.katakan, api.tembok, api.tujuan, api.bintang, LAB_BATAS_LANGKAH);
      } catch (e) {
        const m = e && e.message;
        if (m === '__TABRAK__') status = 'tabrak';
        else if (m === '__LOOP__') status = 'loop';
        else if (m === '__AKSI__') status = 'terlalu_banyak';
        else { status = 'galat'; galat = m || String(e); }
      }
      return { jejak, ucapan, status, galat, langkah: st.langkah, akhir: { r: st.r, c: st.c, d: st.d }, diambil: st.diambil, sisa: st.ada.size, total: pt.bintang.size };
    }

    function robotNilai(sim, pt, lv) {
      const alasan = [];
      if (sim.status === 'tabrak') alasan.push('tabrak');
      else if (sim.status === 'loop') alasan.push('loop');
      else if (sim.status === 'terlalu_banyak') alasan.push('banyak');
      else if (sim.status === 'galat') alasan.push('galat');
      else {
        if (pt.tujuan && !(sim.akhir.r === pt.tujuan.r && sim.akhir.c === pt.tujuan.c)) alasan.push('belum_sampai');
        if (sim.sisa > 0) alasan.push('bintang_sisa');
        const harapan = robotHarapanUcapan(lv, pt);
        if (harapan !== null) {
          if (!sim.ucapan.length) alasan.push('ucapan_kosong');
          else if (!samaKeluaran(sim.ucapan[sim.ucapan.length - 1], String(harapan))) alasan.push('ucapan_salah');
        }
      }
      return { lulus: alasan.length === 0, alasan, harapan: robotHarapanUcapan(lv, pt) };
    }

    function robotPeriksaSemua(kode, lv) {
      const pts = lv.peta.map(robotParse);
      return pts.map((pt, i) => {
        const sim = robotSimulasi(kode, pt);
        const n = robotNilai(sim, pt, lv);
        return { no: i + 1, lulus: n.lulus, alasan: n.alasan, harapan: n.harapan, sim, pt };
      });
    }

    const RB_ALASAN = {
      tabrak: 'Robot menabrak tembok.',
      loop: 'Perulangan tidak pernah berhenti.',
      banyak: 'Robot bergerak terlalu banyak (kemungkinan berputar-putar).',
      galat: 'Program berhenti karena galat.',
      belum_sampai: 'Robot berhenti sebelum sampai di bendera.',
      bintang_sisa: 'Masih ada bintang yang belum diambil.',
      ucapan_kosong: 'Robot belum mengatakan apa pun.',
      ucapan_salah: 'Angka yang dikatakan robot belum tepat.'
    };

    // Tebakan penyebab dalam bahasa sederhana
    function robotTips(hasil, lv, jumlahBlok) {
      const tips = [];
      const tambah = (t) => { if (!tips.includes(t)) tips.push(t); };
      const gagal = hasil.filter(h => !h.lulus);
      if (lv.maks_blok && jumlahBlok !== null && jumlahBlok > lv.maks_blok) tambah(`Programmu memakai ${jumlahBlok} balok, batas level ini ${lv.maks_blok}. Cari bagian yang berulang lalu masukkan ke dalam perulangan.`);
      gagal.forEach(h => {
        h.alasan.forEach(a => {
          if (a === 'tabrak') tambah('Robot menabrak tembok. Cek ke mana robot menghadap: mungkin perlu belok dulu sebelum maju, atau maju terlalu banyak.');
          else if (a === 'loop') tambah('Perulangan tidak pernah berhenti. Pastikan kondisinya bisa terpenuhi, misalnya "sampai robot di bendera" dan di dalamnya ada balok maju.');
          else if (a === 'banyak') tambah('Robot bergerak sangat banyak tanpa sampai. Mungkin ia berputar-putar: periksa kapan ia belok dan kapan ia maju.');
          else if (a === 'belum_sampai') tambah('Robot berhenti sebelum bendera. Mungkin kurang maju, atau perulangan berhenti terlalu cepat.');
          else if (a === 'bintang_sisa') tambah('Masih ada bintang yang belum diambil. Balok "ambil bintang" harus dijalankan tepat di kotak yang berbintang.');
          else if (a === 'ucapan_kosong') tambah('Robot belum berbicara. Tambahkan balok "katakan" di AKHIR program, setelah robot selesai berjalan.');
          else if (a === 'ucapan_salah') tambah('Angka yang dikatakan belum tepat. Pastikan variabelmu diberi nilai awal 0 dan bertambah 1 pada saat yang benar.');
          else if (a === 'galat') tambah('Program berhenti karena galat. Periksa balok yang belum tersambung atau kotak yang masih kosong.');
        });
      });
      if (hasil.length > 1 && hasil[0].lulus && gagal.length) tambah('Lulus di peta contoh tetapi gagal di peta lain. Panjang lorong dan letak bintang tiap peta berbeda, jadi jangan menghitung langkah sendiri: pakai perulangan dan balok sensor.');
      return tips.slice(0, 3);
    }

    // ---------- Balok Blockly khusus robot ----------
    const ROBOT_BLOK_DEF = [
      { type: 'robot_maju', message0: 'maju', previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Robot maju satu kotak' },
      { type: 'robot_kiri', message0: 'belok kiri ↺', previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Robot berputar ke kiri di tempat' },
      { type: 'robot_kanan', message0: 'belok kanan ↻', previousStatement: null, nextStatement: null, colour: 210, tooltip: 'Robot berputar ke kanan di tempat' },
      { type: 'robot_ambil', message0: 'ambil bintang ⭐', previousStatement: null, nextStatement: null, colour: 45, tooltip: 'Ambil bintang di kotak tempat robot berdiri' },
      { type: 'robot_katakan', message0: 'katakan %1', args0: [{ type: 'input_value', name: 'TEKS' }], previousStatement: null, nextStatement: null, colour: 290, tooltip: 'Robot mengucapkan sebuah nilai' },
      { type: 'robot_tembok', message0: 'ada tembok di %1 ?', args0: [{ type: 'field_dropdown', name: 'ARAH', options: [['depan', 'DEPAN'], ['kiri', 'KIRI'], ['kanan', 'KANAN']] }], output: 'Boolean', colour: 190, tooltip: 'Benar jika ada tembok di sisi itu' },
      { type: 'robot_di_tujuan', message0: 'robot sudah di bendera?', output: 'Boolean', colour: 190, tooltip: 'Benar jika robot berdiri di kotak bendera' },
      { type: 'robot_ada_bintang', message0: 'ada bintang di sini?', output: 'Boolean', colour: 190, tooltip: 'Benar jika kotak ini masih berbintang' }
    ];
    let robotBlokSiap = false;
    function robotDefinisiBlok() {
      if (robotBlokSiap) return;
      robotBlokSiap = true;
      try {
        if (typeof Blockly !== 'undefined' && Blockly.defineBlocksWithJsonArray) Blockly.defineBlocksWithJsonArray(ROBOT_BLOK_DEF);
        if (typeof javascript === 'undefined' || !javascript.javascriptGenerator) return;
        const G = javascript.javascriptGenerator;
        const F = G.forBlock || (G.forBlock = {});
        const ATOM = (javascript.Order && javascript.Order.ATOMIC !== undefined) ? javascript.Order.ATOMIC : 0;
        const NONE = (javascript.Order && javascript.Order.NONE !== undefined) ? javascript.Order.NONE : 99;
        F.robot_maju = () => '__r_maju();\n';
        F.robot_kiri = () => '__r_kiri();\n';
        F.robot_kanan = () => '__r_kanan();\n';
        F.robot_ambil = () => '__r_ambil();\n';
        F.robot_katakan = (b, gen) => `__r_katakan(${((gen || G).valueToCode(b, 'TEKS', NONE)) || "''"});\n`;
        F.robot_tembok = (b) => ['__r_tembok(' + JSON.stringify(b.getFieldValue('ARAH')) + ')', ATOM];
        F.robot_di_tujuan = () => ['__r_tujuan()', ATOM];
        F.robot_ada_bintang = () => ['__r_bintang()', ATOM];
      } catch (e) { console.warn('Balok robot gagal didefinisikan:', e); }
    }

    function robotToolbox(lv) {
      const kat = [];
      const gerak = [];
      if (lv.gerak.includes('maju')) gerak.push(bl('robot_maju'));
      if (lv.gerak.includes('kiri')) gerak.push(bl('robot_kiri'));
      if (lv.gerak.includes('kanan')) gerak.push(bl('robot_kanan'));
      if (lv.gerak.includes('ambil')) gerak.push(bl('robot_ambil'));
      if (lv.gerak.includes('katakan')) gerak.push(bl('robot_katakan', { inputs: { TEKS: sh('math_number', { NUM: 0 }) } }));
      kat.push({ kind: 'category', name: 'Gerak', colour: '210', contents: gerak });
      const ulang = [];
      if (lv.fitur.includes('ulang')) ulang.push(bl('controls_repeat_ext', { inputs: { TIMES: sh('math_number', { NUM: 4 }) } }));
      if (lv.fitur.includes('sampai')) ulang.push(bl('controls_whileUntil'));
      if (ulang.length) kat.push({ kind: 'category', name: 'Perulangan', colour: '120', contents: ulang });
      if (lv.fitur.includes('jika')) kat.push({ kind: 'category', name: 'Jika', colour: '210', contents: [bl('controls_if'), bl('controls_if', { extraState: { hasElse: true } }), bl('logic_negate')] });
      if (lv.sensor.length) {
        const s = [];
        if (lv.sensor.includes('tembok')) s.push(bl('robot_tembok', { fields: { ARAH: 'DEPAN' } }), bl('robot_tembok', { fields: { ARAH: 'KIRI' } }), bl('robot_tembok', { fields: { ARAH: 'KANAN' } }));
        if (lv.sensor.includes('bintang')) s.push(bl('robot_ada_bintang'));
        if (lv.sensor.includes('tujuan')) s.push(bl('robot_di_tujuan'));
        kat.push({ kind: 'category', name: 'Sensor', colour: '190', contents: s });
      }
      if (lv.fitur.includes('variabel')) kat.push(labToolboxKategori('variabel'));
      if (lv.fitur.includes('matematika')) kat.push({ kind: 'category', name: 'Matematika', colour: '230', contents: [
        bl('math_number'),
        bl('math_arithmetic', { inputs: { A: sh('math_number', { NUM: 1 }), B: sh('math_number', { NUM: 1 }) } })
      ] });
      return { kind: 'categoryToolbox', contents: kat };
    }

    // Peta "apa yang dicari" untuk panel panduan tiap level
    function robotPanduanHTML(lv) {
      const baris = [];
      const G = { maju: ['maju', 'maju satu kotak'], kiri: ['belok kiri ↺', 'putar ke kiri di tempat'], kanan: ['belok kanan ↻', 'putar ke kanan di tempat'], ambil: ['ambil bintang ⭐', 'ambil bintang di kotak ini'], katakan: ['katakan [nilai]', 'robot mengucapkan nilai (muncul di gelembung)'] };
      lv.gerak.forEach(k => baris.push([G[k][0], G[k][1], 'Gerak']));
      if (lv.fitur.includes('ulang')) baris.push(['repeat [n] times', 'ulangi isinya n kali', 'Perulangan']);
      if (lv.fitur.includes('sampai')) baris.push(['repeat while / until', 'ganti menu menjadi "until" = sampai kondisi terpenuhi', 'Perulangan']);
      if (lv.fitur.includes('jika')) baris.push(['if ... do', 'jika kondisi benar; klik ikon roda gigi ⚙ untuk menambah else (jika tidak)', 'Jika']);
      if (lv.sensor.includes('tembok')) baris.push(['ada tembok di depan/kiri/kanan ?', 'sensor tembok (pilih sisinya dari menu)', 'Sensor']);
      if (lv.sensor.includes('bintang')) baris.push(['ada bintang di sini?', 'sensor bintang', 'Sensor']);
      if (lv.sensor.includes('tujuan')) baris.push(['robot sudah di bendera?', 'sensor bendera', 'Sensor']);
      if (lv.fitur.includes('variabel')) baris.push(['set [x] to', 'beri nilai ke variabel (buat variabel dulu)', 'Variabel']);
      if (lv.fitur.includes('matematika')) baris.push(['[ ] + [ ]', 'penjumlahan (pilih operatornya dari menu)', 'Matematika']);
      return `<ol>
          <li>Klik sebuah <b>kategori</b> di sebelah kiri area kerja, lalu <b>seret balok</b> ke area putih.</li>
          <li>Sambungkan balok seperti <b>puzzle</b>; balok yang menggantung sendirian tidak ikut dijalankan.</li>
          <li><b>▶ Jalankan</b> memutar robot di peta contoh. <b>✔ Periksa</b> mengujinya di semua peta dan menyimpan hasilnya.</li>
        </ol>
        <div class="tbl-scroll"><table><thead><tr><th>Balok</th><th>Fungsi</th><th>Letaknya</th></tr></thead><tbody>
          ${baris.map(r => `<tr><td><code>${escHtml(r[0])}</code></td><td>${escHtml(r[1])}</td><td>${escHtml(r[2])}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="mu">Balok bawaan Blockly (perulangan, jika, variabel, matematika) memakai tulisan bahasa Inggris.</p>`;
    }

    // ---------- Papan robot kertas (tampilan siswa) ----------
    let robotS = null;          // sesi level yang sedang dibuka
    let ROBOT_PROG = {};        // level -> baris robot_progres milik siswa
    const RB_KECEPATAN = { pelan: 520, normal: 260, cepat: 110, instan: 0 };
    const RB_SVG = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="2" y="11" width="6" height="19" rx="1.6" fill="#1d2140"/><rect x="32" y="11" width="6" height="19" rx="1.6" fill="#1d2140"/>
      <rect x="7" y="8" width="26" height="28" rx="3" fill="#a5e2ab" stroke="#1d2140" stroke-width="2"/>
      <rect x="11" y="12" width="18" height="9" rx="2" fill="#fbf3b8" stroke="#1d2140" stroke-width="1.5"/>
      <circle cx="16" cy="16.5" r="2" fill="#1d2140"/><circle cx="24" cy="16.5" r="2" fill="#1d2140"/>
      <polygon points="20,1.5 26.5,9 13.5,9" fill="#f3c53b" stroke="#1d2140" stroke-width="1.8" stroke-linejoin="round"/>
      <rect x="14" y="26" width="12" height="5" rx="1" fill="#f4a9c3" stroke="#1d2140" stroke-width="1.2"/>
      <rect x="25" y="5" width="12" height="5" fill="rgba(255,255,255,.75)" transform="rotate(25 31 7)"/></svg>`;
    const rbTunggu = (ms) => new Promise(r => setTimeout(r, ms));
    const rbWaktu = (iso) => { try { return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return String(iso || ''); } };

    function labModeSiswa(m) {
      sesiSimpan({ lab: m });
      $id('labTugasWrap').classList.toggle('hidden', m === 'robot');
      $id('robotWrap').classList.toggle('hidden', m !== 'robot');
      $id('btnModeTugas').classList.toggle('active', m !== 'robot');
      $id('btnModeRobot').classList.toggle('active', m === 'robot');
      if (m === 'robot') robotMuatLevel();
    }

    function robotRenderLevel() {
      const el = $id('robotLevelGrid'); if (!el) return;
      const selesaiN = ROBOT_LEVEL.filter(l => ROBOT_PROG[l.no] && ROBOT_PROG[l.no].selesai).length;
      const berikut = (ROBOT_LEVEL.find(l => !(ROBOT_PROG[l.no] && ROBOT_PROG[l.no].selesai)) || {}).no;
      el.innerHTML = ROBOT_LEVEL.map(l => {
        const p = ROBOT_PROG[l.no];
        return `<button type="button" class="rb-lv ${p && p.selesai ? 'selesai' : ''} ${l.no === berikut ? 'berikut' : ''}" onclick="robotBuka(${l.no})">
          <span class="rb-lv-no">${l.no}</span><span class="rb-lv-ikon">${l.ikon}</span>
          <span class="rb-lv-nama">${escHtml(l.judul)}</span>
          <span class="rb-lv-st">${p && p.selesai ? '✔ selesai' : p ? escHtml(p.jumlah_coba) + '× coba' : 'baru'}</span></button>`;
      }).join('');
      $id('robotRingkas').textContent = `${selesaiN} dari ${ROBOT_LEVEL.length} level selesai` + (berikut ? ` · berikutnya: level ${berikut}` : ' · semua level selesai! 🎉');
    }

    function robotPeringatan(err) {
      const el = $id('robotCatatan'); if (!el) return;
      el.innerHTML = `<div class="rb-pesan warn">⚠️ Riwayat belum tersimpan ke database (${escHtml(err && err.message ? err.message : err)}). Beri tahu gurumu. Susunan balokmu tetap tersimpan di perangkat ini.</div>`;
    }

    async function robotMuatLevel() {
      robotRenderLevel();
      if (!activeUser || activeUser.role !== 'siswa') return;
      const r = await siswaBaca('robot_progres');
      if (r.error) { robotPeringatan(r.error); return; }
      $id('robotCatatan').innerHTML = '';
      ROBOT_PROG = {};
      (r.data || []).forEach(p => { ROBOT_PROG[p.level] = p; });
      robotRenderLevel();
    }

    function robotKunciDraf() { return `robot_${activeUser.id}_${robotS.no}`; }
    function robotSimpanDraf() {
      if (!robotS || !robotS.ws) return;
      const st = labSimpanState(robotS.ws);
      try { if (st) localStorage.setItem(robotKunciDraf(), st); } catch (_) {}
    }

    function robotBuatWorkspace(lv) {
      const el = $id('robotBlocklyDiv');
      el.innerHTML = '';
      return Blockly.inject(el, {
        toolbox: robotToolbox(lv), scrollbars: true, trashcan: true, sounds: false,
        zoom: { controls: true, wheel: false, startScale: 0.9, minScale: 0.5, maxScale: 1.6 },
        move: { scrollbars: true, drag: true, wheel: false }
      });
    }

    function robotBuka(no) {
      const lv = ROBOT_LEVEL[no - 1]; if (!lv) return;
      robotDefinisiBlok();
      if (robotS) { robotSimpanDraf(); robotS.token++; try { robotS.ws && robotS.ws.dispose(); } catch (_) {} }
      robotS = { no, lv, ws: null, mulai: Date.now(), jalankan: 0, petunjuk: 0, token: 0, rot: 0, pos: null, sel: 40, pt: lv.peta.map(robotParse), hasil: [] };
      $id('robotPanel').classList.remove('hidden');
      $id('robotHead').innerHTML = `<h3 style="margin:0 0 6px;">${lv.ikon} Level ${lv.no}: ${escHtml(lv.judul)} <span class="badge">${escHtml(lv.konsep)}</span></h3>
        <div class="soal-teks">${escHtml(lv.misi)}</div>
        <div class="ks-badges" style="margin-top:6px;">${lv.maks_blok ? `<span class="badge warn">Maks. ${lv.maks_blok} balok</span>` : ''}${lv.peta.length > 1 ? `<span class="badge">${lv.peta.length} peta uji</span>` : ''}${ROBOT_PROG[lv.no] && ROBOT_PROG[lv.no].selesai ? '<span class="badge ok">✔ Sudah selesai</span>' : ''}</div>`;
      $id('robotPanduanIsi').innerHTML = robotPanduanHTML(lv);
      $id('robotPetunjukIsi').innerHTML = '';
      const nPet = lv.petunjuk.length + (lv.pseudo ? 1 : 0);
      const b = $id('btnRobotPetunjuk'); b.classList.remove('hidden'); b.textContent = `💡 Petunjuk (0/${nPet})`;
      $id('robotPesan').innerHTML = ''; $id('robotHasil').innerHTML = '';
      robotS.ws = robotBuatWorkspace(lv);
      let dipulihkan = false;
      try { const draf = localStorage.getItem(robotKunciDraf()); if (draf) dipulihkan = labMuatState(robotS.ws, draf); } catch (_) {}
      if (!dipulihkan && ROBOT_PROG[no] && ROBOT_PROG[no].blok_terakhir) labMuatState(robotS.ws, ROBOT_PROG[no].blok_terakhir);
      const S = robotS;
      S.ws.addChangeListener((ev) => {
        if (ev && ev.isUiEvent) return;
        clearTimeout(S.tDraf); S.tDraf = setTimeout(robotSimpanDraf, 600);
      });
      try { Blockly.svgResize(S.ws); } catch (_) {}
      robotGambarPapan(S.pt[0]);
      robotRiwayatSiswa();
      $id('robotPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function robotTutup() {
      if (robotS) { robotSimpanDraf(); robotS.token++; try { robotS.ws && robotS.ws.dispose(); } catch (_) {} robotS = null; }
      $id('robotPanel').classList.add('hidden');
      robotRenderLevel();
    }

    function robotUkuranSel(pt) {
      const wrap = $id('robotPapanWrap');
      const lebar = (wrap && wrap.clientWidth) || 320;
      return Math.max(26, Math.min(52, Math.floor((lebar - 10) / pt.w)));
    }

    function robotGambarPapan(pt) {
      const S = robotS; const sel = robotUkuranSel(pt);
      let isi = '';
      for (let r = 0; r < pt.h; r++) for (let c = 0; c < pt.w; c++) {
        const key = r + ',' + c;
        if (pt.dinding[r][c]) isi += '<div class="rb-sel rb-w"></div>';
        else if (pt.tujuan && pt.tujuan.r === r && pt.tujuan.c === c) isi += '<div class="rb-sel rb-g"><span class="rb-bendera">🏁</span></div>';
        else isi += `<div class="rb-sel rb-f">${pt.bintang.has(key) ? `<span class="rb-bt" data-k="${key}">⭐</span>` : ''}</div>`;
      }
      const papan = $id('robotPapan');
      papan.style.gridTemplateColumns = `repeat(${pt.w}, ${sel}px)`;
      papan.style.gridAutoRows = sel + 'px';
      papan.style.width = (pt.w * sel) + 'px'; papan.style.height = (pt.h * sel) + 'px';
      papan.style.setProperty('--sel', sel + 'px');
      papan.innerHTML = isi + `<div class="rb-robot" id="robotRobot"><div class="rb-robot-in" id="robotRobotIn">${RB_SVG}</div></div><div class="rb-bubble hidden" id="robotBubble"></div>`;
      S.sel = sel; S.rot = RB_DIR.indexOf(pt.arah) * 90; S.pos = { r: pt.mulai.r, c: pt.mulai.c };
      robotPosisi();
    }

    function robotPosisi() {
      const S = robotS; const el = $id('robotRobot'); if (!el) return;
      el.style.width = el.style.height = S.sel + 'px';
      el.style.left = (S.pos.c * S.sel) + 'px'; el.style.top = (S.pos.r * S.sel) + 'px';
      $id('robotRobotIn').style.transform = `rotate(${S.rot}deg)`;
    }

    function robotTerapkan(e) {
      const S = robotS; const bub = $id('robotBubble');
      if (bub) bub.classList.add('hidden');
      if (e.t === 'maju') S.pos = { r: e.r, c: e.c };
      else if (e.t === 'kiri') S.rot -= 90;
      else if (e.t === 'kanan') S.rot += 90;
      else if (e.t === 'ambil' && e.ok) { const s = document.querySelector(`#robotPapan .rb-bt[data-k="${e.k}"]`); if (s) s.classList.add('rb-ambil'); }
      else if (e.t === 'tabrak') $id('robotRobot').classList.add('rb-tabrak');
      robotPosisi();
      if (e.t === 'katakan' && bub) {
        bub.textContent = e.teks; bub.classList.remove('hidden');
        bub.style.left = Math.max(0, e.c * S.sel + S.sel / 2 - 20) + 'px'; bub.style.top = Math.max(0, e.r * S.sel - 26) + 'px';
      }
    }

    async function robotPutar(sim, pt) {
      const S = robotS; const tok = ++S.token;
      robotGambarPapan(pt);
      const dur = RB_KECEPATAN[$id('robotKecepatan').value];
      const ms = dur === undefined ? 260 : dur;
      $id('robotPapan').style.setProperty('--dur', ms + 'ms');
      for (const e of sim.jejak.slice(1)) {
        if (tok !== S.token) return false;
        robotTerapkan(e);
        if (ms) await rbTunggu(ms + 30);
      }
      return tok === S.token;
    }

    function robotKode() { return labKodeJS(robotS.ws); }
    function robotJumlahBlok(ws) {
      try { return ws.getAllBlocks(false).filter(b => !(b.isShadow && b.isShadow())).length; } catch (_) { return null; }
    }
    function robotPesan(html, jenis) { $id('robotPesan').innerHTML = html ? `<div class="rb-pesan ${jenis || ''}">${html}</div>` : ''; }
    function robotTipsHTML(tips) {
      return tips.length ? `<div class="lab-tips">💡 <b>Kemungkinan penyebab</b><ul>${tips.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul></div>` : '';
    }

    async function robotJalankan() {
      const S = robotS; if (!S) return;
      let kode; try { kode = robotKode(); } catch (e) { return alert(e.message); }
      if (!kode.trim()) { robotPesan('Area kerja masih kosong. Buka kategori <b>Gerak</b>, seret balok ke area putih, lalu tekan Jalankan.', 'warn'); $id('robotHasil').innerHTML = ''; return; }
      S.jalankan++;
      $id('robotHasil').innerHTML = ''; robotPesan('');
      const pt = S.pt[0];
      const sim = robotSimulasi(kode, pt);
      const selesai = await robotPutar(sim, pt);
      if (!selesai || robotS !== S) return;
      const n = robotNilai(sim, pt, S.lv);
      if (n.lulus) robotPesan('✅ Robot berhasil di peta contoh! Tekan <b>✔ Periksa</b> untuk mengujinya di semua peta dan menyimpan hasilnya.', 'ok');
      else {
        const ket = n.alasan.map(a => RB_ALASAN[a]).join(' ');
        const harap = n.alasan.includes('ucapan_salah') && n.harapan !== null ? ` Seharusnya robot mengatakan ${escHtml(n.harapan)}, robotmu mengatakan ${escHtml(sim.ucapan[sim.ucapan.length - 1])}.` : '';
        robotPesan('❌ ' + escHtml(ket) + harap, 'bad');
        $id('robotHasil').innerHTML = robotTipsHTML(robotTips([{ no: 1, lulus: false, alasan: n.alasan }], S.lv, robotJumlahBlok(S.ws)));
      }
    }

    function robotReset() {
      const S = robotS; if (!S) return;
      S.token++; robotGambarPapan(S.pt[0]); robotPesan('');
    }
    function robotKosongkan() {
      const S = robotS; if (!S) return;
      if (!confirm('Hapus semua balok di area kerja?')) return;
      try { S.ws.clear(); } catch (_) {}
      robotSimpanDraf(); robotReset(); $id('robotHasil').innerHTML = '';
    }

    function robotPetunjuk() {
      const S = robotS; if (!S) return;
      const list = S.lv.petunjuk.map(t => ({ t })).concat(S.lv.pseudo ? [{ t: S.lv.pseudo, pseudo: true }] : []);
      if (S.petunjuk >= list.length) return;
      S.petunjuk++;
      $id('robotPetunjukIsi').innerHTML = list.slice(0, S.petunjuk).map((p, i) => p.pseudo
        ? `<div class="pembahasan">🧩 <b>Kerangka pseudokode</b><pre class="lab-pseudo">${escHtml(p.t)}</pre><div class="mu">Bagian bertanda ... harus kamu isi sendiri.</div></div>`
        : `<div class="pembahasan">💡 <b>Petunjuk ${i + 1}</b><div class="soal-teks">${escHtml(p.t)}</div></div>`).join('');
      const b = $id('btnRobotPetunjuk');
      if (S.petunjuk >= list.length) b.classList.add('hidden'); else b.textContent = `💡 Petunjuk berikutnya (${S.petunjuk}/${list.length})`;
    }

    async function robotPeriksa() {
      const S = robotS; if (!S) return;
      let kode; try { kode = robotKode(); } catch (e) { return alert(e.message); }
      if (!kode.trim()) { robotPesan('Area kerja masih kosong. Susun balok dulu sebelum diperiksa.', 'warn'); $id('robotHasil').innerHTML = ''; return; }
      robotPesan('');
      const jb = robotJumlahBlok(S.ws);
      const hasil = robotPeriksaSemua(kode, S.lv);
      S.hasil = hasil;
      const batasOk = !S.lv.maks_blok || jb === null || jb <= S.lv.maks_blok;
      const lulusPeta = hasil.filter(h => h.lulus).length;
      const lulus = lulusPeta === hasil.length && batasOk;
      const barisHtml = hasil.map((h, i) => {
        const ket = h.alasan.map(a => RB_ALASAN[a]).join(' ');
        const harap = i === 0 && h.alasan.includes('ucapan_salah') && h.harapan !== null ? ` Seharusnya mengatakan ${h.harapan}, robotmu mengatakan ${h.sim.ucapan[h.sim.ucapan.length - 1]}.` : '';
        return `<div class="lab-kasus ${h.lulus ? 'lulus' : 'gagal'}">
          <b>${h.lulus ? '✅' : '❌'} Peta ${h.no}${i === 0 ? ' (contoh)' : ' (uji)'}</b>
          ${h.lulus ? `<div class="mu">${h.sim.langkah} langkah${h.sim.total ? `, ${h.sim.diambil} bintang diambil` : ''}</div>` : `<div class="lab-galat">${escHtml(ket + harap)}</div>`}
          ${!h.lulus ? `<div class="ks-aksi"><button type="button" class="alt" onclick="robotLihatPeta(${i})">▶ Putar ulang peta ini</button></div>` : ''}
        </div>`;
      }).join('');
      const tips = lulus ? [] : robotTips(hasil, S.lv, jb);
      const sudahSelesai = !!(ROBOT_PROG[S.no] && ROBOT_PROG[S.no].selesai);
      $id('robotHasil').innerHTML = `<div class="rb-skor"><span class="badge ${lulus ? 'ok' : lulusPeta ? 'warn' : 'bad'}">Lulus ${lulusPeta} dari ${hasil.length} peta</span>
          ${S.lv.maks_blok ? `<span class="badge ${batasOk ? 'ok' : 'bad'}">${jb === null ? '?' : jb} dari maks ${S.lv.maks_blok} balok</span>` : ''}</div>
        ${lulus ? `<div class="rb-pesan ok">🎉 <b>Level ${S.no} selesai!</b>${sudahSelesai ? '' : ' Hasilnya sudah dicatat.'} ${S.no < ROBOT_LEVEL.length ? `<div class="ks-aksi"><button type="button" onclick="robotBuka(${S.no + 1})">Level ${S.no + 1} ▶</button></div>` : 'Kamu menamatkan semua level!'}</div>` : ''}
        ${barisHtml}${robotTipsHTML(tips)}`;
      const ringkas = hasil.map(h => `Peta ${h.no} ${h.lulus ? 'ok' : 'gagal (' + (h.alasan[0] || '?') + ')'}`).join(', ') + (batasOk ? '' : `, melebihi batas balok (${jb}/${S.lv.maks_blok})`);
      await robotCatat(lulus, { langkah: hasil[0].sim.langkah, teks: ringkas }, jb);
    }

    async function robotLihatPeta(i) {
      const S = robotS; const h = S && S.hasil[i]; if (!h) return;
      $id('robotPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      robotPesan(`Memutar ulang peta ${h.no}…`);
      const ok = await robotPutar(h.sim, h.pt);
      if (ok && robotS === S) robotPesan(`Peta ${h.no}: ❌ ${escHtml(h.alasan.map(a => RB_ALASAN[a]).join(' '))}`, 'bad');
    }

    async function robotCatat(lulus, ringkas, jumlahBlok) {
      const S = robotS; const sid = String(activeUser.id); const no = S.no;
      const blok = labSimpanState(S.ws);
      // Riwayat + progres level dicatat & dihitung di server (keamanan_4b.sql); siswa_id dari token.
      const w = await db.rpc('siswa_robot_catat', { p_token: sesiToken, p_data: {
        level: no, lulus, jumlah_blok: jumlahBlok, langkah: ringkas.langkah,
        jumlah_jalankan: S.jalankan, detik: Math.round((Date.now() - S.mulai) / 1000), ringkasan: ringkas.teks, blok
      } });
      if (w.error) { if (galatSesi(w.error.message)) { sesiHabis(); return false; } robotPeringatan(w.error); return false; }
      S.jalankan = 0;
      ROBOT_PROG[no] = w.data || { ...(ROBOT_PROG[no] || {}), siswa_id: sid, level: no };
      $id('robotCatatan').innerHTML = '';
      robotRenderLevel();
      if (robotS === S) robotRiwayatSiswa();
      return true;
    }

    async function robotRiwayatSiswa() {
      const S = robotS; const box = $id('robotRiwayat'); if (!S || !box) return;
      const r = await siswaBaca('robot_riwayat', { level: S.no, limit: 8 });
      if (robotS !== S) return;
      if (r.error) { box.innerHTML = `<p class="mu">Riwayat belum bisa dimuat: ${escHtml(r.error.message)}</p>`; return; }
      const d = r.data || [];
      box.innerHTML = d.length ? `<div class="tbl-scroll"><table><thead><tr><th>Waktu</th><th>Hasil</th><th>Balok</th><th>Catatan</th></tr></thead><tbody>
        ${d.map(x => `<tr><td>${escHtml(rbWaktu(x.created_at))}</td><td>${x.lulus ? '✅ lulus' : '❌ belum'}</td><td>${escHtml(x.jumlah_blok ?? '-')}</td><td class="mu">${escHtml(x.ringkasan || '')}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="mu">Belum ada percobaan di level ini. Tekan ✔ Periksa untuk mencatat hasilmu.</p>';
    }

    // ---------- Guru: progres dan histori robot ----------
    const RG = { kelas: '', siswa: [], prog: [], sid: null, nama: '', riwayat: [], ws: null };

    function labModeGuru(m) {
      sesiSimpan({ lab: m });
      $id('labGuruTugasWrap').classList.toggle('hidden', m === 'robot');
      $id('robotGuruWrap').classList.toggle('hidden', m !== 'robot');
      $id('btnGModeTugas').classList.toggle('active', m !== 'robot');
      $id('btnGModeRobot').classList.toggle('active', m === 'robot');
    }

    function robotGuruInit() {
      const s = $id('rgKelas'); if (!s) return;
      s.innerHTML = DAFTAR_KELAS.map(k => `<option value="${k}">Kelas ${k}</option>`).join('');
      $id('rgLevel').innerHTML = '<option value="">Semua level</option>' + ROBOT_LEVEL.map(l => `<option value="${l.no}">Level ${l.no}: ${escHtml(l.judul)}</option>`).join('');
    }

    async function robotGuruMuat() {
      const kelas = $id('rgKelas').value; const box = $id('rgTabel');
      box.innerHTML = 'Memuat…';
      const s = await ambilSiswaKelas(kelas);
      if (s.error) { box.innerHTML = `<p class="mu">Gagal memuat siswa: ${escHtml(s.error.message)}</p>`; return; }
      const ids = (s.data || []).map(x => String(x.id));
      let prog = [];
      if (ids.length) {
        const p = await guruBaca('robot_progres', 'siswa_id', ids);
        if (p.error) { box.innerHTML = `<p class="mu">Gagal memuat progres: ${escHtml(p.error.message)}. Pastikan robot.sql sudah dijalankan.</p>`; return; }
        prog = p.data || [];
      }
      RG.kelas = kelas; RG.siswa = s.data || []; RG.prog = prog;
      $id('rgRiwayatCard').classList.add('hidden');
      robotGuruRender();
    }

    function robotGuruRender() {
      const box = $id('rgTabel');
      if (!RG.siswa.length) { box.innerHTML = '<p class="mu">Belum ada siswa di kelas ini.</p>'; return; }
      const cell = (sid, no) => {
        const p = RG.prog.find(x => String(x.siswa_id) === String(sid) && Number(x.level) === no);
        if (!p) return '<td class="rg-kosong">·</td>';
        return p.selesai ? `<td class="rg-ok" title="Selesai, ${escHtml(p.jumlah_coba)}× periksa">✔<small>${escHtml(p.jumlah_coba)}</small></td>`
                         : `<td class="rg-coba" title="Belum selesai, ${escHtml(p.jumlah_coba)}× periksa">▫<small>${escHtml(p.jumlah_coba)}</small></td>`;
      };
      const baris = RG.siswa.map(sw => {
        const mine = RG.prog.filter(x => String(x.siswa_id) === String(sw.id));
        const selesai = mine.filter(x => x.selesai).length, coba = mine.reduce((a, x) => a + (x.jumlah_coba || 0), 0);
        return `<tr><td><button type="button" class="alt rg-nama" onclick="robotGuruRiwayat('${escHtml(String(sw.id))}')">${escHtml(sw.nama)}</button></td>
          ${ROBOT_LEVEL.map(l => cell(sw.id, l.no)).join('')}<td><b>${selesai}</b>/10</td><td>${coba}</td></tr>`;
      }).join('');
      box.innerHTML = `<table class="rg-tabel"><thead><tr><th>Nama</th>${ROBOT_LEVEL.map(l => `<th title="${escHtml(l.judul)}">${l.no}</th>`).join('')}<th>Selesai</th><th>Coba</th></tr></thead><tbody>${baris}</tbody></table>
        <p class="mu">✔ = level selesai (angka kecil = berapa kali Periksa). ▫ = sudah dicoba, belum selesai. Klik nama untuk melihat histori.</p>`;
    }

    function robotGuruCSV() {
      if (!RG.siswa.length) return alert('Tampilkan kelas dulu.');
      const rows = [['Nama', 'Kelas', 'Level selesai', ...ROBOT_LEVEL.map(l => `L${l.no} ${l.judul}`), 'Total periksa', 'Terakhir aktif']];
      RG.siswa.forEach(sw => {
        const mine = RG.prog.filter(x => String(x.siswa_id) === String(sw.id));
        const per = ROBOT_LEVEL.map(l => { const p = mine.find(x => Number(x.level) === l.no); return !p ? '' : (p.selesai ? 'selesai' : 'belum') + ` (${p.jumlah_coba}x)`; });
        const akhir = mine.map(x => x.updated_at).filter(Boolean).sort().pop() || '';
        rows.push([sw.nama, sw.kelas, mine.filter(x => x.selesai).length, ...per, mine.reduce((a, x) => a + (x.jumlah_coba || 0), 0), akhir ? rbWaktu(akhir) : '']);
      });
      unduhCSV(`progres_robot_${RG.kelas}.csv`, rows);
    }

    async function robotGuruRiwayat(sid) {
      const sw = RG.siswa.find(x => String(x.id) === String(sid));
      RG.sid = String(sid); RG.nama = sw ? sw.nama : String(sid);
      const r = await guruBaca('robot_riwayat', 'siswa_id', [RG.sid], 300);
      if (r.error) { alert('Gagal memuat riwayat: ' + r.error.message); return; }
      RG.riwayat = r.data || [];
      $id('rgRiwayatCard').classList.remove('hidden');
      $id('rgRiwayatJudul').textContent = `Riwayat Robot — ${RG.nama}`;
      $id('rgBlokWrap').classList.add('hidden');
      robotGuruRiwayatRender();
      $id('rgRiwayatCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function robotGuruRiwayatRender() {
      const lv = $id('rgLevel').value;
      const d = RG.riwayat.filter(x => !lv || String(x.level) === String(lv));
      $id('rgRiwayat').innerHTML = d.length ? `<table><thead><tr><th>Waktu</th><th>Level</th><th>Hasil</th><th>Balok</th><th>Langkah</th><th>Jalankan</th><th>Detik</th><th>Catatan</th><th></th></tr></thead><tbody>
        ${d.map(x => `<tr><td>${escHtml(rbWaktu(x.created_at))}</td><td>${escHtml(x.level)}</td><td>${x.lulus ? '✅' : '❌'}</td><td>${escHtml(x.jumlah_blok ?? '-')}</td><td>${escHtml(x.langkah ?? '-')}</td><td>${escHtml(x.jumlah_jalankan ?? 0)}</td><td>${escHtml(x.detik ?? '-')}</td><td class="mu">${escHtml(x.ringkasan || '')}</td>
          <td>${x.blok ? `<button type="button" class="alt" onclick="robotGuruBlok('${escHtml(String(x.id))}')">🧩 Balok</button>` : ''}</td></tr>`).join('')}
        </tbody></table>` : '<p class="mu">Belum ada riwayat untuk pilihan ini.</p>';
    }

    function robotGuruBlok(id) {
      const x = RG.riwayat.find(r => String(r.id) === String(id)); if (!x || !x.blok) return;
      robotDefinisiBlok();
      if (RG.ws) { try { RG.ws.dispose(); } catch (_) {} RG.ws = null; }
      $id('rgBlokWrap').classList.remove('hidden');
      $id('rgBlokJudul').textContent = `Balok Level ${x.level} — ${rbWaktu(x.created_at)} (${x.lulus ? 'lulus' : 'belum lulus'})`;
      RG.ws = labBuatWorkspace('rgBlokDiv', null, { readOnly: true });
      labMuatState(RG.ws, x.blok);
      try { Blockly.svgResize(RG.ws); } catch (_) {}
    }

    function robotGuruCSVRiwayat() {
      if (!RG.riwayat.length) return alert('Pilih siswa dulu.');
      const rows = [['Nama', 'Waktu', 'Level', 'Aksi', 'Hasil', 'Jumlah balok', 'Langkah', 'Jumlah jalankan', 'Detik', 'Catatan']];
      RG.riwayat.slice().reverse().forEach(x => rows.push([RG.nama, x.created_at, x.level, x.aksi, x.lulus ? 'lulus' : 'belum', x.jumlah_blok ?? '', x.langkah ?? '', x.jumlah_jalankan ?? '', x.detik ?? '', x.ringkasan || '']));
      unduhCSV(`riwayat_robot_${RG.nama.replace(/\s+/g, '_')}.csv`, rows);
    }

  

