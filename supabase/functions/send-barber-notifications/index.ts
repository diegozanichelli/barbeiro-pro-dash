import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC_KEY = 'BPu3Z9f90Zf3aY_gUxj0SE4War9qt7Yjd8dMRwZnK9KZ15ISm1XWqLeORSZnS4YIlMRZPrst-xtMPfXL9xAkcSk';

function b64urlDecode(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (b.length % 4)) % 4;
  const bin = atob(b + '='.repeat(pad));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function b64urlEncode(arr: Uint8Array): string {
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((a, b) => a + b.length, 0);
  const result = new Uint8Array(len);
  let offset = 0;
  for (const arr of arrays) { result.set(arr, offset); offset += arr.length; }
  return result;
}

// ---- VAPID JWT (ES256) ----
async function createVapidJwt(audience: string, subject: string, privateKeyB64url: string): Promise<string> {
  const pubRaw = b64urlDecode(VAPID_PUBLIC_KEY);
  const x = b64urlEncode(pubRaw.slice(1, 33));
  const y = b64urlEncode(pubRaw.slice(33, 65));
  const d = b64urlEncode(b64urlDecode(privateKeyB64url));

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  );

  const enc = new TextEncoder();
  const hdr = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const pay = b64urlEncode(enc.encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: subject })));
  const unsigned = `${hdr}.${pay}`;

  const sigDer = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));

  // DER → raw r||s
  let raw: Uint8Array;
  if (sigDer.length === 64) {
    raw = sigDer;
  } else {
    raw = new Uint8Array(64);
    let off = 2;
    off++; const rLen = sigDer[off++];
    const rOff = rLen > 32 ? off + (rLen - 32) : off;
    const rCopy = Math.min(32, rLen);
    raw.set(sigDer.slice(rOff, rOff + rCopy), 32 - rCopy);
    off += rLen;
    off++; const sLen = sigDer[off++];
    const sOff = sLen > 32 ? off + (sLen - 32) : off;
    const sCopy = Math.min(32, sLen);
    raw.set(sigDer.slice(sOff, sOff + sCopy), 64 - sCopy);
  }

  return `${unsigned}.${b64urlEncode(raw)}`;
}

// ---- RFC 8291 payload encryption (aes128gcm) ----
async function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  // Extract
  const prkKey = await crypto.subtle.importKey('raw', salt.length ? salt : new Uint8Array(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, ikm));
  // Expand
  const expandKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const t1 = new Uint8Array(await crypto.subtle.sign('HMAC', expandKey, concat(info, new Uint8Array([1]))));
  return t1.slice(0, length);
}

async function encryptPayload(p256dhB64: string, authB64: string, payload: string): Promise<Uint8Array> {
  const clientPubBytes = b64urlDecode(p256dhB64);
  const authSecret = b64urlDecode(authB64);
  const payloadBytes = new TextEncoder().encode(payload);

  const clientPubKey = await crypto.subtle.importKey('raw', clientPubBytes, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const localKP = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPubKey }, localKP.privateKey, 256));
  const localPubBytes = new Uint8Array(await crypto.subtle.exportKey('raw', localKP.publicKey));

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();

  // IKM from auth secret
  const keyInfoBuf = concat(enc.encode('WebPush: info\0'), clientPubBytes, localPubBytes);
  const ikm = await hkdfSha256(sharedSecret, authSecret, keyInfoBuf, 32);

  // CEK & nonce
  const cek = await hkdfSha256(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfSha256(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12);

  // Pad: payload || 0x02
  const padded = concat(payloadBytes, new Uint8Array([2]));

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // aes128gcm header: salt(16) | rs(4) | idlen(1) | keyid(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  return concat(salt, rs, new Uint8Array([localPubBytes.length]), localPubBytes, ciphertext);
}

