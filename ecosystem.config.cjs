/**
 * PM2 process file for running AeroPDF on a Hostinger VPS without Docker.
 *   npm install && npm run build:deploy
 *   AEROPDF_API_KEY=$(openssl rand -hex 24) pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "aeropdf",
      script: "deploy/app.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "8080",
        HOST: "127.0.0.1",
        DASHBOARD_DIR: "./deploy/public",
        STORAGE_PATH: "./deploy/data",
        STORAGE_DRIVER: "local",
        MAX_UPLOAD_MB: "50",
        ENABLE_HTML_PDF: "off",
        // AEROPDF_API_KEY is taken from the shell env (export it before pm2 start).
      },
    },
  ],
};
