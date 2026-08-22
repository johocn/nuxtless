export type ContentBlockType = 'Banner' | 'Recommendation' | 'Notice' | 'Floor' | 'IconGrid' | 'CategoryNav';

export interface ContentBlock {
    id: string;
    type: ContentBlockType;
    name: string;
    sort: number;
    data: any;
}

export function resolveBlockKind(item: { type: string; data?: any }): ContentBlockType {
    const t: string = item.type ?? '';
    if (['Banner', 'Recommendation', 'Notice', 'Floor', 'IconGrid', 'CategoryNav'].includes(t)) {
        return t as ContentBlockType;
    }
    return 'Floor'; // 未知类型兜底，仍有序渲染
}