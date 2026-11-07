import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sheetsRouter } from "./server/sheets/routes.js";
import { startScheduler } from "./server/scheduler.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, "dist");

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Authenticated server-side API (Google Sheets integration). Registered before the SPA catch-all.
app.use("/api/sheets", sheetsRouter());
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

app.use(express.static(distPath));

app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Global Chinar CRM running on port ${port}`);
  startScheduler();
});
