require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "fire_cheat_dev_secret";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_COOKIE = "fire_cheat_admin";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "fire_cheat_web",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null
    }
  }
}));
const allowedOrigins = new Set([process.env.APP_URL || "https://firecheat.up.railway.app", "http://127.0.0.1:3001"]);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    callback(new Error("Origen no autorizado."));
  }
}));
app.use(express.json({ limit: "6mb" }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Advertencia de seguridad: demasiadas solicitudes. Espera un momento antes de continuar." }
}));
app.use((req, res, next) => {
  let decodedRequest = "";
  try {
    decodedRequest = decodeURIComponent(req.originalUrl || "");
  } catch {
    return res.status(400).json({ error: "Advertencia de seguridad: dirección inválida bloqueada." });
  }
  if (decodedRequest.includes("..") || /<script|javascript:|union\s+select/i.test(decodedRequest)) {
    return res.status(400).json({ error: "Advertencia de seguridad: solicitud bloqueada por actividad sospechosa." });
  }
  next();
});
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 220,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Advertencia de seguridad: la API recibió demasiadas solicitudes seguidas." }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Advertencia de seguridad: demasiados intentos de acceso. Espera 15 minutos." }
});
app.use("/api", apiLimiter);
app.use(["/admin", "/admin.html", "/api/admin", "/api/auth"], (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  next();
});

const eventClients = new Set();
const activeVisitors = new Map();

function query(sql, params = {}) {
  return pool.execute(sql, params).then(([rows]) => rows);
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, username: user.username, name: user.name }, JWT_SECRET, {
    expiresIn: "7d"
  });
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((item) => {
    const index = item.indexOf("=");
    if (index === -1) return ["", ""];
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }).filter(([key]) => key));
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: IS_PRODUCTION,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const cookies = parseCookies(req);
  const token = header.startsWith("Bearer ") ? header.slice(7) : cookies[SESSION_COOKIE] || "";
  if (!token) return res.status(401).json({ error: "Debes iniciar sesion." });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const rows = await query(
      "SELECT id, role, username, name, active FROM users WHERE id = :id AND active = 1 LIMIT 1",
      { id: decoded.id }
    );
    if (!rows.length) return res.status(401).json({ error: "Sesion desactivada. Inicia sesion nuevamente." });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: "Sesion invalida o vencida." });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Acceso solo para administradores." });
  next();
}

function cleanText(value, fallback = "") {
  return String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function cleanLimited(value, fallback, limit) {
  return cleanText(value, fallback).slice(0, limit);
}

function cleanImageUrl(value) {
  const imageUrl = cleanLimited(value, "assets/logo-fire-cheat.jpeg", 900000);
  if (!imageUrl) return "assets/logo-fire-cheat.jpeg";
  if (imageUrl.startsWith("data:image/")) return imageUrl;
  if (imageUrl.startsWith("assets/")) return imageUrl;
  if (/^https?:\/\/[^\s]+$/i.test(imageUrl)) return imageUrl;
  return "assets/logo-fire-cheat.jpeg";
}

function cleanProduct(body) {
  return {
    name: cleanLimited(body.name, "", 180),
    category: cleanLimited(body.category, "scripts", 120) || "scripts",
    description: cleanLimited(body.description, "", 2500),
    imageUrl: cleanImageUrl(body.imageUrl),
    oldPrice: body.oldPrice === "" || body.oldPrice == null ? null : Math.max(0, Number(body.oldPrice || 0)),
    price: Math.max(0, Number(body.price || 0)),
    badge: cleanLimited(body.badge, "", 80) || null,
    active: body.active === false ? 0 : 1,
    sortOrder: Number(body.sortOrder || 0)
  };
}

function productJson(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    imageUrl: product.image_url,
    oldPrice: product.old_price == null ? null : Number(product.old_price),
    price: Number(product.price),
    badge: product.badge,
    active: Boolean(product.active),
    sortOrder: Number(product.sort_order)
  };
}

async function getSetting(key, fallback = "") {
  const rows = await query("SELECT setting_value FROM settings WHERE setting_key = :key LIMIT 1", { key });
  return rows[0]?.setting_value || fallback;
}

async function logEvent(eventType, data = {}) {
  await query(
    `INSERT INTO analytics_events (event_type, source, session_id, product_id, metadata)
     VALUES (:eventType, :source, :sessionId, :productId, :metadata)`,
    {
      eventType,
      source: cleanText(data.source) || null,
      sessionId: cleanText(data.sessionId) || null,
      productId: data.productId ? Number(data.productId) : null,
      metadata: JSON.stringify(data.metadata || {})
    }
  );
}

function markActive(sessionId) {
  const id = cleanText(sessionId);
  if (id) activeVisitors.set(id, Date.now());
}

function activeVisitorCount() {
  const cutoff = Date.now() - 45000;
  for (const [id, lastSeen] of activeVisitors.entries()) {
    if (lastSeen < cutoff) activeVisitors.delete(id);
  }
  return activeVisitors.size;
}

function broadcast(event, data = {}) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of eventClients) client.write(message);
}

async function syncConfiguredAdmin() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "Admin12345", 10);
  const rows = await query("SELECT id FROM users WHERE username = :username LIMIT 1", { username });
  if (rows.length) {
    await query(
      "UPDATE users SET role = 'admin', password_hash = :passwordHash, name = 'Administrador Fire Cheat', active = 1 WHERE id = :id",
      { passwordHash, id: rows[0].id }
    );
  } else {
    await query(
      "INSERT INTO users (role, username, password_hash, name, active) VALUES ('admin', :username, :passwordHash, 'Administrador Fire Cheat', 1)",
      { username, passwordHash }
    );
  }
  await query("UPDATE users SET active = 0 WHERE role = 'admin' AND username <> :username", { username });
}

async function seedProducts() {
  const rows = await query("SELECT COUNT(*) AS total FROM products");
  if (Number(rows[0].total) > 0) return;

  const products = [
    {
      name: "Fire Cheat | RANK PANEL COMPLEX",
      category: "scripts",
      description: "Panel complejo para Free Fire, funciones avanzadas.",
      imageUrl: "assets/logo-fire-cheat.jpeg",
      oldPrice: 5,
      price: 3.75,
      badge: "scripts"
    },
    {
      name: "PANEL IOS / FLOURITE",
      category: "scripts",
      description: "Panel exclusivo para iOS, estabilidad garantizada.",
      imageUrl: "assets/logo-fire-cheat.jpeg",
      oldPrice: 5,
      price: 3.75,
      badge: "scripts"
    },
    {
      name: "Baypas Apk",
      category: "bypass",
      description: "Bypass actualizado, anti-deteccion y compatibilidad.",
      imageUrl: "assets/logo-fire-cheat.jpeg",
      oldPrice: 6,
      price: 4.5,
      badge: "bypass"
    },
    {
      name: "DripClient Update - Att",
      category: "scripts",
      description: "Fire Cheat.",
      imageUrl: "assets/logo-fire-cheat.jpeg",
      oldPrice: null,
      price: 4.99,
      badge: "nuevo"
    }
  ];

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    await query(
      `INSERT INTO products (name, category, description, image_url, old_price, price, badge, active, sort_order)
       VALUES (:name, :category, :description, :imageUrl, :oldPrice, :price, :badge, 1, :sortOrder)`,
      { ...product, sortOrder: index }
    );
  }
}

app.post("/api/auth/admin-login", loginLimiter, async (req, res) => {
  const username = cleanLimited(req.body.username, "", 80);
  const password = cleanLimited(req.body.password, "", 180);
  const rows = await query(
    "SELECT * FROM users WHERE username = :username AND role = 'admin' AND active = 1 LIMIT 1",
    { username }
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Usuario o clave incorrecta. Los intentos repetidos serán bloqueados por seguridad." });
  }
  setSessionCookie(res, signToken(user));
  res.json({
    user: { id: user.id, username: user.username, name: user.name, role: user.role }
  });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "strict", secure: IS_PRODUCTION, path: "/" });
  res.json({ ok: true });
});

