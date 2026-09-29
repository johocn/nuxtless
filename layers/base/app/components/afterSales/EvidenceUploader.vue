<script setup lang="ts">
const props = defineProps<{ max?: number }>();
const urls = defineModel<string[]>({ default: () => [] });

const { t } = useI18n();
const { uploadEvidence } = useAfterSales();

const MAX = props.max ?? 3;

type CellStatus = "compressing" | "uploading" | "done" | "failed";

interface Cell {
  id: number;
  status: CellStatus;
  /** 本地预览（blob / data URL） */
  localSrc: string;
  /** 上传成功后的服务端 URL */
  remoteUrl?: string;
  error?: string;
}

let seed = 0;
const cells = ref<Cell[]>([]);
const controllers = new Map<number, AbortController>();

const reachedMax = computed(() => cells.value.length >= MAX);
const hasPending = computed(() =>
  cells.value.some((c) => c.status === "compressing" || c.status === "uploading"),
);
const hasFailed = computed(() => cells.value.some((c) => c.status === "failed"));

function syncUrls() {
  urls.value = cells.value.filter((c) => c.status === "done" && c.remoteUrl).map((c) => c.remoteUrl!);
}

// ---- 客户端压缩：长边 ≤1280，webp q0.8；仍 >500KB 用 q0.6 重压一次 ----
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), type, quality));

  let blob = (await encode("image/webp", 0.8)) ?? (await encode("image/jpeg", 0.8));
  if (!blob) throw new Error("encode failed");
  if (blob.size > 500 * 1024) {
    const smaller = (await encode("image/webp", 0.6)) ?? (await encode("image/jpeg", 0.6));
    if (smaller) blob = smaller;
  }
  if (blob.size > 500 * 1024) throw new Error(t("messages.afterSales.evidenceTooLarge"));
  return blob;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function runCell(cell: Cell, file: File) {
  const controller = new AbortController();
  controllers.set(cell.id, controller);
  try {
    cell.status = "compressing";
    const blob = await compress(file);
    cell.status = "uploading";
    const dataUrl = await blobToDataUrl(blob);
    const url = await uploadEvidence(dataUrl, controller.signal);
    if (controller.signal.aborted) return;
    if (!url) {
      cell.status = "failed";
      cell.error = t("messages.afterSales.evidenceUploadFailed");
      return;
    }
    cell.remoteUrl = url;
    cell.status = "done";
  } catch (e: any) {
    if (controller.signal.aborted) return;
    cell.status = "failed";
    cell.error = e?.message ?? t("messages.afterSales.evidenceUploadFailed");
  } finally {
    controllers.delete(cell.id);
    syncUrls();
  }
}

/** 并发上限 2 */
async function pump(queue: { cell: Cell; file: File }[]) {
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const job = queue.shift();
      if (!job) return;
      await runCell(job.cell, job.file);
    }
  });
  await Promise.all(workers);
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  const picked = Array.from(input.files ?? []);
  input.value = "";
  if (!picked.length) return;

  const room = MAX - cells.value.length;
  const accepted = picked.slice(0, room);
  if (picked.length > room) {
    useToast().add({ title: t("messages.afterSales.evidenceMax", { n: MAX }), color: "warning" });
  }
  const queue = accepted.map((file) => {
    const cell: Cell = { id: ++seed, status: "compressing", localSrc: URL.createObjectURL(file) };
    cells.value.push(cell);
    return { cell, file };
  });
  await pump(queue);
}

function removeCell(cell: Cell) {
  // 仅移除本地引用，不调后端删除（未引用的 asset 残留属已知取舍）
  cells.value = cells.value.filter((c) => c.id !== cell.id);
  syncUrls();
}

async function retryCell(cell: Cell) {
  const controller = controllers.get(cell.id);
  if (controller) return;
  const res = await fetch(cell.localSrc);
  const blob = await res.blob();
  const file = new File([blob], "retry.webp", { type: blob.type || "image/webp" });
  await runCell(cell, file);
}

defineExpose({ hasPending, hasFailed });

onBeforeUnmount(() => {
  controllers.forEach((c) => c.abort());
  controllers.clear();
  cells.value.forEach((c) => URL.revokeObjectURL(c.localSrc));
});
</script>

<template>
  <div>
    <div class="grid grid-cols-3 gap-3">
      <div
        v-for="cell in cells"
        :key="cell.id"
        class="relative aspect-square overflow-hidden rounded-md border"
        :class="cell.status === 'failed' ? 'border-error' : 'border-neutral-200 dark:border-neutral-800'"
      >
        <img
          :src="cell.status === 'done' && cell.remoteUrl ? cell.remoteUrl : cell.localSrc"
          :alt="t('messages.afterSales.evidence')"
          class="h-full w-full object-cover"
          :class="{ 'opacity-50': cell.status === 'compressing' || cell.status === 'uploading' }"
        />
        <div
          v-if="cell.status === 'compressing' || cell.status === 'uploading'"
          class="absolute inset-0 flex items-center justify-center text-xs text-white"
        >
          <UIcon name="i-lucide-loader-circle" class="animate-spin" />
        </div>
        <button
          v-if="cell.status === 'done'"
          type="button"
          class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-error text-white"
          :aria-label="t('messages.afterSales.removeEvidence')"
          @click="removeCell(cell)"
        >
          ×
        </button>
        <button
          v-if="cell.status === 'failed'"
          type="button"
          class="absolute inset-0 flex items-center justify-center bg-white/70 text-xs text-error dark:bg-neutral-900/70"
          @click="retryCell(cell)"
        >
          {{ t("messages.afterSales.evidenceRetry") }}
        </button>
      </div>

      <label
        v-if="!reachedMax"
        class="flex aspect-square cursor-pointer items-center justify-center rounded-md border border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-700"
      >
        <UIcon name="i-lucide-plus" class="text-xl" />
        <input type="file" accept="image/*" multiple class="hidden" @change="onPick" />
      </label>
    </div>
    <p class="mt-2 text-xs text-neutral-500">
      {{ t("messages.afterSales.evidenceHint", { n: MAX }) }}
    </p>
  </div>
</template>
