// 临时：向 graphql.schema.json 的 OrderCustomFields 注入 pickupClaimed/pickupLat/pickupLng（本地 dev-server 为老进程，schema 快照缺失）
import { readFileSync, writeFileSync } from 'node:fs';

const schemaPath = new URL('./graphql.schema.json', import.meta.url);
const data = JSON.parse(readFileSync(schemaPath, 'utf8'));

const cf = data.__schema.types.find((t) => t.name === 'OrderCustomFields');
if (!cf) {
  console.log('OrderCustomFields not found');
  process.exit(1);
}
const scalar = (name) => ({ kind: 'SCALAR', name, ofType: null });
const additions = [
  { name: 'pickupClaimed', type: scalar('Boolean') },
  { name: 'pickupLat', type: scalar('Float') },
  { name: 'pickupLng', type: scalar('Float') },
];
for (const a of additions) {
  if (!cf.fields.some((f) => f.name === a.name)) {
    cf.fields.push({
      name: a.name,
      description: null,
      args: [],
      type: a.type,
      isDeprecated: false,
      deprecationReason: null,
    });
    console.log('added OrderCustomFields.' + a.name);
  }
}
writeFileSync(schemaPath, JSON.stringify(data, null, 2), 'utf8');
console.log('done');

// 注入 SetOrderPickupLocation mutation（若缺失）
const mutationType = data.__schema.types.find((t) => t.name === 'Mutation');
if (mutationType && !mutationType.fields.some((f) => f.name === 'setOrderPickupLocation')) {
  const nonNull = (ofType) => ({ kind: 'NON_NULL', name: null, ofType });
  const idScalar = () => ({ kind: 'SCALAR', name: 'ID', ofType: null });
  const strScalar = () => ({ kind: 'SCALAR', name: 'String', ofType: null });
  mutationType.fields.push({
    name: 'setOrderPickupLocation',
    description: null,
    args: [
      { name: 'pickupLocationId', description: null, type: nonNull(idScalar()), defaultValue: null },
      { name: 'pickupType', description: null, type: nonNull(strScalar()), defaultValue: null },
    ],
    type: { kind: 'OBJECT', name: 'Order', ofType: null },
    isDeprecated: false,
    deprecationReason: null,
  });
  console.log('added Mutation.setOrderPickupLocation');
  writeFileSync(schemaPath, JSON.stringify(data, null, 2), 'utf8');
} else {
  console.log('Mutation.setOrderPickupLocation exists or Mutation not found');
}