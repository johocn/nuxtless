// 创建超级管理员 jiang / z123123，绑定 __super_admin_role__（id=1），与 superadmin 同级全局超管。
const ADMIN_API = "https://e.joho.cn/admin-api";
const TOKEN = "superadmin", PWD = "z123123";
const SUPER_ROLE_ID = "1";
const USERNAME = "jiang";
const PASS = "z123123";

let tok = null;
async function gql(q, v = {}) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.authorization = "Bearer " + tok;
  const r = await fetch(ADMIN_API, { method: "POST", headers: h, body: JSON.stringify({ query: q, variables: v }) });
  const nt = r.headers.get("vendure-auth-token"); if (nt) tok = nt;
  const j = await r.json().catch(() => ({}));
  if (j.errors) throw new Error("gql: " + JSON.stringify(j.errors).slice(0, 600));
  return j.data;
}

async function main() {
  await gql(`mutation($u:String!,$p:String!){ login(username:$u password:$p rememberMe:true){ __typename } }`, { u: TOKEN, p: PWD });
  if (!tok) throw new Error("login failed");

  // 幂等：已存在则只复核角色，不重复创建
  const admins = await gql(`query { administrators(options:{take:200}){ items{ id emailAddress user{ identifier roles{ code } } } } }`);
  const ex = admins.administrators.items.find(a => a.emailAddress === USERNAME || a.user?.identifier === USERNAME);
  if (ex) {
    console.log("jiang 已存在 id=" + ex.id);
    const hasSuper = ex.user?.roles?.some(r => r.code === "__super_admin_role__");
    console.log("已绑定超管角色:", hasSuper);
    if (hasSuper) { console.log("无需操作"); return; }
  }

  const c = await gql(`mutation CreateSuperAdmin($input: CreateAdministratorInput!) {
    createAdministrator(input: $input) {
      id emailAddress firstName lastName
      user { identifier roles { code } }
    }
  }`, { input: {
      firstName: USERNAME,
      lastName: USERNAME,
      emailAddress: USERNAME,
      password: PASS,
      roleIds: [SUPER_ROLE_ID],
  }});
  console.log("\n已创建超管:", JSON.stringify(c.createAdministrator, null, 2));
}
main().then(() => console.log("\nDONE")).catch(e => { console.error("FAIL:", e.message); process.exit(1); });