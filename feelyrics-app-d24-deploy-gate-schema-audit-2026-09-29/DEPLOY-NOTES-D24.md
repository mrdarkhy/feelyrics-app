# D24 — Deploy kapısı + şema sapması denetimi

**Repo: `feelyrics-app`** (github.io reposu DEĞİL) · **Neon migration gerekmez** · **Ortam değişkeni gerekmez** · **5 dosya**

Bu paket D21'in (28 Eylül, GitHub Actions CI) eksik bıraktığı iki şeyi kapatıyor.
İkisi aynı dosyaya dokunmuyor, ikisi de birbirinden bağımsız yüklenebilir.

| Soru | Cevabı veren |
| --- | --- |
| Bu commit bozuk mu? | D21 (CI) — commit'in yanında kırmızı çarpı |
| Bozuk commit canlı siteyi değiştirebilir mi? | **D24 — `vercel.json`** (artık hayır) |
| Neon'da migration gerçekten çalıştı mı? | **D24 — `/api/health/schema`** |

---

## 1. Yükleme (tek adım, ~2 dakika)

1. Zip'i aç.
2. `src`, `scripts`, `tests` klasörlerini ve `vercel.json` dosyasını
   **feelyrics-app → Add file → Upload files** ekranına sürükle.
3. **Commit changes.**

Ayar değişikliği yok, gizli anahtar yok, migration yok. Bekleyen paketlerin
(D16–D21, D23) hiçbir dosyasına dokunmuyor; sıradan bağımsız yüklenebilir.

---

## 2. Bundan sonra ne değişiyor

**a) Yarım yükleme artık canlı siteyi değiştiremiyor.** `vercel.json`, Vercel'in
build komutunu `npm run verify && npm run build` yapıyor: önce tipler, lint ve
testler, sonra derleme. Bir dosya eksik kaldıysa build duruyor ve Vercel **son
çalışan deploy'u canlıda bırakıyor** — site bozulmuyor, yalnız yeni sürüm yayına
girmiyor. Vercel'de kırmızı bir build görürsen anlamı budur; ayrıntısı
commit'teki CI çarpısında yazar.

> Kapıyı kaldırmak istersen tek iş `vercel.json` dosyasını silmek.

**b) Unutulan migration kendini söylüyor.** Yeni adres:

```
https://feelyrics-app.vercel.app/api/health/schema
```

- `{"ok":true,"missing":0}` → veritabanı kodun beklediği her şeye sahip.
- `{"ok":false,"code":"schema_behind","missing":2}` → **bir migration çalıştırılmamış.**
  Aynı tarayıcıda `/en/admin`'e girdiysen aynı adres eksik kolon/enum adlarını da
  yazıyor.

**Şu an tam olarak şuna yarıyor:** D16'yı yükleyip Neon'da 4 satırlık SQL'i
çalıştırdıktan sonra bu adresi aç. `ok: true` görüyorsan migration gerçekten
geçmiştir. Bugüne kadar bunun tek kontrolü "sitede bir şey patlıyor mu" idi;
D16'nın kolonlarını (`src`, `ready_at`) kullanan sorgular ise ancak biri istek
gönderdiğinde patlıyor — yani hatayı senin yerine bir ziyaretçi buluyordu.

Denetim tabloyu elle yazmıyor: `schema.ts` neyi tanımlıyorsa onu bekliyor.
Yarın eklenen bir kolon yarın denetlenir; bakım gerekmiyor.

---

## 3. Pakette ne var

| Dosya | Ne yapar |
| --- | --- |
| `vercel.json` | Vercel build komutuna `npm run verify` kapısını ekler |
| `src/infrastructure/db/schema-audit.ts` | Beklenen tablo/kolon/enum'ları Drizzle şemasından türetip veritabanıyla karşılaştırır (saf karşılaştırma ayrı fonksiyonda) |
| `src/app/api/health/schema/route.ts` | `/api/health/schema` — açık uçta yalnız sonuç + sayı, admin oturumunda eksiklerin listesi; sağlıklıysa 200, şema geride kalmışsa 503 |
| `scripts/audit-schema.ts` | Aynı denetimin komut satırı sürümü (ileride D21'in CI dosyasına tek satırla eklenebilir) |
| `tests/unit/schema-audit.test.ts` | Denetimin testleri: eksik kolon, eksik enum, hiç olmayan tablo, ileride olan veritabanı |
| `tests/unit/deploy-guards.test.ts` | Kapıların kapı olarak kaldığını doğrular — ileride bir zip `vercel.json`'u eski hâliyle üzerine yazarsa test kırılır |

`package.json` **değişmedi** (bilerek: zip'ler dosyanın tamamını değiştiriyor,
her pakette ona dokunmak bir paketin diğerinin ayarını geri alması demek).

## 4. Doğrulama (bu oturumda yapılanlar)

- `npx tsc --noEmit` temiz, `npx eslint .` temiz, **135 test** geçti (118 + 17).
- Sandbox'a PostgreSQL 16 kuruldu: `drizzle-kit migrate` → denetim **"Database
  schema matches the code."** dedi (çıkış kodu 0).
- Kasten bozuldu (bir kolon düşürüldü, bir enum kısaltıldı) → denetim çıkış kodu
  1 ile eksikleri tek tek saydı.
- `npm run build` veritabanı bağlıyken **tamamen** geçti (prerender dahil);
  `/api/health/schema` route listesinde görünüyor.
- Çalışan sunucuda uç nokta denendi: şema tamken `200 {"ok":true,"missing":0}`,
  bir kolon düşürülünce `503 {"ok":false,"code":"schema_behind","missing":1}`.

## 5. Yükleme kuyruğunun güncel hâli

Bu paket sıradan bağımsız. Diğerlerinin önerilen sırası değişmedi:

1. D16 (+ Neon'daki 4 satırlık migration + redeploy)
2. D17 · 3. D18 · 4. D19 · 5. D20 (+ Spotify ortam değişkenleri + redeploy)
6. D21 (CI) · D23 (taksonomi sayfası) · **D24 (bu paket)** — üçü sırasız

D16'yı yükledikten sonra `/api/health/schema` adresini açmayı unutma: migration
çalışmadıysa orada görürsün.
