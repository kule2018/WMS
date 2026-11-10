<template>
  <div class="space-y-4">
    <DsCard title="我的工作台" subtitle="库存概览与快捷入口">
      <p class="ds-muted mb-4">用自然语言查询库存、单据与预警，或让 AI 助手代建出入库单草稿。</p>
      <div class="flex flex-wrap gap-2">
        <DsButton variant="primary" @click="$router.push('/agent')"><IconFont name="Chat" :size="15" />打开 AI 助手</DsButton>
        <DsButton @click="$router.push('/inventory/stock')"><IconFont name="Grid" :size="15" />查看实时库存</DsButton>
        <DsButton @click="$router.push('/inventory/warning')"><IconFont name="Warning" :size="15" />库存预警</DsButton>
      </div>
    </DsCard>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <DsCard v-for="c in cards" :key="c.label" :pad="true">
        <div class="ds-muted">{{ c.label }}</div>
        <div class="text-2xl font-bold mt-1" :style="{ color: c.color }">{{ c.value }}</div>
      </DsCard>
    </div>

    <DsCard title="待办与提醒">
      <DsTable :columns="todoColumns" :data="todoRows" empty-text="暂无待办" />
    </DsCard>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import http from '@/utils/request';

const ov = ref<any>({});
const cards = computed(() => [
  { label: '在库总量', value: ov.value.inventory?.onhand ?? 0, color: 'var(--ds-brand)' },
  { label: '可用库存', value: ov.value.inventory?.available ?? 0, color: '#2ba471' },
  { label: '冻结库存', value: ov.value.inventory?.frozen ?? 0, color: '#e6a23c' },
  { label: '低库存预警', value: ov.value.warningCount ?? 0, color: '#e55353' },
]);
const todoColumns = [
  { title: '事项', key: 'label' },
  { title: '数量', key: 'value', width: '100px' },
  { title: '说明', key: 'note' },
];
const todoRows = computed(() => [
  { label: '待审核入库单', value: ov.value.todo?.inbound ?? 0, note: '需在入库管理中人工审核后过账' },
  { label: '待审核出库单', value: ov.value.todo?.outbound ?? 0, note: '需在出库管理中人工审核后扣减库存' },
  { label: '进行中盘点单', value: ov.value.todo?.check ?? 0, note: '录入实盘数并完成后生成差异调整单' },
]);

onMounted(async () => {
  try { ov.value = await http.get('/dashboard/overview'); } catch { /* 拦截器已提示 */ }
});
</script>
