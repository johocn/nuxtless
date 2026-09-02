// 省市区街道四级选择值（高德行政区划下钻）
export interface RegionValue {
  province: string;
  city: string;
  district: string;
  street: string;
}

export const emptyRegion = (): RegionValue => ({
  province: "",
  city: "",
  district: "",
  street: "",
});