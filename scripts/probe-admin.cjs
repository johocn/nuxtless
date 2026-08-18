const fetch = require("node-fetch");
const ADMIN_API = "https://e.joho.cn/admin-api";
async function gql(query, variables = {}, token = "") {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(ADMIN_API, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { return { http: res.status, raw: text.slice(0, 500) }; }
  const headerToken = res.headers.get("vendure-auth-token");
  if (headerToken && body.data) body.data.__authToken = headerToken;
  return body;
}
(async () => {
  const login = await gql(
    `mutation Login($username: String!, $password: String!) {
      login(username: $username, password: $password) {
        ... on CurrentUser { identifier id }
        ... on InvalidCredentialsError { message }
      }
    }`,
    { username: "superadmin", password: "superadmin" },
  );
  const token = login.data?.__authToken;
  console.log("LOGIN_TOKEN:", token ? "OK" : JSON.stringify(login));
  if (!token) {
    console.log("RAW:", JSON.stringify(login).slice(0, 800));
    return;
  }
  const ch = await gql(`query { activeChannel { id code token defaultLanguageCode } }`, {}, token);
  console.log("CHANNEL:", JSON.stringify(ch));
  const feats = await gql(`query { activeChannel { sellerId } }`, {}, token);
  try {
    const facets = await gql(`query { facets(options:{take:50}){ items { id name } } }`, {}, token);
    console.log("FACETS exists:", !facets.errors);
  } catch {}
})().catch((e) => console.log("ERR:", e.message));