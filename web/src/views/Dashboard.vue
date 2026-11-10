<template>
  <div class="space-y-3">
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <DsCard v-for="k in cards" :key="k.label">
        <div class="flex items-center justify-between">
          <div>
            <div class="ds-muted">{{ k.label }}</div>
            <div class="text-2xl font-bold mt-1" :style="{ color: k.color }">{{ k.value }}</div>
          </div>
          <IconFont :name="k.icon" :size="30" :color="k.color" />
        </div>
      </DsCard>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <DsCard title="出入库趋势">
        <template #extra>
          <DsTabs v-model="days" :items="[{ label: '近 7 天', value: 7 }, { label: '近 30 天', value: 30 }]" variant="pill" @change="loadTrend" />
        </template>
        <div ref="trendEl" class="h-64" />
      </DsCard>

      <DsCard title="低库存预警">
        <DsTable :columns="warnColumns" :data="warnings" height="240" empty-text="当前无低库存商品">
          <template #level="{ row }">
            <DsTag :color="row.level === '严重' ? 'danger' : 'warning'" size="sm">{{ row.level }}</DsTag>
          </template>
        </DsTable>
      </DsCard>

      <DsCard title="待办单据">
        <div class="flex gap-10 py-8 justify-center text-center">
          <div v-for="t in todo" :key="t.label">
            <div class="text-3xl font-bold" style="color: var(--ds-brand)">{{ t.value }}</div>
            <div class="ds-muted mt-1">{{ t.label }}</div>
          </div>
        </div>
      </DsCard>

      <DsCard title="库存结构（按仓库）">
        <div ref="structEl" class="h-64" />
      </DsCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import http from '@/utils/request';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const ov = ref<any>({});
const warnings = ref<any[]>([]);
const trendEl = ref<HTMLElement>();
const structEl = ref<HTMLElement>();
const days = ref<number | string>(7);
let trendChart: any = null;
let structChart: any = null;

const cards = computed(() => [
  { label: '在库总量', value: ov.value.inventory?.onhand ?? 0, icon: 'Box', color: 'var(--ds-brand)' },
  { label: '可用库存', value: ov.value.inventory?.available ?? 0, icon: 'CheckCircle', color: '#2ba471' },
  { label: '冻结库存', value: ov.value.inventory?.frozen ?? 0, icon: 'Warning', color: '#e6a23c' },
  { label: '低库存预警', value: ov.value.warningCount ?? 0, icon: 'Bell', color: '#e55353' },
]);
const todo = computed(() => [
  { label: '待审核入库单', value: ov.value.todo?.inbound ?? 0 },
  { label: '待审核出库单', value: ov.value.todo?.outbound ?? 0 },
  { label: '进行中盘点单', value: ov.value.todo?.check ?? 0 },
]);
const warnColumns = [
  { title: '商品', key: 'goods_name', minWidth: '160px' },
  { title: '安全库存', key: 'min_stock', width: '100px' },
  { title: '可用量', key: 'available', width: '90px' },
  { title: '缺口', key: 'gap', width: '80px' },
  { title: '等级', key: 'level', width: '90px', slot: true },
];

async function loadTrend() {
  const rows: any[] = await http.get('/dashboard/trend', { params: { days: Number(days.value) } });
  if (!trendChart) return;
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['入库', '出库'] },
    grid: { left: 45, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: rows.map((x) => String(x.dt).slice(5, 10)) },
    yAxis: { type: 'value' },
    series: [
      { name: '入库', type: 'bar', data: rows.map((x) => Number(x.inbound)), itemStyle: { color: '#4d6bfe' } },
      { name: '出库', type: 'line', smooth: true, data: rows.map((x) => Number(x.outbound)), itemStyle: { color: '#e55353' } },
    ],
  }, true);
}

async function loadStructure() {
  const rows: any[] = await http.get('/inventory/realtime');
  const map = new Map<string, number>();
  rows.forEach((r) => map.set(r.warehouse_name || '未知仓库', (map.get(r.warehouse_name || '未知仓库') || 0) + Number(r.onhand_qty || 0)));
  const data = [...map.entries()].map(([name, value]) => ({ name, value }));
  structChart?.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{ type: 'pie', radius: ['40%', '65%'], data: data.length ? data : [{ name: '暂无', value: 1 }] }],
  }, true);
}

onMounted(async () => {
  trendChart = echarts.init(trendEl.value!);
  structChart = echarts.init(structEl.value!);
  const [o, w]: any = await Promise.all([http.get('/dashboard/overview'), http.get('/inventory/warnings')]);
  ov.value = o; warnings.value = w;
  await Promise.all([loadTrend(), loadStructure()]);
});
</script>
