# AeroPDF.dev — Hostinger Deploy Rehberi

AeroPDF bir **Node.js** uygulamasıdır (PHP değil). Hostinger'da hangi plana sahip olduğuna göre
3 yol var. Tümü için **tek komutla üretilen bundle** kullanılır:

```bash
npm install
npm run build:deploy     # → ./deploy  (app.js + public/ + package.json)
```

| Hostinger planı | Önerilen yöntem |
|-----------------|-----------------|
| **VPS (KVM)** | **A) Docker** (en sağlam) veya C) PM2 |
| **Cloud / Business** (hPanel) | **B) hPanel Node.js App** (Passenger) |
| **Premium/Shared** (sadece PHP) | Node yok → API çalışmaz. Sadece statik landing yüklenebilir (aşağıda not) |

> ⚠️ **Önemli kalıcılık notu:** Bu MVP'de iş/dosya **meta verisi bellekte** tutulur. PDF
> dosyaları diske (`STORAGE_PATH`) yazılır ama sunucu **yeniden başlarsa** eski `file_id`'ler
> indirilemez (meta veri sıfırlanır). Üretimde kalıcılık için Faz-2 Postgres gerekir. Kısa ömürlü
> "üret → indir" akışı sorunsuz çalışır.

---

## A) Hostinger VPS — Docker (önerilen)

VPS'e SSH ile bağlan (hPanel → VPS → SSH bilgileri).

```bash
# 1) Docker kurulu değilse:
curl -fsSL https://get.docker.com | sh

# 2) Projeyi yükle (git veya scp). Örn. git:
git clone <repo-url> aeropdf && cd aeropdf
#   (git yoksa: yerelde zip'leyip scp ile /root/aeropdf'e at)

# 3) Güçlü bir API anahtarı ile çalıştır:
export AEROPDF_API_KEY=$(openssl rand -hex 24)
echo "API KEY: $AEROPDF_API_KEY"   # bir yere kaydet
docker compose -f docker/docker-compose.prod.yml up -d --build

# 4) Sağlık kontrolü (yalnız localhost'a bağlı):
curl -s http://127.0.0.1:8080/health
```

Servis `127.0.0.1:8080`'e bağlıdır. Önüne **Nginx + SSL** koy:

```nginx
# /etc/nginx/sites-available/aeropdf  →  sembolik link sites-enabled
server {
    server_name pdf.alanadiniz.com;
    client_max_body_size 50m;            # MAX_UPLOAD_MB ile uyumlu
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/aeropdf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d pdf.alanadiniz.com     # ücretsiz Let's Encrypt SSL
```

Güncelleme: `git pull && docker compose -f docker/docker-compose.prod.yml up -d --build`.

---

## B) Hostinger Cloud / Business — hPanel Node.js App

hPanel shared/cloud planlarında **Setup Node.js App** (Phusion Passenger) bulunur.

1. **Yerelde bundle üret:** `npm run build:deploy` → oluşan **`deploy/`** klasörünün içeriği.
2. **Yükle:** hPanel → **Dosya Yöneticisi** (veya FTP) ile bir klasör aç (örn. `aeropdf`) ve
   `deploy/` içindeki **tüm dosyaları** (app.js, public/, package.json, .env.example) oraya at.
3. hPanel → **Gelişmiş → Node.js** → **Create Application**:
   - **Node version:** 18 / 20 / 22
   - **Application root:** `aeropdf` (yüklediğin klasör)
   - **Application startup file:** `app.js`
   - **Application URL:** alan adın / alt alan adın
4. **Environment variables** ekle (Edit → Add):
   ```
   AEROPDF_API_KEY = <uzun-rastgele-anahtar>
   DASHBOARD_DIR   = ./public
   STORAGE_PATH    = ./data
   STORAGE_DRIVER  = local
   MAX_UPLOAD_MB   = 50
   ENABLE_HTML_PDF = off
   ```
   (PORT'u **ayarlama** — Passenger otomatik verir.)
5. **Run NPM Install** → **Restart**. Bundle bağımsız olduğu için kurulacak paket yok; sorun değil.
6. Alan adını uygulamaya bağla. Bitti — landing `/`, panel `/dashboard`, API `/v1/...`.

> Not: `./data` klasörünün yazılabilir olduğundan emin ol (üretilen PDF'ler oraya yazılır).

---

## C) Hostinger VPS — Docker'sız (PM2)

```bash
# Node 20 (nvm ile) + pm2
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20 && npm i -g pm2

git clone <repo-url> aeropdf && cd aeropdf
npm install
npm run build:deploy

export AEROPDF_API_KEY=$(openssl rand -hex 24)
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup        # sunucu açılışında otomatik başlat
```

Ardından A) bölümündeki **Nginx + certbot** adımlarını uygula (proxy → `127.0.0.1:8080`).

---

## Sadece statik landing (Shared/PHP plan)

Node çalıştıramayan shared planda API çalışmaz. Yine de pazarlama sayfasını yayınlamak istersen
`apps/dashboard/index.html` + `assets/` dosyalarını `public_html`'e yükleyebilirsin; ancak
`/dashboard` playground ve `/v1` çağrıları için bir Node host (A/B/C) gerekir.

---

## Üretim güvenlik kontrol listesi

- [ ] `AEROPDF_API_KEY` güçlü ve gizli (varsayılan `local-dev-key` **asla** kullanma)
- [ ] HTTPS aktif (certbot / Hostinger SSL)
- [ ] `client_max_body_size` ↔ `MAX_UPLOAD_MB` uyumlu
- [ ] `./data` (veya volume) yedekleniyor
- [ ] Sadece 80/443 dışarı açık; 8080 yalnız localhost
- [ ] Kalıcı meta veri gerekiyorsa Faz-2 Postgres planla (yukarıdaki not)
