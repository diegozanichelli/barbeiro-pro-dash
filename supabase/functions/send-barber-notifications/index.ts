import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- VAPID / Web Push helpers ---

function base64urlToUint8Array(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function importVapidPrivateKey(raw32: Uint8Array): Promise<CryptoKey> {
  // Wrap raw 32-byte scalar in PKCS8 DER for P-256
  const pkcs8Prefix = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
    0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02,
    0x01, 0x01, 0x04, 0x20,
  ]);
  // After the 32-byte key we need the ECPoint wrapper but the SubtleCrypto
  // import for ECDSA signing only needs the scalar when using JWK, so let's use JWK instead.
  // Actually PKCS8 needs the full structure. Let's use JWK:
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: uint8ArrayToBase64url(raw32),
    // We can derive x/y from the private key but SubtleCrypto doesn't do that.
    // Instead we'll pass x and y from the public key.
  };
  // We need x,y from the VAPID public key to build a complete JWK.
  // Let's import from the public key constant.
  return null as any; // placeholder - will use alternate approach
}

// Simpler approach: use JWK import with known public key coordinates
const VAPID_PUBLIC_KEY = 'BPu3Z9f90Zf3aY_gUxj0SE4War9qt7Yjd8dMRwZnK9KZ15ISm1XWqLeORSZnS4YIlMRZPrst-xtMPfXL9xAkcSk';

function extractPublicKeyXY(vapidPublicB64url: string): { x: string; y: string } {
  const raw = base64urlToUint8Array(vapidPublicB64url);
  // Uncompressed point: 0x04 || x (32 bytes) || y (32 bytes)
  const x = raw.slice(1, 33);
  const y = raw.slice(33, 65);
  return {
    x: uint8ArrayToBase64url(x),
    y: uint8ArrayToBase64url(y),
  };
}

async function createVapidJwt(
  audience: string,
  subject: string,
  privateKeyB64url: string,
): Promise<{ token: string; publicKeyB64url: string }> {
  const { x, y } = extractPublicKeyXY(VAPID_PUBLIC_KEY);
  const dBytes = base64urlToUint8Array(privateKeyB64url);

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d: uint8ArrayToBase64url(dBytes), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject,
  };

  const enc = new TextEncoder();
  const headerB64 = uint8ArrayToBase64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64url(enc.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)),
  );

  // ECDSA signature from WebCrypto is DER-encoded; JWT needs raw r||s (64 bytes).
  const rawSig = derToRaw(sig);
  const sigB64 = uint8ArrayToBase64url(rawSig);

  return { token: `${unsigned}.${sigB64}`, publicKeyB64url: VAPID_PUBLIC_KEY };
}

function derToRaw(der: Uint8Array): Uint8Array {
  // If already 64 bytes, it's raw
  if (der.length === 64) return der;

  // DER: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
  const raw = new Uint8Array(64);
  let offset = 2; // skip 0x30 <len>
  // r
  offset++; // 0x02
  const rLen = der[offset++];
  const rStart = offset + Math.max(0, rLen - 32);
  const rCopyLen = Math.min(32, rLen);
  raw.set(der.slice(rStart, rStart + rCopyLen), 32 - rCopyLen);
  offset += rLen;
  // s
  offset++; // 0x02
  const sLen = der[offset++];
  const sStart = offset + Math.max(0, sLen - 32);
  const sCopyLen = Math.min(32, sLen);
  raw.set(der.slice(sStart, sStart + sCopyLen), 64 - sCopyLen);
  return raw;
}

