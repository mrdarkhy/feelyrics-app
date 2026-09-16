# Yayına alma — adım adım

Bu liste kod yazmayan biri için yazıldı. Sırayla takip et, toplam **20-30 dakika**
sürer. Her adımda ne yapman gerektiği ve neden gerektiği yazıyor.

Toplamda **2 hesap** açman ve **3 ayar** girmen gerekiyor. Hepsi ücretsiz
katmanda kalıyor.

---

## 1. Veritabanı — Neon hesabı (~5 dk)

Şarkılar, istekler ve öneriler bir PostgreSQL veritabanında duracak.

1. [neon.com](https://neon.com) → **Sign up** (GitHub hesabınla girebilirsin).
2. Yeni proje oluştur. Adı fark etmez, bölge olarak **Frankfurt** ya da
   **Amsterdam** seç — kullanıcıların Türkiye ve İspanya'da, en yakın sunucu bu.
3. Proje açılınca **Connection string** kutusunu göreceksin. Açılır menüden
   **Pooled connection**'ı seç (önemli — normal bağlantı sunucusuz ortamda
   bağlantı sayısını tüketir).
4. Çıkan `postgresql://...` ile başlayan uzun metni kopyala, bir yere yapıştır.
   Buna bundan sonra **VERİTABANI ADRESİ** diyeceğim.

> Neon ücretsiz katmanı bu proje için fazlasıyla yeterli: kullanılmadığında
> otomatik uykuya geçiyor, ilk istekte saniyeler içinde uyanıyor.

---

## 2. Yönetici anahtarı üret (~1 dk)

Öneri ve istekleri onaylayacağın yönetim paneli bu anahtarla açılıyor. Hesap
açmana gerek yok — tek bir şifre gibi düşün.

[random.org/strings](https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=html&rnd=new)
adresine gir, çıkan 32 karakterlik metni kopyala. Buna **YÖNETİCİ ANAHTARI**
diyeceğim.

Bunu kimseyle paylaşma. Kaybedersen yenisini üretip 5. adımdaki ayarı
değiştirmen yeterli.

---

## 3. Kodu GitHub'a koy (~5 dk)

1. [github.com/new](https://github.com/new) → depo adı `feelyrics-app`,
   **Private** seç, **Create repository**.
2. Açılan sayfada **uploading an existing file** bağlantısına tıkla.
3. Sana gönderdiğim zip'i bilgisayarında aç, **içindeki bütün dosya ve klasörleri**
   tarayıcıya sürükle.
4. Aşağıdaki **Commit changes** düğmesine bas.

> `node_modules` klasörü zip'te yok, olması da gerekmiyor — Vercel onu kendisi
> kuruyor.

---

## 4. Vercel'e bağla (~5 dk)

1. [vercel.com](https://vercel.com) → **Sign up** (GitHub hesabınla gir).
2. **Add New → Project** → az önce oluşturduğun `feelyrics-app` deposunu seç →
   **Import**.
3. Hiçbir ayara dokunma. Vercel Next.js'i kendi tanıyor.
4. **Deploy**'a basmadan önce 5. adımı yap.

---

## 5. Üç ayarı gir (~3 dk)

Vercel'in kurulum ekranında **Environment Variables** bölümünü aç ve şu üçünü
ekle:

| İsim | Değer |
| --- | --- |
| `DATABASE_URL` | 1. adımdaki **VERİTABANI ADRESİ** |
| `ADMIN_TOKEN` | 2. adımdaki **YÖNETİCİ ANAHTARI** |
| `NEXT_PUBLIC_SITE_URL` | `https://feelyrics-app.vercel.app` |

Son satırdaki adresi şimdilik böyle gir; Vercel sana gerçek adresi deploy
bittikten sonra söyleyecek, farklıysa 7. adımda düzeltiriz.

Şimdi **Deploy**'a bas. 2-3 dakika sürüyor.

---

## 6. Veritabanını doldur (~5 dk)

Deploy bitti ama veritabanı henüz boş. 66 şarkıyı içeri almak için:

1. Vercel'de projenin sayfasında üstteki **Storage** sekmesine git →
   **Connect Database** → **Neon** → hesabını bağla ve projeni seç.
   (Bu adım `DATABASE_URL`'i Vercel'e otomatik de bağlar, elle girdiğinin üstüne
   yazarsa sorun değil.)
2. Neon panelinde sol menüden **SQL Editor**'ü aç.
3. Zip'in içindeki `drizzle/0000_*.sql` dosyasını bir metin düzenleyicide aç,
   **tamamını** kopyala, SQL Editor'e yapıştır, **Run**'a bas.
   → Tablolar oluştu.
4. Şarkıları yüklemek için bilgisayarında bir terminal açman gerekiyor. Bu tek
   seferlik:
   ```
   npm install
   npm run db:seed
   ```
   (`DATABASE_URL`'i `.env.local` dosyasına yazmayı unutma.)

> **Terminal kullanmak istemiyorsan:** bana haber ver, şarkıları düz SQL dosyası
> olarak çıkarayım — o zaman 3. adımdaki gibi Neon'a yapıştırıp çalıştırman
> yeterli olur, terminale hiç girmezsin.

---

## 7. Adresi düzelt (~2 dk)

Vercel sana `https://...vercel.app` diye bir adres verdi. 5. adımda yazdığından
farklıysa:

Vercel → **Settings → Environment Variables** → `NEXT_PUBLIC_SITE_URL`'i gerçek
adresle değiştir → **Deployments** sekmesinden en üstteki deploy'un yanındaki
**⋯ → Redeploy**.

Bu önemli: paylaşım linkleri ve Google'a verilen adresler bu değeri kullanıyor.

---

## Bittiğinde kontrol et

- Ana sayfa açılıyor ve şarkılar listeleniyor mu?
- Sağ üstten dili Türkçe yapınca her şey Türkçeleşiyor mu?
- Bir şarkıya girip **Paylaş**'a basınca uzun bir link çıkıyor mu?
- `/tr/admin` adresine gidip **YÖNETİCİ ANAHTARI** ile giriş yapabiliyor musun?

---

## Sonrası

**Kendi alan adın** (feelyrics.com gibi): Vercel → Settings → Domains → alan
adını yaz, Vercel sana ne yapacağını söyler. Sonra `NEXT_PUBLIC_SITE_URL`'i de
güncelle.

**Şarkı eklemek:** şimdilik `src/infrastructure/db/seed-data.ts` dosyasına
ekleyip `npm run db:seed` çalıştırmak gerekiyor. Yönetim panelinden şarkı ekleme
ekranı sıradaki iş — istersen onu da yapayım.

**Maliyet:** Neon ve Vercel'in ücretsiz katmanları bu trafikte yetiyor. Aylık
ödeme çıkmıyor; alan adı alırsan sadece onun yıllık ücreti var.
