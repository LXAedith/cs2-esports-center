// Tarayıcı içinde çalışan arayüz kontrolleri. Her sorun { check, severity, detail } döner.
// severity: "error" kalite kapısını düşürür, "warn" yalnızca raporlanır.
// Bu fonksiyon page.evaluate ile sayfaya gönderildiği için dışarıdan hiçbir şeye bağımlı olmamalı.
export function runChecks() {
  const issues = [];
  const add = (check, detail, severity = 'error') => issues.push({ check, severity, detail });
  const root = document.documentElement;
  const vw = root.clientWidth;
  const visible = el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const describe = el => {
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${cls}`;
  };
  const overlap = (a, b) => {
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return x > 2 && y > 2 ? x * y : 0;
  };

  // 1. Yatay taşma: sayfa ekrandan geniş olmamalı.
  if (root.scrollWidth > vw + 1) {
    const offenders = [...document.querySelectorAll('body *')]
      .filter(el => visible(el) && el.getBoundingClientRect().right > vw + 1)
      .slice(-3)
      .map(describe);
    add('yatay-tasma', `sayfa ${root.scrollWidth}px, ekran ${vw}px (${offenders.join(', ')})`);
  }

  // 2. Bozuk metin: veri eksikliği ekrana sızmamalı.
  const text = document.body.innerText;
  for (const bad of ['undefined', 'NaN', '[object Object]', 'null', 'Invalid Date']) {
    if (text.includes(bad)) add('bozuk-metin', `sayfada "${bad}" geçiyor`);
  }

  // 3. Detay bağlantısı akış dışında olmalı (satır/kart ızgarasında hücre kaplamamalı).
  for (const a of document.querySelectorAll('.stretched')) {
    if (getComputedStyle(a).position !== 'absolute') {
      add('gizli-baglanti-akista', `${describe(a.parentElement)} içindeki detay bağlantısı ızgarada yer kaplıyor`);
      break;
    }
  }

  // 4. Maç satırları: bölgeler çakışmamalı; geniş düzende tek satırda hizalı ve alçak olmalı.
  const rows = [...document.querySelectorAll('.row')].filter(visible).slice(0, 60);
  let misaligned = 0, tall = 0, collide = 0, sample = null;
  for (const row of rows) {
    const parts = ['.row-time', '.row-match', '.row-meta', '.row-action']
      .map(sel => row.querySelector(`:scope > ${sel}`))
      .filter(el => el && visible(el));
    const rects = parts.map(el => el.getBoundingClientRect());
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (overlap(rects[i], rects[j])) { collide++; sample ??= `${describe(parts[i])} × ${describe(parts[j])}`; }
      }
    }
    const wide = row.parentElement.getBoundingClientRect().width > 860;
    if (wide) {
      const centers = rects.map(r => r.top + r.height / 2);
      if (Math.max(...centers) - Math.min(...centers) > 10) misaligned++;
      if (row.getBoundingClientRect().height > 76) tall++;
    }
  }
  // Skoru olan her satırda skor bir biçimde görünmeli (geniş düzende ortada, dar düzende takım yanında).
  const hidden = rows.filter(r => r.classList.contains('scored') &&
    ![...r.querySelectorAll('.mid.score, .side-score')].some(visible)).length;
  if (hidden) add('skor-gorunmuyor', `${hidden} sonuçlu satırda skor görünmüyor`);
  if (collide) add('satir-cakisma', `${collide} çakışma (${sample})`);
  if (misaligned) add('satir-hizasi', `${misaligned}/${rows.length} satırda bölgeler aynı hizada değil`);
  if (tall) add('satir-yuksekligi', `${tall}/${rows.length} satır 76px'ten yüksek`);

  // 5. Takım adları: geniş ekranlarda okunacak kadar yer olmalı.
  const names = [...document.querySelectorAll('.row .name, .team-row .name, .hero-team .name, .standings .name, .cmp-head .name')]
    .filter(visible);
  const narrow = names.filter(el => el.clientWidth < (vw >= 1000 ? 110 : 56) && el.scrollWidth > el.clientWidth + 1);
  const cut = names.filter(el => el.scrollWidth > el.clientWidth + 1);
  if (narrow.length) add('isim-cok-dar', `${narrow.length} takım adı kesik ve dar (ör. "${narrow[0].textContent}" ${narrow[0].clientWidth}px)`);
  if (names.length >= 6 && cut.length / names.length > (vw >= 1000 ? 0.1 : 0.35)) {
    add('isim-kesilme-orani', `${cut.length}/${names.length} takım adı kesik`, 'warn');
  }

  // 6. Kart iç parçaları çakışmamalı.
  for (const card of [...document.querySelectorAll('.card')].filter(visible)) {
    const parts = [...card.children].filter(el => !el.classList.contains('stretched') && visible(el));
    const rects = parts.map(el => el.getBoundingClientRect());
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (overlap(rects[i], rects[j])) add('kart-cakisma', `${describe(parts[i])} × ${describe(parts[j])}`);
      }
    }
  }

  // 7. Üst bar makul yükseklikte olmalı; yapışkan gün başlığı onun altında kalmamalı.
  const bar = document.querySelector('.topbar');
  if (bar) {
    const h = bar.getBoundingClientRect().height;
    const max = vw > 900 ? 72 : 130;
    if (h > max) add('ust-bar-yuksekligi', `üst bar ${Math.round(h)}px (en fazla ${max})`);
  }
  const day = document.querySelector('.day-title');
  if (bar && day) {
    const diff = Math.abs(parseFloat(getComputedStyle(day).top) - bar.getBoundingClientRect().height);
    if (diff > 3) add('yapiskan-baslik', `gün başlığı top=${getComputedStyle(day).top}, üst bar ${Math.round(bar.getBoundingClientRect().height)}px`);
  }

  // 8. Puan tablosu: son maç sonucu, takımın seri skoruyla çelişmemeli (ör. "G" ama hiç galibiyet yok).
  // Herkesin "M" görünmesi tek başına hata değil: PandaScore bazı playofflarda yalnızca elenenleri verir.
  for (const table of document.querySelectorAll('table.standings.bracket')) {
    let wrong = 0;
    for (const tr of table.querySelectorAll('tbody tr:not(.gap)')) {
      const m = /^(\d+)–(\d+)$/.exec(tr.children[2]?.textContent.trim() ?? '');
      const last = tr.querySelector('.fp')?.textContent.trim();
      if (m && ((last === 'G' && m[1] === '0') || (last === 'M' && m[2] === '0'))) wrong++;
    }
    if (wrong) add('puan-tablosu-tutarsiz', `${wrong} satırda son maç sonucu seri skoruyla çelişiyor`);
  }

  // Eleme tablosu seri skoruna göre sıralı olmalı (0–2 elenen takım tepede durmamalı).
  for (const table of document.querySelectorAll('table.standings.bracket')) {
    const records = [...table.querySelectorAll('tbody tr:not(.gap)')]
      .map(tr => /^(\d+)–(\d+)$/.exec(tr.children[2]?.textContent.trim() ?? ''))
      .filter(Boolean).map(m => [Number(m[1]), Number(m[2])]);
    const unordered = records.some((r, i) => i && (r[0] > records[i - 1][0] || (r[0] === records[i - 1][0] && r[1] < records[i - 1][1])));
    if (unordered) add('puan-tablosu-sirasi', 'eleme tablosu seri skoruna göre sıralı değil');
  }

  // Galibiyet/mağlubiyet sayıları renkli; sıfır ise renksiz olmalı.
  const coloredZero = [...document.querySelectorAll('.standings .w, .standings .l')].filter(el => el.textContent.trim() === '0').length;
  if (coloredZero) add('renkli-sifir', `${coloredZero} sıfır değeri yeşil/kırmızı boyanmış`);

  // Tablo hücreleri başka bir bileşen sınıfı yüzünden flex/blok kutuya dönüşmemeli.
  const badCells = [...document.querySelectorAll('table td, table th')]
    .filter(c => !['table-cell', 'none'].includes(getComputedStyle(c).display));
  if (badCells.length) add('tablo-hucresi-bozuk', `${badCells.length} hücre tablo hücresi gibi davranmıyor (ör. ${describe(badCells[0])})`);

  // 9. Kırık görseller (yedek baş harf devreye girmeli).
  const broken = [...document.querySelectorAll('img')].filter(img => img.complete && img.naturalWidth === 0);
  if (broken.length) add('kirik-gorsel', `${broken.length} görsel yüklenemedi`, 'warn');

  // 10. Mobilde dokunma hedefleri yeterince büyük olmalı.
  if (vw < 500) {
    const small = [...document.querySelectorAll('button, .chip, .btn, .stream-btn, .watch, .tabs a, .back')]
      .filter(visible).filter(el => el.getBoundingClientRect().height < 30);
    if (small.length) add('dokunma-hedefi', `${small.length} düğme 30px'ten alçak (ör. ${describe(small[0])})`, 'warn');
  }

  // 11. Renk kontrastı (WCAG): tema renk çiftleri.
  const css = getComputedStyle(root);
  const rgb = hex => {
    const v = css.getPropertyValue(hex).trim();
    const m = /^#([0-9a-f]{6})$/i.exec(v);
    return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255) : null;
  };
  const lum = c => c.map(x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [fg, bg, min, severity] of [
    ['--text', '--surface', 7, 'error'], ['--muted', '--surface', 4.5, 'error'], ['--muted', '--bg', 4.5, 'error'],
    ['--faint', '--surface', 3, 'error'], ['--faint', '--surface', 4.5, 'warn'], ['--accent-ink', '--surface', 4.5, 'error'],
    ['--accent-ink', '--bg', 4.5, 'error'],
    ['--live', '--surface', 3, 'error'], ['--win', '--surface', 3, 'error'], ['--team-b', '--surface', 3, 'error'],
  ]) {
    const a = rgb(fg), b = rgb(bg);
    if (!a || !b) continue;
    const r = ratio(a, b);
    if (r < min) add('kontrast', `${fg} / ${bg} = ${r.toFixed(2)} (en az ${min})`, severity);
  }

  // 12. Sekmeler sığmalı (kaydırınca saklanan sekme olmamalı).
  const tabs = document.querySelector('.tabs');
  if (tabs && tabs.scrollWidth > tabs.clientWidth + 1) add('sekme-tasmasi', `sekmeler ${tabs.scrollWidth}px, alan ${tabs.clientWidth}px`);

  // 13. Dar düzendeki maç satırları da derli toplu kalmalı.
  const narrowTall = rows.filter(r => r.parentElement.getBoundingClientRect().width <= 860 && r.getBoundingClientRect().height > 110);
  if (narrowTall.length) add('dar-satir-yuksekligi', `${narrowTall.length} satır 110px'ten yüksek`, 'warn');

  // 14. Görünümün boş kalmaması.
  const view = document.querySelector('#view');
  if (view && !view.children.length) add('bos-gorunum', 'içerik çizilmedi');

  return issues;
}