// --- Main handler ---

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!vapidPrivateKey) {
      throw new Error("VAPID_PRIVATE_KEY not configured");
    }

    const body = await req.json().catch(() => ({}));
    const { schedule_type, organization_id, barber_id } = body;

    // Build query for active push subscriptions
    let subsQuery = supabase
      .from('push_subscriptions')
      .select('*, barbers!inner(id, name, services_commission, organization_id, unit_id)')
      .eq('is_active', true);

    if (organization_id) {
      subsQuery = subsQuery.eq('organization_id', organization_id);
    }
    if (barber_id) {
      subsQuery = subsQuery.eq('barber_id', barber_id);
    }

    const { data: subscriptions, error: subsError } = await subsQuery;
    if (subsError) throw subsError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, found: 0, message: "Nenhuma subscription ativa encontrada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current month/year in Manaus timezone
    const now = new Date();
    const manausOffset = -4 * 60;
    const manausTime = new Date(now.getTime() + (now.getTimezoneOffset() + manausOffset) * 60000);
    const currentMonth = manausTime.getMonth() + 1;
    const currentYear = manausTime.getFullYear();
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(manausTime.getDate()).padStart(2, '0')}`;

    const barberIds = [...new Set(subscriptions.map(s => s.barber_id))];

    // Fetch monthly goals
    const { data: goals } = await supabase
      .from('monthly_goals')
      .select('barber_id, target_commission, work_days')
      .in('barber_id', barberIds)
      .eq('month', currentMonth)
      .eq('year', currentYear);

    // Fetch month productions
    const startOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const { data: productions } = await supabase
      .from('daily_productions')
      .select('barber_id, date, commission_earned')
      .in('barber_id', barberIds)
      .gte('date', startOfMonth)
      .lte('date', todayStr);

    // Fetch today's productions
    const { data: todayProductions } = await supabase
      .from('daily_productions')
      .select('barber_id, commission_earned')
      .in('barber_id', barberIds)
      .eq('date', todayStr);

    const goalsMap = new Map<string, { target_commission: number; work_days: number }>();
    (goals || []).forEach(g => goalsMap.set(g.barber_id, g));

    const monthEarningsMap = new Map<string, number>();
    (productions || []).forEach(p => {
      const current = monthEarningsMap.get(p.barber_id) || 0;
      monthEarningsMap.set(p.barber_id, current + Number(p.commission_earned));
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
      if (!goal) {
        errors.push(`${(sub as any).barbers?.name || sub.barber_id}: sem meta configurada`);
        continue;
      }

      const monthEarnings = monthEarningsMap.get(sub.barber_id) || 0;
      const todayEarnings = todayEarningsMap.get(sub.barber_id) || 0;
      const progressPercent = Math.min(100, (monthEarnings / goal.target_commission) * 100);
      const remaining = Math.max(0, goal.target_commission - monthEarnings);
      const dailyTarget = remaining / remainingDays;
      const barberName = (sub as any).barbers?.name || 'Barbeiro';

      let title = '';
      let messageBody = '';
      const type = schedule_type || 'manual';

      const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

      switch (type) {
        case 'morning':
          title = `☀️ Bom dia, ${barberName}!`;
          messageBody = `Seu foco de vendas hoje é ${formatCurrency(dailyTarget)}. Você está em ${progressPercent.toFixed(1)}% da meta mensal. Bora fazer acontecer! 💪`;
          break;
        case 'lunch':
          title = `🍽️ Hora do almoço, ${barberName}`;
          if (todayEarnings > 0) {
            messageBody = `Manhã produtiva! Vendas até agora: ${formatCurrency(todayEarnings)}. Faltam ${formatCurrency(Math.max(0, dailyTarget - todayEarnings))} para bater a meta de hoje.`;
          } else {
            messageBody = `Ainda sem vendas registradas hoje. Meta de vendas do dia: ${formatCurrency(dailyTarget)}.`;
          }
          break;
        case 'afternoon':
          title = `⚡ Reta final da tarde, ${barberName}`;
          messageBody = `Vendas hoje: ${formatCurrency(todayEarnings)} | Meta de hoje: ${formatCurrency(dailyTarget)} | Faltam ${formatCurrency(Math.max(0, dailyTarget - todayEarnings))} para fechar o dia.`;
          break;
        case 'evening':
          title = `🌙 Fim do expediente, ${barberName}`;
          if (todayEarnings >= dailyTarget) {
            messageBody = `Dia incrível! 🏆 Você bateu sua meta de vendas diária com ${formatCurrency(todayEarnings)}. Continue assim!`;
          } else {
            messageBody = `Você fechou o dia com ${formatCurrency(todayEarnings)} em vendas. Faltaram ${formatCurrency(Math.max(0, dailyTarget - todayEarnings))} para a meta diária. Amanhã é um novo dia! 💪`;
          }
          break;
        default:
          title = `📊 Atualização de Meta - ${barberName}`;
          messageBody = `Meta de hoje: ${formatCurrency(dailyTarget)} | Vendas hoje: ${formatCurrency(todayEarnings)} | Faltam ${formatCurrency(Math.max(0, dailyTarget - todayEarnings))} para fechar o dia.`;
      }

      const payload = JSON.stringify({
        title,
        body: messageBody,
        tag: `goal-${type}-${todayStr}`,
        url: '/',
      });

      try {
        // Build VAPID authorization for this endpoint
        const endpointUrl = new URL(sub.endpoint);
        const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

        const { token, publicKeyB64url } = await createVapidJwt(
          audience,
          'mailto:notifications@performancebarber.com',
          vapidPrivateKey,
        );

        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'TTL': '86400',
            'Authorization': `vapid t=${token}, k=${publicKeyB64url}`,
          },
          body: payload,
        });

        if (response.status === 410 || response.status === 404) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
          errors.push(`${barberName}: subscription expirada (${response.status})`);
        } else if (response.ok || response.status === 201) {
          sentCount++;
        } else {
          const respText = await response.text().catch(() => '');
          errors.push(`${barberName}: HTTP ${response.status} - ${respText.slice(0, 100)}`);
        }
      } catch (err) {
        errors.push(`${barberName}: ${(err as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        found: subscriptions.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
