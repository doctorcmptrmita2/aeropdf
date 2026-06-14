# AeroPDF.dev — Proje Dokümanı

> **Geliştirici öncelikli PDF motoru.** PDF üretimi, düzenleme, imzalama, birleştirme,
> form doldurma ve otomasyonunu tek bir API + SDK + panel + self-hosted Docker runtime
> üzerinden sunar.

---

## 1. Özet

**AeroPDF.dev**, bir "PDF aracı sitesi" değil, uygulamaların içine gömülen bir **PDF altyapı
ürünüdür**. SaaS ekipleri, ajanslar, CRM/ERP geliştiricileri ve kendi uygulamalarında güvenilir
PDF üretimi ile kontrollü PDF düzenlemesine ihtiyaç duyan herkes için tasarlanmıştır.

**Ana vaat:**

```
Girdi:  HTML · JSON · Markdown · Şablon · Mevcut PDF · Görsel · URL
Çıktı:  Temiz PDF · Düzenlenmiş PDF · İmzalı PDF · Birleştirilmiş PDF
        Sıkıştırılmış PDF · Filigranlı PDF · Doldurulabilir/Düzleştirilmiş PDF
        API ile teslim edilen PDF · Self-hosted üretilen PDF
```

**Doğru konumlandırma:** "Geliştirici öncelikli bir motorla PDF üret, düzenle, imzala ve otomatikleştir."

**Yanlış vaat (kaçınılır):** "Her PDF'i Word gibi düzenle." MVP bu vaadi vermez.

---

## 2. Marka Kimliği

Görsel varlık paketinden (`AeroPDF_visual_assets/`) çıkarılan marka dili:

| Öğe | Değer |
|-----|-------|
| Logo | Kanatlı doküman + hız göstergesi (gauge) ikonu, "AeroPDF" lacivert + "PDF" mavi vurgu + ".dev" mercan kırmızı |
| Derin lacivert (navy) | `#0E1B3D` |
| Parlak mavi (primary) | `#2563EB` |
| Açık mavi (accent) | `#3B82F6` |
| Mercan/kırmızı (PDF accent) | `#F4534D` |
| Arka plan açık | `#F6F8FC` |
| Yüzey beyaz | `#FFFFFF` |
| Metin koyu | `#0E1B3D` |
| Stil | Temiz SaaS / dev-tool arayüzü, yumuşak gölgeler, 12–16px köşe yarıçapı |

Görsel konseptler:
- `05-landing-page-concept` → "The PDF API for Developers" hero, özellik kartları, kod örnekleri
- `06-dashboard-ui-concept` → sol menü, istatistik kartları, son işler tablosu, PDF önizleme paneli
- `03-promotional-banner` → "The premium, developer-first PDF engine"

Bu marka dili landing sayfasına ve panele birebir uygulanmıştır.

---

## 3. Hedef Kullanıcılar

**Birincil:** SaaS / Laravel / Node.js / Python / PHP / WooCommerce geliştiricileri, ajanslar,
CRM-ERP ekipleri, fatura/rapor/sözleşme yazılımı ekipleri.

**İkincil:** Muhasebeciler, hukuk ekipleri, eğitim ve İK platformları, sertifika üreten platformlar,
e-imza ürünleri, doküman otomasyon girişimleri.

---

## 4. Ürün Modülleri

1. **PDF Üretim Motoru** — HTML / URL / Markdown / Şablon+JSON → PDF
2. **Şablon Motoru** — değişkenler, döngüler, koşullar, para/tarih biçimleme, dinamik tablolar
3. **Görsel Şablon Editörü** — sürükle-bırak bloklar (gelecek faz)
4. **PDF Görüntüleyici** — tarayıcıda sayfa render + thumbnail
5. **Overlay Editör** — orijinal PDF'i bozmadan üstüne nesne ekleme (metin, görsel, imza, şekil, filigran)
6. **Sayfa İşlemleri** — sıralama, silme, döndürme, birleştirme, bölme, sayfa numarası
7. **Anotasyon** — vurgu, not, çizim, düzleştirme
8. **İmza** — çiz / yükle / yaz → PDF'e yerleştir ve düzleştir
9. **Form Doldurma** — JSON'dan alan doldurma + flatten
10. **PDF Optimizer** — sıkıştırma, metadata temizleme

---

## 5. MVP Kapsamı (Bu Repoda Gerçeklenen)

> İlke: Harici PDF'ler **overlay** ile düzenlenir; AeroPDF-native dokümanlar **şablon/veri
> yeniden üretimi** ile düzenlenir. Word benzeri tam metin akışı düzenlemesi MVP'de yoktur.

