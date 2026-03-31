import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC_KEY = 'BPu3Z9f90Zf3aY_gUxj0SE4War9qt7Yjd8dMRwZnK9KZ15ISm1XWqLeORSZnS4YIlMRZPrst-xtMPfXL9xAkcSk';

// ---- Base64url helpers ----
function b64urlDecode(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b);
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
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ---- VAPID JWT ----
function extractXY(publicKeyB64url: string) {
  const raw = b64urlDecode(publicKeyB64url);
  return { x: b64urlEncode(raw.slice(1, 33)), y: b64urlEncode(raw.slice(33, 65)) };
}

async function createVapidJwt(audience: string, subject: string, privateKeyB64url: string) {
  const { x, y } = extractXY(VAPID_PUBLIC_KEY);
  const d = b64urlEncode(b64urlDecode(privateKeyB64url));

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const enc = new TextEncoder();
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(enc.encode(JSON.stringify({ aud: audience, exp: now + 43200, sub: subject })));
  const unsigned = `${header}.${payload}`;

  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  const rawSig = derToRaw(sig);
  return `${unsigned}.${b64urlEncode(rawSig)}`;
}

function derToRaw(der: Uint8Array): Uint8Array {
  if (der.length === 64) return der;
  const raw = new Uint8Array(64);
  let off = 2;
  off++; const rLen = der[off++];
  const rS = off + Math.max(0, rLen - 32);
  raw.set(der.slice(rS, rS + Math.min(32, rLen)), 32 - Math.min(32, rLen));
  off += rLen;
  off++; const sLen = der[off++];
  const sS = off + Math.max(0, sLen - 32);
  raw.set(der.slice(sS, sS + Math.min(32, sLen)), 64 - Math.min(32, sLen));
  return raw;
}

// ---- RFC 8291 Payload Encryption (aes128gcm) ----
async function encryptPayload(
  p256dhB64: string,
  authB64: string,
  payload: string,
): Promise<Uint8Array> {
  const clientPublicBytes = b64urlDecode(p256dhB64);
  const authSecret = b64urlDecode(authB64);
  const payloadBytes = new TextEncoder().encode(payload);

  // Import client public key
  const clientPublicKey = await crypto.subtle.importKey(
    'raw', clientPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    true, [],
  );

  // Generate ephemeral ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveBits'],
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPublicKey },
      localKeyPair.privateKey,
      256,
    ),
  );

  // Export local public key (uncompressed)
  const localPublicBytes = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey));

  // Salt (16 random bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF helper
  async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey('raw', ikm, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const prk = new Uint8Array(await crypto.subtle.sign('HMAC', key, salt.length > 0 ? salt : new Uint8Array(32)));
    // Actually HKDF: extract then expand
    const prkKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const prkBytes = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, ikm));
    
    const expandKey = await crypto.subtle.importKey('raw', prkBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const infoWithCounter = concat(info, new Uint8Array([1]));
    const okm = new Uint8Array(await crypto.subtle.sign('HMAC', expandKey, infoWithCounter));
    return okm.slice(0, length);
  }

  const enc = new TextEncoder();

  // IKM for auth: HKDF(authSecret, sharedSecret, "WebPush: info\0" || clientPublic || localPublic)
  const keyInfoHeader = enc.encode('WebPush: info\0');
  const keyInfo = concat(keyInfoHeader, clientPublicBytes, localPublicBytes);
  const ikm = await hkdf(sharedSecret, authSecret, keyInfo, 32);

  // Content encryption key
  const cekInfo = enc.encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdf(ikm, salt, cekInfo, 16);

  // Nonce
  const nonceInfo = enc.encode('Content-Encoding: nonce\0');
  const nonce = await hkdf(ikm, salt, nonceInfo, 12);

  // Pad payload (add delimiter 0x02 + optional padding)
  const paddedPayload = concat(payloadBytes, new Uint8Array([2]));

  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPayload),
  );

  // Build aes128gcm header: salt (16) || rs (4, uint32be) || idlen (1) || keyid (65 = localPublic)
  const rs = 4096;
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, rs, false);
  const header = concat(
    salt,
    rsBytes,
    new Uint8Array([localPublicBytes.length]),
    localPublicBytes,
  );

  return concat(header, encrypted);
}

