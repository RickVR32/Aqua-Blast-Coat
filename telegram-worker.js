// Cloudflare Worker: forwards Coat & Blast quote requests to Telegram.
// Deploy this as-is on workers.dev — no build step needed.
//
// Set these as Worker secrets (dashboard > Settings > Variables > Add secret),
// NOT plain variables, so they never appear in logs or the dashboard after saving:
//   BOT_TOKEN  = the token BotFather gave you
//   CHAT_ID    = your numeric chat id
//
// Reuse across other projects: change TELEGRAM prefix text below, or add a
// second pair of secrets (e.g. BOT_TOKEN_REVRESTORE) and branch on request path.

const ALLOWED_ORIGIN = '*'; // tighten to 'https://<yourusername>.github.io' once your domain is fixed

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }

    try {
      const form = await request.formData();
      const name = (form.get('name') || '').toString().trim();
      const email = (form.get('email') || '').toString().trim();
      const item = (form.get('item') || '').toString().trim();
      const service = (form.get('service') || '').toString().trim();
      const details = (form.get('details') || '').toString().trim();
      const photos = form.getAll('photos').filter((f) => f && f.size > 0);

      if (!name || !email) {
        return new Response(JSON.stringify({ ok: false, error: 'Missing name or email' }), {
          status: 400,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }

      const text =
        `New quote request — Coat & Blast\n\n` +
        `Name: ${name}\n` +
        `Email: ${email}\n` +
        `Item: ${item}\n` +
        `Service: ${service}\n` +
        `Details: ${details || '(none given)'}\n` +
        `Photos attached: ${photos.length}`;

      const sendMessageUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
      const msgRes = await fetch(sendMessageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.CHAT_ID, text }),
      });
      if (!msgRes.ok) {
        const errBody = await msgRes.text();
        return new Response(JSON.stringify({ ok: false, error: 'Telegram message failed', detail: errBody }), {
          status: 502,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }

      // Forward each photo as a document so quality isn't compressed
      for (const file of photos.slice(0, 5)) { // cap at 5 to stay well inside limits
        const tgForm = new FormData();
        tgForm.append('chat_id', env.CHAT_ID);
        tgForm.append('document', file, file.name || 'photo.jpg');
        tgForm.append('caption', `Photo from ${name} (${email})`);
        const sendDocUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`;
        await fetch(sendDocUrl, { method: 'POST', body: tgForm });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }
  },
};
