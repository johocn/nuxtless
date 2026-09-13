const fs = require('fs');
const path = require('path');

const GQL_HOST = process.env.GQL_HOST || 'https://www.youshop.cn/shop-api';
const OUT = path.resolve(__dirname, '..', 'graphql.schema.json');

const q = `
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      ...FullType
    }
    directives {
      name
      description
      locations
      args { ...InputValue }
    }
  }
}
fragment FullType on __Type {
  kind
  name
  description
  fields(includeDeprecated: true) {
    name
    description
    args { ...InputValue }
    type { ...TypeRef }
    isDeprecated
    deprecationReason
  }
  inputFields { ...InputValue }
  interfaces { ...TypeRef }
  enumValues(includeDeprecated: true) {
    name
    description
    isDeprecated
    deprecationReason
  }
  possibleTypes { ...TypeRef }
}
fragment InputValue on __InputValue {
  name
  description
  type { ...TypeRef }
  defaultValue
}
fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  }
}
`;

fetch(GQL_HOST, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: q }),
})
  .then((r) => r.json())
  .then((d) => {
    if (d.errors || !d.data) {
      console.error('INTROSPECTION FAILED:', JSON.stringify(d.errors || d, null, 2));
      process.exit(1);
    }
    // graphql-js 16 不支持解析 DIRECTIVE_DEFINITION location（Vendure schema 含此值），
    // 与项目原 schema 文件（9/9 旧版可构建）保持一致：过滤该 location。
    const data = d.data;
    if (data.__schema && Array.isArray(data.__schema.directives)) {
      for (const dir of data.__schema.directives) {
        if (Array.isArray(dir.locations)) {
          dir.locations = dir.locations.filter((l) => l !== 'DIRECTIVE_DEFINITION');
        }
      }
    }
    fs.writeFileSync(OUT, JSON.stringify(data, null, 2));
    console.log(`schema written: ${OUT} (${fs.statSync(OUT).size} bytes)`);
  })
  .catch((e) => {
    console.error('ERR:', e.message);
    process.exit(1);
  });