app.get("/api/me", auth, adminOnly, async (req, res) => {
  const rows = await query("SELECT id, username, name, role, active FROM users WHERE id = :id LIMIT 1", {
    id: req.user.id
  });
  if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado." });
  res.json({ user: rows[0] });
});

app.get("/api/settings", async (_req, res) => {
  res.json({
    discordInvite: await getSetting("discordInvite", "https://discord.gg/GGjnGgrg"),
    storeName: await getSetting("storeName", "Fire Cheat")
  });
});

app.get("/api/products", async (_req, res) => {
  const rows = await query("SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, id DESC");
  res.json(rows.map(productJson));
});

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`event: connected\ndata: {"ok":true}\n\n`);
  eventClients.add(res);
  req.on("close", () => eventClients.delete(res));
});

app.post("/api/track/pageview", async (req, res) => {
  markActive(req.body.sessionId);
  await logEvent("page_view", { sessionId: req.body.sessionId, source: "pagina-principal" });
  broadcast("reports-updated", {});
  res.json({ ok: true });
});

app.post("/api/track/heartbeat", (req, res) => {
  markActive(req.body.sessionId);
  res.json({ ok: true, activeVisitors: activeVisitorCount() });
});

app.post("/api/track/discord-click", async (req, res) => {
  markActive(req.body.sessionId);
  await logEvent("discord_click", {
    sessionId: req.body.sessionId,
    source: cleanText(req.body.source, "pagina-principal")
  });
  broadcast("reports-updated", {});
  res.json({ ok: true, discordInvite: await getSetting("discordInvite", "https://discord.gg/GGjnGgrg") });
});

app.post("/api/sales/lead", async (req, res) => {
  const productId = Number(req.body.productId || 0);
  const rows = await query("SELECT * FROM products WHERE id = :id AND active = 1 LIMIT 1", { id: productId });
  if (!rows.length) return res.status(404).json({ error: "Producto no encontrado." });
  const product = rows[0];
  const result = await query(
    `INSERT INTO sales (product_id, product_name, price, status, source, session_id)
     VALUES (:productId, :productName, :price, 'pendiente', 'pagina-principal', :sessionId)`,
    {
      productId: product.id,
      productName: product.name,
      price: product.price,
      sessionId: cleanText(req.body.sessionId) || null
    }
  );
  await logEvent("buy_click", {
    sessionId: req.body.sessionId,
    source: "producto",
    productId: product.id,
    metadata: { saleId: result.insertId, productName: product.name }
  });
  broadcast("reports-updated", {});
  res.status(201).json({
    id: result.insertId,
    discordInvite: await getSetting("discordInvite", "https://discord.gg/GGjnGgrg")
  });
});

app.get("/api/admin/products", auth, adminOnly, async (_req, res) => {
  const rows = await query("SELECT * FROM products ORDER BY sort_order ASC, id DESC");
  res.json(rows.map(productJson));
});

app.post("/api/admin/products", auth, adminOnly, async (req, res) => {
  const product = cleanProduct(req.body);
  if (!product.name || !product.description) return res.status(400).json({ error: "Nombre y descripcion son obligatorios." });
  const result = await query(
    `INSERT INTO products (name, category, description, image_url, old_price, price, badge, active, sort_order)
     VALUES (:name, :category, :description, :imageUrl, :oldPrice, :price, :badge, :active, :sortOrder)`,
    product
  );
  broadcast("products-updated", { id: result.insertId });
  broadcast("reports-updated", {});
  res.status(201).json({ id: result.insertId });
});

