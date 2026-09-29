# Birleşik paket — D16 + D17 + D18 + D20 + D21 (tek yükleme)

**Repo: `feelyrics-app`** · 40 dosya · **1 migration** · **3 ortam değişkeni** (yalnız Spotify için)

Beş ayrı zip, güncel HEAD'in (`ee5815d`, D24 dahil) üstünde tek ağaçta birleştirildi ve
zincirin tamamı çalıştırılarak doğrulandı. Sırayla yüklemeye gerek yok: **bir yükleme,
bir SQL, bir redeploy.**

---

## 1. Yükleme

1. Zip'i aç.
2. **Açtığın klasörün İÇİNE gir** (⌘A ile içindekileri seç) — `drizzle`, `messages`,
   `src`, `tests` klasörleri ve dosyalar. Klasörün *kendisini* sürükleme.
3. **feelyrics-app → Add file → Upload files** → sürükle → **Commit changes.**

> `.github/workflows/ci.yml` ve `.gitignore` nokta ile başladığı için Finder'da
> görünmez. Onları ayrıca ekle: **Add file → Create new file** → dosya adı kutusuna
> `.github/workflows/ci.yml` yaz → zip'teki **`GITHUB-WORKFLOW-KOPYALA.txt`**
> içeriğini yapıştır → Commit. Aynısını `.gitignore` için
> **`GITIGNORE-KOPYALA.txt`** ile tekrarla. (İkisi de isteğe bağlı; atlarsan
> uygulama yine çalışır, yalnız otomatik kontrol kurulmamış olur.)

## 2. Migration (Neon) — yüklemeden sonra

Neon → **SQL Editor** → zip'teki **`NEON-MIGRATION.sql`** dosyasının içeriğini
yapıştır → Run. Dört ifade:

```sql
CREATE TYPE "public"."request_channel" AS ENUM('direct','tt','ig','yt','x','rd','hn','other');
ALTER TABLE "song_requests" ADD COLUMN "channel" "request_channel" DEFAULT 'direct' NOT NULL;
ALTER TABLE "song_requests" ADD COLUMN "ready_at" timestamp with time zone;
CREATE INDEX "requests_channel_idx" ON "song_requests" USING btree ("channel","created_at");
```

Mevcut istekler `direct` olarak işaretlenir, eski kayıtların `ready_at`'i boş kalır —
geçmiş uydurulmuyor.

## 3. Ortam değişkenleri (yalnız Spotify araması için)

Vercel → Settings → Environment Variables:

| Ad | Değer |
| --- | --- |
| `SPOTIFY_CLIENT_ID` | Dashboard → uygulaman → Settings |
| `SPOTIFY_CLIENT_SECRET` | aynı ekran → View client secret |
| `SPOTIFY_MARKET` | `TR` |

`NEXT_PUBLIC_` öneki **kullanma** — secret'ı tarayıcı paketine gömer. Key girilmezse
özellik kendini "kapalı" olarak gösterir, link yapıştırma eskisi gibi çalışır.

## 4. Sonra: redeploy

Vercel → en üstteki deploy → **Redeploy** (ya da zaten otomatik build tetiklenir).
Ardından **`/api/health/schema`** adresini aç: `{"ok":true,"missing":0}` görüyorsan
migration geçmiştir. `schema_behind` görürsen SQL çalışmamıştır.

---

## Pakette ne var

| Parça | Ne geliyor |
| --- | --- |
| **D16** | `?src=` kanal işareti istek kaydına yazılıyor (`tt·ig·yt·x·rd·hn`, tanınmayan → `other`, işaretsiz → `direct`), ilk ready anında `ready_at` damgası, admin → Requests başında "kanala göre istekler · son 7 gün" şeridi |
| **D17** | Şarkı sayfası başlığı artık aranan cümle: `/en` "English translation & meaning", `/tr` "İngilizce çeviri ve anlamı", `/es` "traducción al inglés y significado" (12 kombinasyon); açıklama hedef dilde feel profiliyle açılıyor; `x-default` hedef dilin sayfası; sitemap'te gerçek `lastModified` |
| **D18** | Motor taslağı yayın barajına göre notlanıyor: satırı geri veren taslak reddediliyor, notsuz/etiketsiz taslak "thin" olarak yayınlanıp log'a düşüyor; not barajı uzunluğa göre; prompt v0.2.2 |
| **D20** | Senkron panelinde "Spotify'da bul": şarkı adı + sanatçıdan parçayı bulup embed'i açıyor; üç sonuçlu eşleştirici (yüksek güven / kısa liste / link alanı), Türkçe `ı` katlaması, önbellek + saatlik sınır |
| **D21** | GitHub Actions: her push'ta tip + lint + testler, ayrıca boş PostgreSQL → migration → seed → gerçek build → tarayıcı testleri |

## Doğrulama (bu oturumda, birleşik ağaç üzerinde)

- `npx tsc --noEmit` temiz, `npx eslint .` temiz.
- **201 birim testi** geçti (118 mevcut + D24'ün 17'si + D16 8 + D17 13 + D18 23 + D20 22).
- PostgreSQL 16 kuruldu → `drizzle-kit migrate` (0003 dahil) → **D24'ün şema denetimi
  "Database schema matches the code." dedi**, yani migration dosyası kodun beklediği
  kolonları birebir yaratıyor.
- Seed: 66 şarkı + 8 kuyruk kaydı → `npm run build` **tam geçti**, 198+ şarkı sayfası
  prerender edildi; route listesinde `/api/spotify/track` ve `/api/health/schema` var.
- Tarayıcı testleri (Chromium, masaüstü + mobil): **62 geçti / 4 atlandı / 0 hata**
  (tek worker). Paralel koşuda iki paylaşım testi ara ara düşüyor; aynı testler tek
  tek ve seri koşuda geçiyor, HEAD'de de aynı davranış — bu sandbox'ın yük altındaki
  tarayıcısı, regresyon değil.
- Gerçek Spotify çağrısı sandbox'tan denenemedi (dış ağ kapalı): ilk canlı arama sende.

## Bu pakette OLMAYANLAR

- **D19** (pair sayfası başlıkları) ve **D23** (taksonomi sayfası) — o iki zip elime
  ulaşmadı. İkisi de bu paketin dosyalarına dokunmuyor, sonradan ayrı ayrı
  yüklenebilir; bulursan bana at, istersen bir sonraki pakete katarım.
- D17 yüklendikten sonra yapılacak iki tek satırlık sitemap işi (pair satırlarına
  hedef-dil önceliği + `noindex` pair'lerin sitemap'ten çıkarılması) D19'un
  fonksiyonlarına bağlı olduğu için ertelendi.
- **D22** (21 Eylül'ün song-lookup zip'inin harmanı) — D16 ve D20 canlıya girdikten
  sonra HEAD'den okunarak yazılacak. O eski zip'i yüklemeye devam etme.