// ---- Main ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    if (!vapidPrivateKey) throw new Error("VAPID_PRIVATE_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const { schedule_type, organization_id, barber_id } = body;

    let subsQuery = supabase.from('push_subscriptions').select('*, barbers!inner(id, name)').eq('is_active', true);
    if (organization_id) subsQuery = subsQuery.eq('organization_id', organization_id);
    if (barber_id) subsQuery = subsQuery.eq('barber_id', barber_id);

    const { data: subscriptions, error: subsError } = await subsQuery;
    if (subsError) throw subsError;

    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ sent: 0, found: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Manaus time
    const now = new Date();
    const mt = new Date(now.getTime() + (now.getTimezoneOffset() - 240) * 60000);
    const cm = mt.getMonth() + 1, cy = mt.getFullYear();
    const todayStr = `${cy}-${String(cm).padStart(2, '0')}-${String(mt.getDate()).padStart(2, '0')}`;
    const barberIds = [...new Set(subscriptions.map(s => s.barber_id))];

    const [{ data: goals }, { data: productions }, { data: todayProd }] = await Promise.all([
      supabase.from('monthly_goals').select('barber_id, target_commission, work_days').in('barber_id', barberIds).eq('month', cm).eq('year', cy),
      supabase.from('daily_productions').select('barber_id, commission_earned').in('barber_id', barberIds).gte('date', `${cy}-${String(cm).padStart(2, '0')}-01`).lte('date', todayStr),
      supabase.from('daily_productions').select('barber_id, commission_earned').in('barber_id', barberIds).eq('date', todayStr),
    ]);

    const goalsMap = new Map<string, { target_commission: number; work_days: number }>();
    (goals || []).forEach(g => goalsMap.set(g.barber_id, g));

    const monthMap = new Map<string, number>();
    (productions || []).forEach(p => monthMap.set(p.barber_id, (monthMap.get(p.barber_id) || 0) + Number(p.commission_earned)));

    const todayMap = new Map<string, number>();
    (todayProd || []).forEach(p => todayMap.set(p.barber_id, Number(p.commission_earned)));

    const remDays = Math.max(1, new Date(cy, cm, 0).getDate() - mt.getDate());
    let sentCount = 0;
    const errors: string[] = [];

    for (const sub of subscriptions) {
      const goal = goalsMap.get(sub.barber_id);
      const name = (sub as any).barbers?.name || 'Barbeiro';
      if (!goal) { errors.push(`${name}: sem meta`); continue; }

      const mEarn = monthMap.get(sub.barber_id) || 0;
      const tEarn = todayMap.get(sub.barber_id) || 0;
      const pct = Math.min(100, (mEarn / goal.target_commission) * 100);
      const rem = Math.max(0, goal.target_commission - mEarn);
      const daily = rem / remDays;
      const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      const type = schedule_type || 'manual';

      let title = '', msg = '';
      switch (type) {
        case 'morning': title = `☀️ Bom dia, ${name}!`; msg = `Foco de vendas: ${fmt(daily)}. Meta mensal: ${pct.toFixed(1)}%. Bora! 💪`; break;
        case 'lunch': title = `🍽️ Almoço, ${name}`; msg = tEarn > 0 ? `Vendas: ${fmt(tEarn)}. Faltam ${fmt(Math.max(0, daily - tEarn))} para meta de hoje.` : `Sem vendas ainda. Meta: ${fmt(daily)}.`; break;
        case 'afternoon': title = `⚡ Reta final, ${name}`; msg = `Vendas: ${fmt(tEarn)} | Meta: ${fmt(daily)} | Faltam ${fmt(Math.max(0, daily - tEarn))}`; break;
        case 'evening': title = `🌙 Fim do dia, ${name}`; msg = tEarn >= daily ? `🏆 Meta batida! ${fmt(tEarn)}` : `Vendas: ${fmt(tEarn)}. Faltaram ${fmt(Math.max(0, daily - tEarn))}. Amanhã é novo dia! 💪`; break;
        default: title = `📊 Meta - ${name}`; msg = `Meta: ${fmt(daily)} | Vendas: ${fmt(tEarn)} | Faltam ${fmt(Math.max(0, daily - tEarn))}`;
      }

      const payload = JSON.stringify({ title, body: msg, tag: `goal-${type}-${todayStr}`, url: '/' });

      try {
        const ep = new URL(sub.endpoint);
        const aud = `${ep.protocol}//${ep.host}`;
        const jwt = await createVapidJwt(aud, 'mailto:notifications@performancebarber.com', vapidPrivateKey);
        const encrypted = await encryptPayload(sub.p256dh, sub.auth, payload);

        console.log(`Sending to ${name}, endpoint host: ${ep.host}, payload size: ${encrypted.length}`);

        const resp = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(encrypted.length),
            'TTL': '86400',
            'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
          },
          body: encrypted,
        });

        if (resp.status === 410 || resp.status === 404) {
          await supabase.from('push_subscriptions').update({ is_active: false }).eq('id', sub.id);
          errors.push(`${name}: expirada`);
        } else if (resp.ok || resp.status === 201) {
          sentCount++;
        } else {
          const txt = await resp.text().catch(() => '');
          console.log(`Push failed for ${name}: ${resp.status} ${txt}`);
          errors.push(`${name}: HTTP ${resp.status}`);
        }
      } catch (err) {
        console.error(`Push error for ${name}:`, err);
        errors.push(`${name}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ sent: sentCount, found: subscriptions.length, errors: errors.length ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
