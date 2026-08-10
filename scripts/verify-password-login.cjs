// 验证「邮箱+密码」正常登录闭环：signUp → signInWithPassword
// 直接读项目 .env，不依赖浏览器。目的：确认后台 Email provider
// 的 "Email/Password" 是否开启，以及是否开启邮箱确认（影响测试流程）。
const fs = require('fs');
const path = require('path');
const env = {};
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const { createClient } = require('@supabase/supabase-js');
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.log('NO_ENV'); process.exit(1); }
const supabase = createClient(url, key);
const email = `pwtest-${Date.now()}@outlook.com`;
const password = 'test1234';

(async () => {
  const out = { email };
  const { data: su, error: suErr } = await supabase.auth.signUp({ email, password });
  if (suErr) out.signUp = { ok: false, err: suErr.message };
  else out.signUp = { ok: true, userId: su.user?.id, confirmed: !!su.user?.email_confirmed_at, needsEmailConfirm: (su.user?.identities?.length ?? 1) === 0 };

  const { data: li, error: liErr } = await supabase.auth.signInWithPassword({ email, password });
  if (liErr) out.signIn = { ok: false, err: liErr.message };
  else out.signIn = { ok: true, userId: li.user?.id };

  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
