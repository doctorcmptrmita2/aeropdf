# AeroPDF.dev — Dokploy Deploy (Contabo VPS)

Dokploy panelin: **http://109.199.118.106:3000/**

Önerilen yol: **Application + Dockerfile build**. Dokploy, Traefik ile domain/SSL'i otomatik
yönetir; bizim multi-stage `docker/Dockerfile` doğrudan kullanılır.

---

## 0) Önce kodu bir Git sağlayıcıya gönder

Dokploy kaynağı Git'ten çeker. Repo zaten `git init` + ilk commit ile hazır. Bir remote ekle:

```bash
# GitHub'da boş bir repo aç (örn. aeropdf), sonra:
git remote add origin https://github.com/<kullanici>/aeropdf.git
git push -u origin main
```

> GitHub kullanmak istemezsen Dokploy GitLab/Bitbucket/Gitea ve genel **Git (SSH URL + deploy key)**
> destekler. Panelde **Settings → Git** üzerinden bağlayabilirsin.

---

## 1) Proje + Application oluştur

1. Dokploy → **Create Project** (örn. `aeropdf`).
2. İçinde **Create Service → Application**.
3. **Provider / Source:** Git sağlayıcını seç → repo `aeropdf`, branch `main`.

## 2) Build ayarları

- **Build Type:** `Dockerfile`
- **Docker File Path:** `Dockerfile`  ← repo kökündeki Dockerfile (önemli: `docker/Dockerfile` DEĞİL)
- **Docker Context Path:** `.`  (repo kökü — COPY yolları buna göre)
- (Build stage gerekmiyor; multi-stage Dockerfile kendi içinde hallediyor.)

> ⚠️ Dockerfile **repo kökünde** durur. Bazı platformlar (Dokploy dahil) build context'i
> Dockerfile'ın bulunduğu klasör olarak alır; kökte tutarak context'in repo kökü olmasını garanti
> ederiz. `docker/Dockerfile` verirsen context `docker/` olur ve `package.json` bulunamaz.

## 3) Environment Variables

**Environment** sekmesine ekle (en kritik: güçlü API anahtarı):

```
AEROPDF_API_KEY=<uzun-rastgele-anahtar>     # örn: openssl rand -hex 24
STORAGE_DRIVER=local
STORAGE_PATH=/data
DASHBOARD_DIR=/app/public
MAX_UPLOAD_MB=50
ENABLE_HTML_PDF=off
NODE_ENV=production
```

> `PORT` ayarlama — Dockerfile zaten 8080 dinliyor; Traefik buna yönlenecek.

## 4) Port

- **Advanced → Ports** (veya domain eşlemesinde **Container Port**): **8080**
- Domain eklersen Traefik 80/443 → konteyner 8080 yönlendirir; ayrı host portu gerekmez.

## 5) Kalıcı depolama (Volume Mount)

PDF dosyaları `/data` altına yazılır. Yeniden dağıtımlarda kaybolmaması için:

- **Advanced → Volumes / Mounts → Add → Volume Mount**
  - **Volume Name:** `aeropdf-data`
  - **Mount Path:** `/data`

> ✅ Kalıcılık: Blob'lar **ve** meta veri index'i (`/data/_index.json`) bu volume'da saklanır;
> böylece yeniden başlatmada eski `file_id`'ler **korunur**. Bu yüzden volume mount **şart**.
> (Postgres gerekmez; çok-instanslı/HA kurulum istenirse Faz‑2'de eklenebilir.)

## 6) Domain & SSL

- **Domains → Add Domain**
  - **Host:** `pdf.alanadiniz.com` (DNS A kaydını `109.199.118.106`'ya yönlendir)
  - **Container Port:** `8080`
  - **HTTPS:** açık, **Certificate:** Let's Encrypt
- Domain yoksa geçici olarak Dokploy'un verdiği `*.traefik.me` / IP+port erişimini kullanabilirsin.

## 7) Deploy

**Deploy** butonuna bas. Loglarda build → `node app.js` → `AeroPDF API listening on ...` görünce hazır.

Doğrulama:

```bash
curl -s https://pdf.alanadiniz.com/health
# {"status":"ok","version":"0.1.0","htmlToPdf":false}
```

- Landing:   `https://pdf.alanadiniz.com/`
- Dashboard: `https://pdf.alanadiniz.com/dashboard`  (API key alanına yukarıdaki anahtarı gir)
- API:       `POST https://pdf.alanadiniz.com/v1/pdf/generate`  (`Authorization: Bearer <key>`)

---

## Alternatif: Docker Compose servisi olarak

Dokploy **Compose** tipini de destekler ama Traefik etiketleri elle gerekir. Application+Dockerfile
yolu daha basit olduğu için onu öneriyoruz. Compose isterseniz `docker/docker-compose.prod.yml`'i
temel alın; ancak `ports` yerine Dokploy/Traefik label'larıyla expose edin (host portu yayınlamayın).

## Güncelleme akışı

```bash
git add -A && git commit -m "..." && git push
```
Dokploy'da **Auto Deploy** (webhook) açıksa otomatik; değilse **Redeploy** butonu.

## Sorun giderme

- **Build COPY hatası:** Context Path `.` ve Dockerfile Path `docker/Dockerfile` olmalı.
- **502 / erişilemiyor:** Container Port `8080` mi? Env'de `PORT` set ETME.
- **Dosya indirilemiyor (eski id):** Yeniden başlatma sonrası beklenen (bellek-içi meta veri). 
- **Yükleme reddi:** `MAX_UPLOAD_MB` ve Traefik/Nginx gövde limiti uyumlu olmalı.
```
