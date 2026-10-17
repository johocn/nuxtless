<script setup lang="ts">
import { refDebounced } from "@vueuse/core";
import { assetSrc } from "../utils/image";
import { formatCents } from "../utils/format-money";
import { kbFormatDate, kbTypeLabelKey } from "../composables/useKbSearch";

const { t } = useI18n();
const localePath = useTenantLocalePath();
const open = ref(false);
const inputElement = useTemplateRef("inputElement");

watch(open, (isOpen) => {
  if (isOpen) {
    nextTick(() => inputElement.value?.inputRef?.focus());
  }
});

defineShortcuts({
  meta_k: () => (open.value = !open.value),
});

// ---------- 输入与防抖（300ms，≥2 字符才发起搜索） ----------
const term = ref("");
const debouncedTerm = refDebounced(term, 300);
const ready = computed(() => debouncedTerm.value.trim().length >= 2);

// ---------- 两组并行查询：商品组（Top2）+ 知识内容组（Top3） ----------
const products = useKbSearch(
  () => ({ q: debouncedTerm.value.trim(), filter: 'type = "product"', limit: 2 }),
  { key: "kb-modal-products", immediate: false },
);
const knowledge = useKbSearch(
  () => ({ q: debouncedTerm.value.trim(), filter: 'type != "product"', limit: 3 }),
  { key: "kb-modal-knowledge", immediate: false },
);

watch(debouncedTerm, () => {
  if (ready.value) {
    products.execute();
    knowledge.execute();
  }
});

const productHits = computed(() => products.data.value?.hits ?? []);
const knowledgeHits = computed(() => knowledge.data.value?.hits ?? []);
const pending = computed(() => products.pending.value || knowledge.pending.value);
const totalCount = computed(
  () => (products.data.value?.estimatedTotalHits ?? 0) + (knowledge.data.value?.estimatedTotalHits ?? 0),
);
const viewAllTo = computed(
  () => `${localePath("/search")}?q=${encodeURIComponent(debouncedTerm.value.trim())}`,
);

watch([products.error, knowledge.error], ([pe, ke]) => {
  if (pe || ke) console.error(`Search error: ${pe ?? ke}`);
});
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('messages.search.modalTitle')"
    :ui="{ content: 'h-screen sm:h-[32rem]' }"
  >
    <UButton variant="outline" icon="i-lucide-search" size="md" class="h-[36px]! w-[36px]! min-w-0! p-0! justify-center shrink-0" :ui="{ leadingIcon: 'size-[18px]!' }" />

    <template #body>
      <UInput
        ref="inputElement"
        v-model="term"
        icon="i-lucide-search"
        size="lg"
        variant="ghost"
        :placeholder="$t('messages.search.placeholder')"
        class="mb-4 w-full"
        :aria-label="$t('messages.search.modalTitle')"
      />
      <div>
        <p v-if="!ready" class="py-6 text-center text-sm text-(--ui-text-muted)">
          {{ $t("messages.search.inputHint") }}
        </p>

        <p v-else-if="pending" class="py-6 text-center text-sm text-(--ui-text-muted)">
          {{ $t("messages.search.searching") }}
        </p>

        <template v-else>
          <!-- 商品组：缩略图 + 标题（高亮） + 价格 -->
          <section v-if="productHits.length" class="mb-4">
            <h3 class="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
              {{ $t("messages.search.products") }}
            </h3>
            <ul class="grid gap-2" role="listbox">
              <li v-for="item in productHits" :key="item.id" role="option">
                <UButton
                  variant="outline"
                  :to="localePath(`/product/${item.slug}`)"
                  external
                  class="w-full"
                  @click="open = false"
                >
                  <span class="flex w-full min-w-0 items-center gap-3 text-left">
                    <img
                      v-if="item.thumbnail"
                      :src="assetSrc(item.thumbnail, 96)"
                      :alt="item.title"
                      class="size-10 shrink-0 rounded object-cover"
                    />
                    <span class="min-w-0 flex-1 truncate" v-html="item._formatted?.title || item.title"></span>
                    <span v-if="item.price != null" class="shrink-0 text-sm font-medium">
                      {{ formatCents(item.price) }}
                    </span>
                  </span>
                </UButton>
              </li>
            </ul>
          </section>

          <!-- 知识内容组：类型徽标 + 标题（高亮） + 日期 -->
          <section v-if="knowledgeHits.length" class="mb-4">
            <h3 class="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
              {{ $t("messages.search.knowledge") }}
            </h3>
            <ul class="grid gap-2" role="listbox">
              <li v-for="item in knowledgeHits" :key="item.id" role="option">
                <UButton
                  variant="outline"
                  :to="localePath(`/kb/${item.type}/${item.sourceId}`)"
                  class="w-full"
                  @click="open = false"
                >
                  <span class="flex w-full min-w-0 items-center gap-3 text-left">
                    <UBadge color="neutral" variant="soft" class="shrink-0">
                      {{ $t(kbTypeLabelKey(item.type)) }}
                    </UBadge>
                    <span class="min-w-0 flex-1 truncate" v-html="item._formatted?.title || item.title"></span>
                    <span class="shrink-0 text-xs text-(--ui-text-muted)">
                      {{ kbFormatDate(item.updatedAt) }}
                    </span>
                  </span>
                </UButton>
              </li>
            </ul>
          </section>

          <!-- 空态 -->
          <div v-if="!productHits.length && !knowledgeHits.length" role="alert">
            <p class="py-6 text-center text-sm text-(--ui-text-muted)">
              {{ $t("messages.search.empty") }}
            </p>
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center gap-2">
        <UButton
          :label="t('messages.search.viewAll', { count: totalCount })"
          class="flex-1"
          :disabled="totalCount === 0"
          :to="viewAllTo"
          @click="open = false"
        />
        <UButton
          :label="t('messages.shop.close')"
          color="neutral"
          variant="soft"
          class="px-7"
          @click="open = false"
        />
      </div>
    </template>
  </UModal>
</template>

<style lang="css" scoped></style>
