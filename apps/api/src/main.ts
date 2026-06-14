/**
 * Production entry point. Bundled by scripts/build-deploy.mjs into deploy/app.js and used as the
 * startup file on Hostinger (VPS or hPanel Node.js app / Passenger). Starts unconditionally.
 */
import { start } from "./server.js";

void start();
