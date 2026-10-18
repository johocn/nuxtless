<script setup lang="ts">
import type { StudentVerification } from "~~/layers/base/app/composables/useCoupon";
import {
  getMyStudentVerification,
  applyStudentVerification,
  couponErrorMessage,
} from "~~/layers/base/app/composables/useCoupon";

/**
 * 学生认证页：C 端提交学校/学号/学生证照片 → 后台人工审核（通过/驳回）。
 * 通过后券商城按券模板 studentPrice 展示并按学生价结算；驳回可修改重新提交。
 */
definePageMeta({ title: "messages.studentVerify.title" });

const { t } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());

const loading = ref(true);
const verification = ref<StudentVerification | null>(null);

// 表单（驳回后回填原信息便于修改重提）
const school = ref("");
const studentNo = ref("");
const images = ref<string[]>([]);
const uploaderRef = ref<{ hasPending: boolean; hasFailed: boolean } | null>(null);
const submitting = ref(false);

/** 是否展示表单：无记录或被驳回（重提） */
const showForm = computed(() => {
  const st = verification.value?.status;
  return !st || st === "none" || st === "rejected";
});

async function load() {
  loading.value = true;
  try {
    // 未登录：引导登录（接口需登录态）
    if (!isAuthenticated.value) {
      navigateTo(localePath("/account/login"));
      return;
    }
    verification.value = await getMyStudentVerification();
    // 驳回重提：回填原信息
    if (verification.value?.status === "rejected") {
      school.value = verification.value.school ?? "";
      studentNo.value = verification.value.studentNo ?? "";
      if (verification.value.idImg) images.value = [verification.value.idImg];
    }
  } catch (e) {
    toast.add({ title: t("messages.studentVerify.submitFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function submit() {
  if (submitting.value) return;
  if (!school.value.trim() || !studentNo.value.trim()) {
    toast.add({ title: t("messages.studentVerify.formIncomplete"), color: "warning" });
    return;
  }
  if (uploaderRef.value?.hasPending) {
    toast.add({ title: t("messages.studentVerify.uploadPending"), color: "warning" });
    return;
  }
  if (uploaderRef.value?.hasFailed) {
    toast.add({ title: t("messages.studentVerify.uploadFailed"), color: "warning" });
    return;
  }
  submitting.value = true;
  try {
    verification.value = await applyStudentVerification({
      school: school.value.trim(),
      studentNo: studentNo.value.trim(),
      idImg: images.value[0] ?? null,
    });
    toast.add({ title: t("messages.studentVerify.submitted"), color: "success" });
  } catch (e) {
    toast.add({ title: t("messages.studentVerify.submitFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="mx-auto my-6 w-full max-w-3xl px-3 pb-24">
    <h1 class="mb-3 text-lg font-semibold">{{ t("messages.studentVerify.title") }}</h1>

    <BaseLoader v-if="loading" width="sm:w-xs" />

    <template v-else>
      <!-- 状态卡 -->
      <UCard v-if="verification?.status === 'pending'" class="mb-3">
        <div class="flex items-center gap-3">
          <span class="st-icon pending">⏳</span>
          <div>
            <div class="text-sm font-medium">{{ t("messages.studentVerify.statusPending") }}</div>
          </div>
        </div>
      </UCard>
      <UCard v-else-if="verification?.status === 'approved'" class="mb-3">
        <div class="flex items-center gap-3">
          <span class="st-icon ok">✓</span>
          <div>
            <div class="text-sm font-medium">{{ t("messages.studentVerify.statusApproved") }}</div>
            <div class="mt-0.5 text-xs text-(--ui-text-muted)">{{ t("messages.studentVerify.statusApprovedDesc") }}</div>
          </div>
        </div>
      </UCard>
      <UAlert
        v-else-if="verification?.status === 'rejected'"
        color="error" variant="soft" icon="i-lucide-circle-x" class="mb-3"
        :title="t('messages.studentVerify.statusRejected')"
        :description="t('messages.studentVerify.statusRejectedDesc')"
      />

      <!-- 引导文案 -->
      <p v-if="showForm" class="mb-3 text-sm text-(--ui-text-muted)">
        {{ verification?.status === "rejected" ? t("messages.studentVerify.statusRejectedDesc") : t("messages.studentVerify.statusNone") }}
      </p>

      <!-- 申请表单 -->
      <UCard v-if="showForm">
        <div class="flex flex-col gap-4">
          <UFormField :label="t('messages.studentVerify.school')" required>
            <UInput v-model="school" :placeholder="t('messages.studentVerify.schoolPlaceholder')" class="w-full" maxlength="60" />
          </UFormField>
          <UFormField :label="t('messages.studentVerify.studentNo')" required>
            <UInput v-model="studentNo" :placeholder="t('messages.studentVerify.studentNoPlaceholder')" class="w-full" maxlength="30" />
          </UFormField>
          <UFormField :label="t('messages.studentVerify.idImg')" :hint="t('messages.studentVerify.idImgTip')">
            <AfterSalesEvidenceUploader ref="uploaderRef" v-model="images" :max="1" />
          </UFormField>
          <UButton :loading="submitting" block @click="submit">
            {{ verification?.status === "rejected" ? t("messages.studentVerify.resubmit") : t("messages.studentVerify.submit") }}
          </UButton>
        </div>
      </UCard>
    </template>
  </main>
</template>

<style scoped>
.st-icon { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; flex: none; border-radius: 999px; font-size: 1rem; }
.st-icon.pending { background: color-mix(in srgb, var(--ui-warning) 15%, transparent); }
.st-icon.ok { background: color-mix(in srgb, var(--ui-success) 15%, transparent); color: var(--ui-success); font-weight: 700; }
</style>
