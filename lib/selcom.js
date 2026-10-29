// Selcom Checkout API (developers.selcommobile.com): create an order, push a payment prompt to the
// customer's phone, and read the order status. Every request is signed:
//   Authorization: SELCOM <base64(api key)>
//   Timestamp:     ISO 8601 time
//   Digest-Method: HS256
//   Signed-Fields: the field names, comma separated
//   Digest:        base64(HMAC-SHA256("timestamp=<ts>&field=value&…", api secret))
// We never trust a callback on its own: payments are confirmed by asking Selcom for the order status.
import crypto from "node:crypto";

function timestamp() {
  const d = new Date(Date.now() + 3 * 36e5); // East Africa Time (UTC+3)
  return d.toISOString().replace(/\.\d{3}Z$/, "+03:00");
}

export function signHeaders(creds, params, ts = timestamp()) {
  const fields = Object.keys(params);
  const signing = "timestamp=" + ts + fields.map((k) => "&" + k + "=" + params[k]).join("");
  return {
    Authorization: "SELCOM " + Buffer.from(creds.apiKey).toString("base64"),
    Timestamp: ts,
    "Digest-Method": "HS256",
    "Signed-Fields": fields.join(","),
    Digest: crypto.createHmac("sha256", creds.apiSecret).update(signing).digest("base64"),
  };
}

async function call(creds, method, path, params) {
  const url = creds.baseUrl + path + (method === "GET" ? "?" + new URLSearchParams(params) : "");
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...signHeaders(creds, params) },
    body: method === "GET" ? undefined : JSON.stringify(params),
  });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { j = { result: "FAIL", message: text.slice(0, 200) }; }
  if (!r.ok) throw Object.assign(new Error("Selcom: " + (j.message || r.status)), { status: 502, selcom: j });
  return j;
}

// Creates a mobile-money order. webhook is our callback URL (Selcom wants it base64-encoded).
export function createOrder(creds, o) {
  return call(creds, "POST", "/v1/checkout/create-order-minimal", {
    vendor: creds.vendor,
    order_id: o.orderId,
    buyer_email: o.email,
    buyer_name: o.name,
    buyer_phone: o.phone,
    amount: o.amount,
    currency: "TZS",
    webhook: Buffer.from(o.webhook).toString("base64"),
    buyer_remarks: o.remarks || "",
    merchant_remarks: o.remarks || "",
    no_of_items: 1,
  });
}

// Sends the PIN prompt to the customer's phone. A 'PENDING' reply only means the prompt was sent.
export function pushToPhone(creds, orderId, transid, msisdn) {
  return call(creds, "POST", "/v1/checkout/wallet-payment", { transid, order_id: orderId, msisdn });
}

// payment_status: PENDING, INPROGRESS, COMPLETED, CANCELLED, USERCANCELLED, REJECTED
export async function orderStatus(creds, orderId) {
  const j = await call(creds, "GET", "/v1/checkout/order-status", { order_id: orderId });
  const row = Array.isArray(j.data) ? j.data[0] : j.data || {};
  return { status: String((row && row.payment_status) || "PENDING").toUpperCase(), row: row || {}, raw: j };
}