// ---- Main ----

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!vapidPrivateKey) throw new Error("VAPID_PRIVATE_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const { schedule_type, organization_id, barber_id } = body;

    let subsQuery = supabase
      .from('push_subscriptions')
      .select('*, barbers!inner(id, name)')
      .eq('is_active', true);

    if (organization_id) subsQuery = subsQuery.eq('organization_id', organization_id);
    if (barber_id) subsQuery = subsQuery.eq('barber_id', barber_id);

    const { data: subscriptions, error: subsError } = await subsQuery;
    if (subsError) throw subsError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, found: 0, message: "Nenhuma subscription ativa" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Manaus time
    const now = new Date();
    const manausOffset = -4 * 60;
    const manausTime = new Date(now.getTime() + (now.getTimezoneOffset() + manausOffset) * 60000);
    const currentMonth = manausTime.getMonth() + 1;
    const currentYear = manausTime.getFullYear();
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(manausTime.getDate()).padStart(2, '0')}`;
    const barberIds = [...new Set(subscriptions.map(s => s.barber_id))];

    const { data: goals } = await supabase
      .from('monthly_goals')
      .select('barber_id, target_commission, work_days')
      .in('barber_id', barberIds)
      .eq('month', currentMonth)
      .eq('year', currentYear);

    const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const { data: productions } = await supabase
      .from('daily_productions')
      .select('barber_id, commission_earned')
      .in('barber_id', barberIds)
      .gte('date', startOfMonth)
      .lte('date', todayStr);

    const { data: todayProductions } = await supabase
      .from('daily_productions')
      .select('barber_id, commission_earned')
      .in('barber_id', barberIds)
      .eq('date', todayStr);

    const goalsMap = new Map<string, { target_commission: number; work_days: number }>();
    (goals || []).forEach(g => goalsMap.set(g.barber_id, g));

    const monthEarningsMap = new Map<string, number>();
    (productions || []).forEach(p => {
      monthEarningsMap.set(p.barber_id, (monthEarningsMap.get(p.barber_id) || 0) + Number(p.commission_earned));
    });

    const todayEarningsMap = new Map<string, number>();
    (todayProductions || []).forEach(p => {
      todayEarningsMap.set(p.barber_id, Number(p.commission_earned));
    });

    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const remainingDays = Math.max(1, daysInMonth - manausTime.getDate());

    let sentCount = 0;
    const errors: string[] = [];

    for (const sub of subscriptions) {
      const goal = goalsMap.get(sub.barber_id);
      const barberName = (sub as any).barbers?.name || 'Barbeiro';

      if (!goal) {
        errors.push(`${barberName}: sem meta configurada`);
        continue;
      }

      const monthEarnings = monthEarningsMap.get(sub.barber_id) || 0;
      const todayEarnings = todayEarningsMap.get(sub.barber_id) || 0;
      const progressPercent = Math.min(100, (monthEarnings / goal.target_commission) * 100);
      const remaining = Math.max(0, goal.target_commission - monthEarnings);
      const dailyTarget = remaining / remainingDays;

      const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      const type = schedule_type || 'manual';
      let title = '', messageBody = '';

      switch (type) {
        case 'morning':
          title = `☀️ Bom dia, ${barberName}!`;
          messageBody = `Seu foco de vendas hoje é ${fmt(dailyTarget)}. Você está em ${progressPercent.toFixed(1)}% da meta mensal. Bora! 💪`;
          break;
        case 'lunch':
          title = `🍽️ Hora do almoço, ${barberName}`;
          messageBody = todayEarnings > 0
            ? `Manhã produtiva! Vendas: ${fmt(todayEarnings)}. Faltam ${fmt(Math.max(0, dailyTarget - todayEarnings))} para a meta de hoje.`
            : `Ainda sem vendas hoje. Meta do dia: ${fmt(dailyTarget)}.`;
          break;
        case 'afternoon':
          title = `⚡ Reta final, ${barberName}`;
          messageBody = `Vendas hoje: ${fmt(todayEarnings)} | Meta: ${fmt(dailyTarget)} | Faltam ${fmt(Math.max(0, dailyTarget - todayEarnings))}`;
          break;
        case 'evening':
          title = `🌙 Fim do dia, ${barberName}`;
          messageBody = todayEarnings >= dailyTarget
            ? `Dia incrível! 🏆 Você bateu a meta com ${fmt(todayEarnings)}!`
            : `Vendas: ${fmt(todayEarnings)}. Faltaram ${fmt(Math.max(0, dailyTarget - todayEarnings))}. Amanhã é novo dia! 💪`;
          break;
        default:
          title = `📊 Meta - ${barberName}`;
          messageBody = `Meta de hoje: ${fmt(dailyTarget)} | Vendas: ${fmt(todayEarnings)} | Faltam ${fmt(Math.max(0, dailyTarget - todayEarnings))}`;
      }

      const payload = JSON.stringify({ title, body: messageBody, tag: `goal-${type}-${todayStr}`, url: '/' });

      try {
        const endpointUrl = new URL(sub.endpoint);
        const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;
        const jwt = await createVapidJwt(audience, 'mailto:notifications@performancebarber.com', vapidPrivateKey);
        const encryptedPayload = await encryptPayload(sub.p256dh, sub.auth, payload);

        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            'TTL': '86400',
            'Authorization': `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
          },
          body: encryptedPayload,
        });

        if (response.status === 410 || response.status === 404) {
          await supabase.from('push_subscriptions').update({ is_active: false }).eq('id', sub.id);
          errors.push(`${barberName}: subscription expirada`);
        } else if (response.ok || response.status === 201) {
          sentCount++;
        } else {
          const txt = await response.text().catch(() => '');
          errors.push(`${barberName}: HTTP ${response.status} ${txt.slice(0, 80)}`);
        }
      } catch (err) {
        errors.push(`${barberName}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ sent: sentCount, found: subscriptions.length, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
