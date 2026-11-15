const http = require("node:http");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const MAX_BODY_BYTES = 10 * 1024;
const products = [
  { id: "golden-hour", name: "Golden Hour", price: 68, notes: "Bergamot · vanilla · warm skin" },
  { id: "soft-focus", name: "Soft Focus", price: 72, notes: "Rose petals · pink pepper · musk" },
  { id: "somewhere-slow", name: "Somewhere Slow", price: 68, notes: "Sandalwood · fig · soft woods" },
  { id: "after-hours", name: "After Hours", price: 74, notes: "Black cherry · amber · tonka" },
];
const productById = new Map(products.map((product) => [product.id, product]));
let writeQueue = Promise.resolve();

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        request.resume();
        return;
      }
      body += chunk;
    });
    request.on("end", () => {
      if (size > MAX_BODY_BYTES) return;
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(Object.assign(new Error("Request body must be a JSON object."), { status: 400 }));
          return;
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error("Request body must be a valid JSON object."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

async function loadStore() {
  try {
    const contents = await fs.readFile(STORE_FILE, "utf8");
    const store = JSON.parse(contents);
    if (!Array.isArray(store.orders) || !Array.isArray(store.subscribers)) {
      throw new Error("Store data has an invalid format.");
    }
    return store;
  } catch (error) {
    if (error.code === "ENOENT") return { orders: [], subscribers: [] };
    throw error;
  }
}

function updateStore(update) {
  const operation = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const store = await loadStore();
    const result = update(store);
    const temporaryFile = `${STORE_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(store, null, 2), "utf8");
    await fs.rename(temporaryFile, STORE_FILE);
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

function validateOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    return { error: "Add between 1 and 20 products to your bag." };
  }

  const quantities = new Map();
  for (const item of items) {
    if (
      !item ||
      typeof item.productId !== "string" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 50
    ) {
      return { error: "Each product must have a valid ID and a quantity from 1 to 50." };
    }
    if (!productById.has(item.productId)) {
      return { error: "Your bag includes an unavailable product." };
    }
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
    if (quantities.get(item.productId) > 50) {
      return { error: "A maximum of 50 of each product can be ordered." };
    }
  }

  const normalizedItems = [...quantities].map(([productId, quantity]) => {
    const product = productById.get(productId);
    return { productId, name: product.name, price: product.price, quantity };
  });
  const total = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { items: normalizedItems, total };
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/products") {
    sendJson(response, 200, { products });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/newsletter") {
    const body = await readJsonBody(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sendJson(response, 400, { error: "Enter a valid email address." });
      return;
    }

    const result = await updateStore((store) => {
      const existing = store.subscribers.find((subscriber) => subscriber.email === email);
      if (existing) return { subscribed: true, alreadySubscribed: true };
      store.subscribers.push({ email, createdAt: new Date().toISOString() });
      return { subscribed: true, alreadySubscribed: false };
    });
    sendJson(response, 201, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/orders") {
    const body = await readJsonBody(request);
    const validated = validateOrderItems(body.items);
    if (validated.error) {
      sendJson(response, 400, { error: validated.error });
      return;
    }

    const order = {
      id: randomUUID(),
      status: "awaiting_payment",
      items: validated.items,
      total: validated.total,
      currency: "USD",
      createdAt: new Date().toISOString(),
    };
    await updateStore((store) => store.orders.push(order));
    sendJson(response, 201, {
      orderId: order.id,
      status: order.status,
      total: order.total,
      currency: order.currency,
    });
    return;
  }

  sendJson(response, 404, { error: "API endpoint not found." });
}

const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    if (url.pathname !== "/" && url.pathname !== "/index.html") {
      if (url.pathname === "/favicon.svg") {
        const icon = await fs.readFile(path.join(__dirname, "favicon.svg"));
        response.writeHead(200, {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        });
        response.end(request.method === "HEAD" ? undefined : icon);
        return;
      }
      sendJson(response, 404, { error: "Page not found." });
      return;
    }

    const html = await fs.readFile(path.join(__dirname, "index.html"));
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : html);
  } catch (error) {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    if (error.status) {
      sendJson(response, error.status, { error: error.message });
      return;
    }
    console.error("Request failed:", error);
    sendJson(response, 500, { error: "The server could not complete your request." });
  }
});

server.listen(PORT, () => {
  console.log(`Kish is running at http://localhost:${PORT}`);
});

server.on("error", (error) => {
  console.error("Server failed to start:", error);
  process.exitCode = 1;
});
