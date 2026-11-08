// One-click, per-provider samples for the public debugger (F3). Each sample is
// signed CLIENT-SIDE with Web Crypto at click time, using the current clock, so
// the timestamp-bearing schemes (Stripe, Slack, Standard Webhooks) land inside
// the replay window and the sample verifies as PASS every time — no stale
// fixtures to rot. The signing math mirrors the Go verify engine exactly
// (server/internal/verify/*): same base strings, same hex/base64 encodings.

import type { Provider } from "@/lib/types";

export interface DebugSample {
  provider: Provider;
  secret: string;
  /** Characteristic non-signature headers the provider sends (for auto-detect
   *  realism); the signature headers are added by signSample(). */
  headers: Record<string, string>;
  body: string;
  /** The full external URL the request was made to. Only Twilio needs it (its
   *  signature is URL-bound); omitted for every other provider. */
  url?: string;
}

// Bodies mirror server/internal/samples/samples.go so the tool feels real.
export const SAMPLES: Record<Provider, DebugSample> = {
  stripe: {
    provider: "stripe",
    secret: "whsec_vT3xMPLEsampleSecretForDemo0001",
    headers: { "Stripe-Version": "2024-06-20", "Content-Type": "application/json" },
    body: `{"id":"evt_1PZsample","object":"event","type":"checkout.session.completed","api_version":"2024-06-20","created":1700000000,"livemode":false,"data":{"object":{"id":"cs_test_sample","object":"checkout.session","amount_total":2000,"currency":"usd","customer":"cus_sample","payment_status":"paid","status":"complete"}}}`,
  },
  github: {
    provider: "github",
    secret: "gh_whsecret_demo_0001",
    headers: {
      "X-GitHub-Event": "push",
      "X-GitHub-Delivery": "sample-delivery-0001",
      "Content-Type": "application/json",
    },
    body: `{"ref":"refs/heads/main","before":"0000000000000000000000000000000000000000","after":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2","repository":{"id":1,"name":"demo","full_name":"octocat/demo","private":false},"pusher":{"name":"octocat","email":"octo@example.com"},"commits":[{"id":"a1b2c3d","message":"Ship webhook debugger","author":{"name":"octocat"}}]}`,
  },
  razorpay: {
    provider: "razorpay",
    secret: "rzp_whsecret_demo_0001",
    headers: { "X-Razorpay-Event-Id": "evt_sample0001", "Content-Type": "application/json" },
    body: `{"entity":"event","account_id":"acc_sample","event":"payment.captured","contains":["payment"],"payload":{"payment":{"entity":{"id":"pay_sample0001","entity":"payment","amount":50000,"currency":"INR","status":"captured","order_id":"order_sample","method":"card"}}},"created_at":1700000000}`,
  },
  shopify: {
    provider: "shopify",
    secret: "shpss_demo_client_secret_0001",
    headers: {
      "X-Shopify-Topic": "orders/create",
      "X-Shopify-Shop-Domain": "sample-shop.myshopify.com",
      "X-Shopify-API-Version": "2024-07",
      "X-Shopify-Webhook-Id": "sample-webhook-0001",
      "Content-Type": "application/json",
    },
    body: `{"id":820982911946154500,"email":"jon@example.com","currency":"USD","total_price":"199.00","financial_status":"paid","name":"#1001","line_items":[{"id":1,"title":"Pro Plan","quantity":1,"price":"199.00"}]}`,
  },
  standard_webhooks: {
    provider: "standard_webhooks",
    // Must be base64 after the whsec_ prefix (the key is the decoded bytes).
    secret: "whsec_c3RhbmRhcmQtd2ViaG9va3MtZGVtby1zZWNyZXQ=",
    headers: { "Content-Type": "application/json" },
    body: `{"type":"subscription.active","timestamp":"2024-01-01T00:00:00Z","data":{"subscription_id":"sub_sample0001","customer":{"email":"dev@example.com"},"product_id":"prod_pro","status":"active","recurring_pre_tax_amount":1200,"currency":"USD"}}`,
  },
  slack: {
    provider: "slack",
    secret: "slack_signing_secret_demo_0001",
    headers: { "Content-Type": "application/json" },
    body: `{"token":"sampletoken","team_id":"T0001","api_app_id":"A0001","event":{"type":"app_mention","user":"U0001","text":"<@U0BOT> ship it","ts":"1700000000.000100","channel":"C0001"},"type":"event_callback","event_id":"Ev0001","event_time":1700000000}`,
  },
  twilio: {
    provider: "twilio",
    // Twilio's account auth token is the HMAC key (used verbatim).
    secret: "twilio_auth_token_demo_0001",
    // Twilio's messaging webhooks are form-encoded; the "+" in numbers is
    // percent-encoded on the wire exactly as Twilio posts it.
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `MessageSid=SM0a1b2c3d4e5f60718293a4b5c6d7e8f90&AccountSid=ACcafebabecafebabecafebabecafebabe&MessagingServiceSid=MG9876543210fedcba9876543210fedcb0&From=%2B14155550123&To=%2B18005551212&Body=your+hookd+code+is+2468&NumMedia=0&NumSegments=1&SmsStatus=received&ApiVersion=2010-04-01`,
    url: "https://api.hookd.dev/i/ep_twilio_demo",
  },
  vercel: {
    provider: "vercel",
    secret: "vercel_whsecret_demo_0001",
    headers: {
      "x-vercel-deployment-url": "demo-ship-1a2b3c.vercel.app",
      "x-vercel-id": "iad1::sample-0001",
      "Content-Type": "application/json",
    },
    body: `{"id":"evt_vercel_sample0001","type":"deployment.succeeded","createdAt":1700000000,"region":"iad1","payload":{"team":{"id":"team_sample"},"user":{"id":"user_sample"},"deployment":{"id":"dpl_sample0001","name":"demo-ship","url":"demo-ship-1a2b3c.vercel.app","meta":{"githubCommitRef":"main","githubCommitSha":"a1b2c3d4"}},"project":{"id":"prj_sample0001"},"target":"production"}}`,
  },
};