| Yetenek | Durum |
|---------|-------|
| Şablon + JSON → PDF (fatura/sertifika/rapor) | ✅ pdf-engine içinde |
| HTML → PDF (opsiyonel Chromium) | ✅ varsa Puppeteer, yoksa zarif düşüş |
| PDF yükleme + yerel depolama | ✅ |
| Overlay düzenleme (metin / görsel / imza / filigran / şekil) | ✅ |
| Birleştirme / bölme | ✅ |
| Sayfa sil / döndür / yeniden sırala | ✅ |
| Form doldurma + flatten | ✅ |
| API anahtarı kimlik doğrulama + iş (job) modeli | ✅ |
| Landing + Dashboard arayüzü | ✅ statik, markaya uygun |
| Node.js SDK | ✅ |
| Docker + docker-compose self-host | ✅ |

Detaylı teknik tanım için bkz. [Specs.md](Specs.md).

---

## 6. Mimari (Özet)

```
Tarayıcı (Landing + Dashboard, statik)
        │
        ▼
  Fastify API  ── API key auth ── Job kayıtları
        │
        ▼
  PDF Engine (pdf-lib)  +  Template Engine (Handlebars)
        │
        ▼
  Yerel / S3 uyumlu depolama  →  İndirme · Webhook · SDK yanıtı
```

**Stack:** TypeScript · Fastify · pdf-lib · Handlebars · (opsiyonel) Puppeteer · npm workspaces · Docker.

Monorepo yerleşimi:

```
apps/api                  REST API sunucusu
apps/dashboard            Landing + panel (statik, API tarafından servis edilir)
packages/shared           Ortak tipler, hata sistemi
packages/pdf-engine       PDF üretim/düzenleme mantığı
packages/template-engine  Şablon render
packages/sdk-node         Node.js SDK
docker                    Dockerfile + compose
docs                      Dokümantasyon
```

---

## 7. API Yüzeyi (Özet)

| Metot | Yol | Açıklama |
|-------|-----|----------|
| POST | `/v1/pdf/generate` | Şablon/HTML/Markdown'dan PDF üret |
| POST | `/v1/pdf/upload` | PDF yükle |
| POST | `/v1/pdf/edit` | Overlay işlemleri uygula |
| POST | `/v1/pdf/merge` | PDF'leri birleştir |
| POST | `/v1/pdf/split` | Sayfa aralıklarına böl |
| POST | `/v1/pdf/watermark` | Filigran ekle |
| POST | `/v1/pdf/fill-form` | Form alanlarını doldur |
| GET  | `/v1/jobs/:id` | İş durumu |
| GET  | `/v1/files/:id/download` | Dosya indir |
| GET  | `/health` | Sağlık kontrolü |

Tüm `/v1` çağrıları `Authorization: Bearer <API_KEY>` ister. Tam istek/yanıt şemaları
[Specs.md](Specs.md) içindedir.

---

## 8. Çalıştırma

```bash
npm install
npm run dev          # API + statik panel → http://localhost:8080
# Landing:   http://localhost:8080/
# Dashboard: http://localhost:8080/dashboard
# Health:    http://localhost:8080/health
```

Self-host:

```bash
cd docker
docker compose up --build
```

---

## 9. Yol Haritası

- **Faz 1 (MVP, bu repo):** API, HTML/şablon→PDF, upload, overlay, merge/split, sayfa işlemleri, panel, Docker.
- **Faz 2:** Node/PHP/Python SDK, CLI, webhooks, kullanım limitleri, şablon galerisi.
- **Faz 3:** Gelişmiş editör (anotasyon, çizim, redaksiyon, form, metadata, sıkıştırma).
- **Faz 4:** Görsel sürükle-bırak şablon oluşturucu.
- **Faz 5:** AI + otomasyon (alan çıkarımı, OCR, PDF→DOCX/HTML, iş akışları).

---

## 10. Güvenlik İlkeleri

- Yüklenen dosya tipi doğrulama, boyut limiti, özel erişimli depolama, imzalı indirme linkleri.
- API key hash'leme, rate limiting, scope tabanlı anahtarlar, webhook imzalama.
- Render worker'larında timeout/bellek limiti, SSRF koruması, HTML sanitizasyonu.
- Self-host: ortam değişkeni gizli anahtarlar, non-root Docker kullanıcısı, özel depolama yolu.

---

_Bu doküman ürünün "ne" ve "neden"ini anlatır. Teknik "nasıl" için → [Specs.md](Specs.md)._