app.put("/api/admin/products/:id", auth, adminOnly, async (req, res) => {
  const product = cleanProduct(req.body);
  if (!product.name || !product.description) return res.status(400).json({ error: "Nombre y descripcion son obligatorios." });
  await query(
    `UPDATE products SET name = :name, category = :category, description = :description,
     image_url = :imageUrl, old_price = :oldPrice, price = :price, badge = :badge,
     active = :active, sort_order = :sortOrder WHERE id = :id`,
    { ...product, id: Number(req.params.id) }
  );
  broadcast("products-updated", { id: Number(req.params.id) });
  res.json({ ok: true });
});

app.delete("/api/admin/products/:id", auth, adminOnly, async (req, res) => {
  await query("DELETE FROM products WHERE id = :id", { id: Number(req.params.id) });
  broadcast("products-updated", { id: Number(req.params.id) });
  broadcast("reports-updated", {});
  res.json({ ok: true });
});

app.get("/api/admin/sales", auth, adminOnly, async (_req, res) => {
  const rows = await query("SELECT * FROM sales ORDER BY id DESC LIMIT 200");
  res.json(rows.map((sale) => ({ ...sale, price: Number(sale.price) })));
});

app.put("/api/admin/sales/:id/status", auth, adminOnly, async (req, res) => {
  const allowed = new Set(["pendiente", "pagado", "cancelado", "entregado"]);
  const status = cleanText(req.body.status);
  if (!allowed.has(status)) return res.status(400).json({ error: "Estado invalido." });
  await query("UPDATE sales SET status = :status WHERE id = :id", { status, id: Number(req.params.id) });
  broadcast("reports-updated", {});
  res.json({ ok: true });
});

app.get("/api/admin/reports", auth, adminOnly, async (_req, res) => {
  const [eventTotals, salesTotals, productTotals, dailyVisits] = await Promise.all([
    query(
      `SELECT
        SUM(event_type = 'page_view') AS total_visits,
        SUM(event_type = 'discord_click') AS discord_clicks,
        SUM(event_type = 'buy_click') AS buy_clicks
       FROM analytics_events`
    ),
    query(
      `SELECT
        COUNT(*) AS total_sales,
        SUM(status = 'pendiente') AS pending_sales,
        SUM(status IN ('pagado', 'entregado')) AS completed_sales,
        COALESCE(SUM(CASE WHEN status IN ('pagado', 'entregado') THEN price ELSE 0 END), 0) AS revenue
       FROM sales`
    ),
    query("SELECT COUNT(*) AS total_products, SUM(active = 1) AS active_products FROM products"),
    query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS total
       FROM analytics_events
       WHERE event_type = 'page_view' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`
    )
  ]);

  res.json({
    activeVisitors: activeVisitorCount(),
    totalVisits: Number(eventTotals[0].total_visits || 0),
    discordClicks: Number(eventTotals[0].discord_clicks || 0),
    buyClicks: Number(eventTotals[0].buy_clicks || 0),
    totalSales: Number(salesTotals[0].total_sales || 0),
    pendingSales: Number(salesTotals[0].pending_sales || 0),
    completedSales: Number(salesTotals[0].completed_sales || 0),
    revenue: Number(salesTotals[0].revenue || 0),
    totalProducts: Number(productTotals[0].total_products || 0),
    activeProducts: Number(productTotals[0].active_products || 0),
    dailyVisits: dailyVisits.map((item) => ({ day: item.day, total: Number(item.total) }))
  });
});

app.use(express.static(__dirname, { dotfiles: "ignore" }));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Ocurrio un error en el servidor." });
});

async function start() {
  await pool.query("SELECT 1");
  await syncConfiguredAdmin();
  await seedProducts();
  setInterval(() => {
    activeVisitorCount();
    broadcast("active-visitors", { activeVisitors: activeVisitorCount() });
  }, 15000).unref();
  app.listen(PORT, HOST, () => {
    console.log(`Fire Cheat corriendo en http://localhost:${PORT}`);
    console.log(`Panel admin: http://localhost:${PORT}/admin.html`);
  });
}

start().catch((error) => {
  console.error("No se pudo iniciar el servidor:", error.message);
  process.exit(1);
});
