// tmp/lib/regress-helpers.mjs
export const BASE = process.env.WA_API || 'https://e.joho.cn/admin-api';
export const T2_TOKEN = '66ruvnhh34svhckaa2i';
export const DEFAULT_TOKEN = 'cnx87ezvmjx8nn3bth6c';

export const gql = async (q, vars = {}, headers = {}) => {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const body = await res.json();
  const token = res.headers.get('vendure-auth-token');
  return { body, token };
};

export async function loginAs(username = 'superadmin', password = 'z123123') {
  const r = await gql(`mutation { login(username:"${username}", password:"${password}") {
    ... on CurrentUser { id identifier } ... on InvalidCredentialsError { message } } }`);
  if (!r.token) throw new Error('login failed ' + JSON.stringify(r.body));
  return r.token;
}

export const hAdmin = (auth, channel) => ({
  Authorization: `Bearer ${auth}`,
  ...(channel ? { 'vendure-token': channel } : {}),
});

export class Regress {
  constructor(name) { this.name = name; this.pass = 0; this.fail = 0; this.skips = 0; this.logs = []; }
  ok(name) { this.pass++; this.logs.push(`  [PASS] ${name}`); }
  fail(name, detail) { this.fail++; this.logs.push(`  [FAIL] ${name} :: ${String(detail).slice(0, 200)}`); }
  skip(name) { this.skips++; this.logs.push(`  [SKIP] ${name}`); }
  assert(name, cond, detail = '') { cond ? this.ok(name) : this.fail(name, detail); }
  summary() {
    for (const l of this.logs) console.log(l);
    console.log(`  == ${this.name}: PASS ${this.pass} / FAIL ${this.fail} / SKIP ${this.skips}`);
    return this.fail === 0;
  }
}