// ---- Web Crypto HMAC helpers (browser + Node 18+ expose globalThis.crypto) --

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64(buf: ArrayBuffer): string {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSha256(key: Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    // Copy into a fresh ArrayBuffer so the exact-length view is a valid BufferSource.
    key.slice(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}

async function hmacSha1(key: Uint8Array, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey(
    "raw",
    key.slice(),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}

/** Build Twilio's form-mode signing string: the URL followed by each POST param
 *  (keys sorted ascending; each key's url-decoded values sorted+deduped) with no
 *  separators. Mirrors the Go verify engine's twilioFormData exactly. */
function twilioFormData(url: string, body: string): string {
  const params = new URLSearchParams(body);
  const keys = Array.from(new Set(Array.from(params.keys()))).sort();
  let data = url;
  for (const k of keys) {
    const vals = Array.from(new Set(params.getAll(k))).sort();
    for (const v of vals) data += k + v;
  }
  return data;
}

/** The pre-filled fields for a provider sample, with freshly computed signature
 *  headers merged in. Returns a flat key:value header map (as the textarea wants). */
export async function signSample(provider: Provider): Promise<{
  provider: Provider;
  secret: string;
  headers: Record<string, string>;
  body: string;
  url?: string;
}> {
  const s = SAMPLES[provider];
  const headers: Record<string, string> = { ...s.headers };
  const nowSec = Math.floor(Date.now() / 1000).toString();

  switch (provider) {
    case "stripe": {
      const hex = toHex(await hmacSha256(enc.encode(s.secret), `${nowSec}.${s.body}`));
      headers["Stripe-Signature"] = `t=${nowSec},v1=${hex}`;
      break;
    }
    case "github": {
      const hex = toHex(await hmacSha256(enc.encode(s.secret), s.body));
      headers["X-Hub-Signature-256"] = `sha256=${hex}`;
      break;
    }
    case "razorpay": {
      const hex = toHex(await hmacSha256(enc.encode(s.secret), s.body));
      headers["X-Razorpay-Signature"] = hex;
      break;
    }
    case "shopify": {
      const b64 = toBase64(await hmacSha256(enc.encode(s.secret), s.body));
      headers["X-Shopify-Hmac-Sha256"] = b64;
      break;
    }
    case "slack": {
      const hex = toHex(await hmacSha256(enc.encode(s.secret), `v0:${nowSec}:${s.body}`));
      headers["X-Slack-Signature"] = `v0=${hex}`;
      headers["X-Slack-Request-Timestamp"] = nowSec;
      break;
    }
    case "standard_webhooks": {
      const key = b64ToBytes(s.secret.replace(/^whsec_/, ""));
      const id = "msg_sampledemo0001";
      const b64 = toBase64(await hmacSha256(key, `${id}.${nowSec}.${s.body}`));
      headers["Webhook-Id"] = id;
      headers["Webhook-Timestamp"] = nowSec;
      headers["Webhook-Signature"] = `v1,${b64}`;
      break;
    }
    case "twilio": {
      // URL-bound, form-encoded HMAC-SHA1 over url + sorted params.
      const data = twilioFormData(s.url ?? "", s.body);
      headers["X-Twilio-Signature"] = toBase64(
        await hmacSha1(enc.encode(s.secret), data),
      );
      break;
    }
    case "vercel": {
      // hex HMAC-SHA1 over the raw body (no prefix, no timestamp).
      const hex = toHex(await hmacSha1(enc.encode(s.secret), s.body));
      headers["x-vercel-signature"] = hex;
      break;
    }
  }

  return { provider, secret: s.secret, headers, body: s.body, url: s.url };
}

/** Serialize a header map to the textarea's `key: value` line format. */
export function headersToLines(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

/** Parse the headers textarea (`key: value` lines) back into a map; blank lines
 *  and lines without a colon are skipped. */
export function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const name = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (name) out[name] = value;
  }
  return out;
}
