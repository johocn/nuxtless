import type { AddressRecord } from "~~/types/address";

/**
 * 前端示例地址池（生产安全，不写任何客户/订单数据）。
 * 结算页配送档案/自提联系块的「地址簿为空」时，展示这些示例配送地址与示例联系方式，
 * 便于演示/测试「切换收货地址」「切换自提联系人」。
 * - sample-del-*：带完整省市+街道的配送地址，供「收货地址」切换。
 * - sample-pk-*：仅收货人+手机号的联系方式，供「自提联系人」切换。
 */
const DELIVERY_SAMPLES: AddressRecord[] = [
  { id: "sample-del-01", defaultShippingAddress: false, fullName: "王小明", phoneNumber: "13800138001", countryCode: "CN", countryName: "中国", province: "广东省", city: "广州市", postalCode: "510000", streetLine1: "天河区 天河路385号 太古汇B座18楼" },
  { id: "sample-del-02", defaultShippingAddress: false, fullName: "李思思", phoneNumber: "13800138002", countryCode: "CN", countryName: "中国", province: "广东省", city: "深圳市", postalCode: "518000", streetLine1: "南山区 科技园南区 讯美科技广场3栋" },
  { id: "sample-del-03", defaultShippingAddress: false, fullName: "张伟", phoneNumber: "13800138003", countryCode: "CN", countryName: "中国", province: "北京市", city: "北京市", postalCode: "100000", streetLine1: "朝阳区 望京东园四区 绿地中心A座1501" },
  { id: "sample-del-04", defaultShippingAddress: false, fullName: "刘芳", phoneNumber: "13800138004", countryCode: "CN", countryName: "中国", province: "上海市", city: "上海市", postalCode: "200000", streetLine1: "浦东新区 世纪大道88号 金茂大厦12楼" },
  { id: "sample-del-05", defaultShippingAddress: false, fullName: "陈杰", phoneNumber: "13800138005", countryCode: "CN", countryName: "中国", province: "浙江省", city: "杭州市", postalCode: "310000", streetLine1: "西湖区 文三路90号 东部软件园2号楼" },
  { id: "sample-del-06", defaultShippingAddress: false, fullName: "赵敏", phoneNumber: "13800138006", countryCode: "CN", countryName: "中国", province: "江苏省", city: "南京市", postalCode: "210000", streetLine1: "鼓楼区 中山路132号 华泰大厦8楼" },
  { id: "sample-del-07", defaultShippingAddress: false, fullName: "孙立", phoneNumber: "13800138007", countryCode: "CN", countryName: "中国", province: "四川省", city: "成都市", postalCode: "610000", streetLine1: "武侯区 天府大道北段1700号 环球中心W2" },
  { id: "sample-del-08", defaultShippingAddress: false, fullName: "周晶晶", phoneNumber: "13800138008", countryCode: "CN", countryName: "中国", province: "湖北省", city: "武汉市", postalCode: "430000", streetLine1: "洪山区 关山大道1号 光谷软件园C6栋" },
  { id: "sample-del-09", defaultShippingAddress: false, fullName: "吴刚", phoneNumber: "13800138009", countryCode: "CN", countryName: "中国", province: "福建省", city: "厦门市", postalCode: "361000", streetLine1: "思明区 湖滨南路57号 金源大厦19楼" },
  { id: "sample-del-10", defaultShippingAddress: false, fullName: "郑晓彤", phoneNumber: "13800138010", countryCode: "CN", countryName: "中国", province: "山东省", city: "青岛市", postalCode: "266000", streetLine1: "市南区 香港中路61号 远洋大厦B座" },
];

const PICKUP_SAMPLES: AddressRecord[] = [
  { id: "sample-pk-01", defaultShippingAddress: false, fullName: "王小明", phoneNumber: "13800138001", countryCode: "CN", countryName: "中国", province: "", city: "", postalCode: "", streetLine1: "" },
  { id: "sample-pk-02", defaultShippingAddress: false, fullName: "李思思", phoneNumber: "13800138002", countryCode: "CN", countryName: "中国", province: "", city: "", postalCode: "", streetLine1: "" },
  { id: "sample-pk-03", defaultShippingAddress: false, fullName: "张伟", phoneNumber: "13800138003", countryCode: "CN", countryName: "中国", province: "", city: "", postalCode: "", streetLine1: "" },
  { id: "sample-pk-04", defaultShippingAddress: false, fullName: "刘芳", phoneNumber: "13800138004", countryCode: "CN", countryName: "中国", province: "", city: "", postalCode: "", streetLine1: "" },
  { id: "sample-pk-05", defaultShippingAddress: false, fullName: "陈杰", phoneNumber: "13800138005", countryCode: "CN", countryName: "中国", province: "", city: "", postalCode: "", streetLine1: "" },
  { id: "sample-pk-06", defaultShippingAddress: false, fullName: "赵敏", phoneNumber: "13800138006", countryCode: "CN", countryName: "中国", province: "", city: "", postalCode: "", streetLine1: "" },
  { id: "sample-pk-07", defaultShippingAddress: false, fullName: "孙立", phoneNumber: "13800138007", countryCode: "CN", countryName: "中国", province: "", city: "", postalCode: "", streetLine1: "" },
  { id: "sample-pk-08", defaultShippingAddress: false, fullName: "周晶晶", phoneNumber: "13800138008", countryCode: "CN", countryName: "中国", province: "", city: "", postalCode: "", streetLine1: "" },
  { id: "sample-pk-09", defaultShippingAddress: false, fullName: "吴刚", phoneNumber: "13800138009", countryCode: "CN", countryName: "中国", province: "", city: "", postalCode: "", streetLine1: "" },
  { id: "sample-pk-10", defaultShippingAddress: false, fullName: "郑晓彤", phoneNumber: "13800138010", countryCode: "CN", countryName: "中国", province: "", city: "", postalCode: "", streetLine1: "" },
];

const FLAG = "sample:";

export function useSampleAddressBook() {
  const isSample = (id: string | null | undefined) => !!id && id.startsWith(FLAG);
  return { deliverySamples: DELIVERY_SAMPLES, pickupSamples: PICKUP_SAMPLES, isSample, FLAG };
}