/* Full round-trip verification against the live Supabase project.
   anon sign-in -> create trip -> read via get_trip_bundle RPC -> cleanup.
   Mirrors what SupabaseTripRepository does. */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envRaw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) { console.error('MISSING_ENV'); process.exit(1); }

const supabase = createClient(url, anon, { auth: { persistSession: false, detectSessionInUrl: false } });

function fail(obj) { console.log(JSON.stringify(obj, null, 2)); process.exit(0); }

(async () => {
  const out = {};

  // 1) anonymous sign-in (also proves the profiles trigger survives anon users)
  const signin = await supabase.auth.signInAnonymously();
  if (signin.error) return fail({ step: 'anonSignIn', ok: false, error: signin.error.message });
  const userId = signin.data.user.id;
  out.anonSignIn = { ok: true, userId };

  // 2) create a trip owned by this user (insert RLS: owner_id = auth.uid())
  const title = 'verify-' + Date.now();
  const ins = await supabase.from('trips').insert({ owner_id: userId, title }).select('id,title,owner_id').single();
  if (ins.error) return fail({ ...out, step: 'createTrip', ok: false, code: ins.error.code, error: ins.error.message });
  const tripId = ins.data.id;
  out.createTrip = { ok: true, id: tripId, ownerMatches: ins.data.owner_id === userId };

  // 3) read back through the RPC the adapter relies on (proves trigger added owner as member)
  const rpc = await supabase.rpc('get_trip_bundle', { p_trip_id: tripId });
  if (rpc.error) return fail({ ...out, step: 'bundle', ok: false, code: rpc.error.code, error: rpc.error.message });
  const b = rpc.data;
  out.bundle = {
    ok: true,
    tripTitle: b.trip && b.trip.title,
    memberCount: Array.isArray(b.members) ? b.members.length : 'n/a',
    ownerIsMember: Array.isArray(b.members) && b.members.some((m) => m.user_id === userId),
  };

  // 4) cleanup — delete the test trip (cascades members). Orphaned anon auth user stays (harmless).
  const del = await supabase.from('trips').delete().eq('id', tripId);
  out.cleanup = del.error ? { ok: false, error: del.error.message } : { ok: true };

  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})();
