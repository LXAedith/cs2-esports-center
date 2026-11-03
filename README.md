# Espor Merkezi

LoL, CS2, Valorant, Dota 2, Overwatch, R6, Rocket League ve diğer oyunlarda:

- **Canlı** maçlar: karta tıklayınca resmi yayın (Twitch, YouTube, Kick…) yeni sekmede açılır
- **Yaklaşan** maçlar: önümüzdeki 7 gün, güne göre gruplu
- **Sonuçlar**: son 7 günün biten maçları
- **Ligler**: aktif turnuvalar, puan durumu, turnuvanın sıradaki maçları ve son sonuçları
- **Takımlar**: logo ve adıyla görünür; Liquipedia'da sayfası varsa takıma tıklayınca o sayfa açılır

Sunucu yok: GitHub Actions her 10 dakikada bir [PandaScore](https://pandascore.co) API'sinden veriyi çeker,
`site/data/esports.json` olarak yazar ve siteyi GitHub Pages'e yayınlar. API anahtarı bir GitHub secret'ında durur,
tarayıcıya hiç gitmez.

### Liquipedia bağlantıları

Her takım adı ilgili oyunun Liquipedia wiki'sinde aranır (ör. `counterstrike`, `leagueoflegends`) ve yalnızca
takım veya oyuncu sayfası çıkarsa bağlantı eklenir; yönlendirmeler izlenir (ör. "Gen.G" → "Gen.G Esports").
[Liquipedia API kurallarına](https://liquipedia.net/api-terms-of-use) uygun olarak:

- istekler arasında 2 saniye beklenir, tek istekte 50 ad sorgulanır, çalıştırma başına en fazla 20 istek atılır;
- sonuçlar `cache/liquipedia.json` dosyasında saklanır ve iş akışı bunu GitHub Actions önbelleğiyle bir sonraki
  çalıştırmaya taşır (bulunanlar 30 gün, bulunamayanlar 3 gün sonra yeniden sorulur);
- User-Agent'ta deponun adresi iletişim bilgisi olarak gönderilir.

Adı Liquipedia'dakinden farklı yazılan takımlar (ör. "Fenerbahçe Espor" / "Fenerbahçe Esports") bağlantısız kalır.
Liquipedia'ya ulaşılamazsa site bağlantısız olarak yayınlanmaya devam eder.

Oyun simgeleri [Simple Icons](https://simpleicons.org) (CC0) projesinden alındı; simgesi olmayan oyunlar
kısaltmayla gösterilir. Markalar sahiplerine aittir.

## Kurulum

1. **PandaScore anahtarı:** [pandascore.co](https://pandascore.co) üzerinden ücretsiz hesap açın ve panelden
   API token'ınızı kopyalayın. Ücretsiz plan saatte 1000 istek verir; bu site saatte yaklaşık 300–350 istek kullanır.
2. **Depo:** GitHub'da **public** bir depo açıp bu klasörü `main` dalına gönderin.
   (Ücretsiz hesapta Pages için public depo gerekir; public depolarda Actions dakikaları sınırsızdır.)
3. **Secret:** Depo → *Settings → Secrets and variables → Actions → New repository secret*
   - Ad: `PANDASCORE_TOKEN`
   - Değer: PandaScore token'ınız
4. **Pages:** Depo → *Settings → Pages → Build and deployment → Source:* **GitHub Actions**
5. **İlk yayın:** *Actions → "Veri güncelle ve yayınla" → Run workflow*. Birkaç dakika sonra site
   `https://<kullanıcı-adı>.github.io/<depo-adı>/` adresinde açılır.

Token eklenmeden yayınlanırsa site demo veriyle açılır ve üstte bunu belirten bir uyarı görünür.

## Yerelde çalıştırma

```bash
node scripts/fetch-data.mjs --demo
```

```bash
python3 -m http.server 8000 --directory site
```

Sonra `http://localhost:8000` adresini açın. Gerçek veriyle denemek için `--demo` yerine token verin:

```bash
PANDASCORE_TOKEN=xxxxx node scripts/fetch-data.mjs
```

## Ayarlar

`scripts/fetch-data.mjs` şu ortam değişkenlerini okur (iş akışında `env:` altına eklenebilir):

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `DAYS_AHEAD` | `7` | Kaç gün sonrasına kadar fikstür çekilsin |
| `DAYS_BACK` | `7` | Kaç gün öncesine kadar sonuç çekilsin |
| `MAX_PAGES` | `6` | Her liste için en fazla sayfa (sayfa başına 100 maç) |
| `MAX_STANDINGS` | `40` | Puan durumu çekilecek en fazla turnuva (önce S/A seviye) |
| `GAMES` | LoL, CS2, Dota 2, Valorant, … | Virgülle ayrılmış PandaScore oyun kısa adları |
| `LIQUIPEDIA` | `1` | `0` verilirse Liquipedia bağlantıları aranmaz |
| `LIQUIPEDIA_MAX_REQUESTS` | `20` | Çalıştırma başına en fazla Liquipedia isteği |
| `LIQUIPEDIA_CONTACT` | — | User-Agent'a eklenecek iletişim bilgisi (isteğe bağlı) |

e-soccer, e-basketball gibi simülasyon oyunları günde yüzlerce maç ürettiği için varsayılan listede yok.

## Notlar

- Veri en fazla ~10 dakika gecikmeli olur; GitHub yoğun saatlerde zamanlanmış işleri biraz geciktirebilir.
- Depoda 60 gün hiç commit olmazsa GitHub zamanlanmış iş akışlarını durdurur. *Actions* sekmesinden tekrar
  etkinleştirmeniz yeterli.
- Geçmiş maçlarda bağlantı, maçın yayınlandığı resmi kanala gider (tekrar izlemek için).
- "Büyük turnuvalar" düğmesi yalnızca PandaScore'un S ve A seviye olarak işaretlediği turnuvaları gösterir.

## Yapı

```
site/                 GitHub Pages'e yayınlanan statik site
  index.html
  assets/style.css
  assets/app.js
  assets/game-icons.js
  data/esports.json   iş akışı tarafından üretilir (depoda yok)
scripts/
  fetch-data.mjs      PandaScore'dan veri çeker
  liquipedia.mjs      takımları Liquipedia sayfalarıyla eşleştirir
  demo-data.mjs       token yokken örnek veri üretir
cache/                Liquipedia önbelleği (depoda yok)
.github/workflows/deploy.yml
```
