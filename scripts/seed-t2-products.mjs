// 给 t2（二月兰会员）补起步商品：createProduct → createProductVariants → assign 到 t2 渠道，
// 再从默认渠道摘除（双轨隔离），使商品只出现在 t2。
// 幂等：按 slug 判重，已存在则跳过该商品。
const ADMIN_API = process.env.ADMIN_API || "https://e.joho.cn/admin-api";
const EMAIL = process.env.ADMIN_EMAIL || "superadmin";
const PWD = process.env.ADMIN_PASSWORD || "z123123";
const T2_CHANNEL_TOKEN = process.env.T2_TOKEN || "66ruvnhh34svhckaa2i"; // 仅用于定位 t2 channelId

let tok = null;
async function gql(q, v = {}) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.authorization = "Bearer " + tok;
  const r = await fetch(ADMIN_API, { method: "POST", headers: h, body: JSON.stringify({ query: q, variables: v }) });
  const nt = r.headers.get("vendure-auth-token");
  if (nt) tok = nt;
  const j = await r.json().catch(() => ({}));
  if (j.errors) {
    const msg = JSON.stringify(j.errors).slice(0, 600);
    throw new Error("gql error: " + msg);
  }
  return j.data;
}

const PRODUCTS = [
  { slug: "lanyue-nianjiang-membership", name: "二月兰尊享年卡会员", price: 19900, sku: "LY-NS-199", desc: "全年专属会员权益，含生日礼遇、双倍积分与线下花艺体验课一次。" },
  { slug: "hudielan-potted", name: "蝴蝶兰盆栽礼盒", price: 13800, sku: "LY-HDL-138", desc: "精选复花蝴蝶兰，配手作陶土盆与养护卡，花语「优雅与幸福」。" },
  { slug: "er-yuelan-scent-gift", name: "二月兰香氛礼盒", price: 9900, sku: "LY-XF-99", desc: "春日兰香调香薰蜡烛+扩香石组合，安神静心，会员专享包装。" },
  { slug: "lanhua-care-kit", name: "兰花养护进阶套装", price: 5900, sku: "LY-YH-59", desc: "缓释肥、水苔、喷壶与《兰花四季养护手册》，新手友好。" },
  { slug: "member-notebook-gift", name: "兰语手账本礼盒", price: 8800, sku: "LY-BK-88", desc: "布艺封面手账本 + 复古铜笔，封面压印二月兰插画，适合赠礼。" },
  { slug: "lan-theme-tote", name: "兰花主题帆布托特包", price: 6900, sku: "LY-TT-69", desc: "厚帆布托特，兰草图鉴插画印花，大容量通勤与购物皆宜。" },
];

async function slugExists(slug) {
  const d = await gql(`query Q($s:String){ product(slug:$s){ id } }`, { s: slug });
  return d?.product?.id || null;
}

async function main() {
  await gql(`mutation($u:String!,$p:String!){ login(username:$u password:$p rememberMe:true){ __typename } }`, { u: EMAIL, p: PWD });
  if (!tok) throw new Error("login failed");

  // 定位 t2 与默认渠道 id
  const ch = await gql(`query{ channels(options:{take:100}){ items{ id code token } } }`);
  const t2c = ch.channels.items.find((c) => c.token === T2_CHANNEL_TOKEN);
  const defc = ch.channels.items.find((c) => c.code === "__default_channel__");
  if (!t2c || !defc) throw new Error(`channel not found t2=${!!t2c} default=${!!defc}`);
  console.log(`t2 channel id=${t2c.id} (${t2c.code}) | default id=${defc.id}`);

  const created = [];
  for (const p of PRODUCTS) {
    const existing = await slugExists(p.slug);
    if (existing) {
      console.log(`skip ${p.slug} (exists id=${existing})`);
      // 仍确保挂到 t2
      created.push(existing);
      continue;
    }
    const prod = await gql(`mutation($i:CreateProductInput!){
      createProduct(input:$i){ id slug }
    }`, { i: { enabled: true, translations: [{ languageCode: "zh_Hans", name: p.name, slug: p.slug, description: p.desc }] } });
    const pid = prod.createProduct.id;
    const v = await gql(`mutation M($i:[CreateProductVariantInput!]!){
      createProductVariants(input:$i){ id sku }
    }`, { i: [{
      productId: pid,
      sku: p.sku,
      price: p.price,
      stockOnHand: 100,
      translations: [{ languageCode: "zh_Hans", name: p.name }],
    }] });
    console.log(`created ${p.slug} (product=${pid} variant=${v.createProductVariants[0].sku})`);
    created.push(pid);
  }

  // 全部挂到 t2，再从默认渠道摘除（双轨隔离）：走 cjk-plugin 新增 moveProductsToTenantChannel，
  // 绕过标准 removeProductsFromChannel 的「默认渠道不可摘除」守卫。
  const count = await gql(`mutation M($ids:[ID!]!,$ch:ID!){
    moveProductsToTenantChannel(productIds:$ids channelId:$ch)
  }`, { ids: created, ch: t2c.id });
  console.log(`moved to t2 & removed from default: ${count.moveProductsToTenantChannel}`);

  console.log(`\nDONE. t2(${t2c.code}) 现有商品 ${created.length} 件。`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });