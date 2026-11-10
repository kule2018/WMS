<template>
  <div>
    <DsCard title="盘点单">
      <div class="ds-filter">
        <div class="ds-filter-item"><span>盘点单号</span><DsInput v-model="q.orderNo" placeholder="请输入盘点单号" size="sm" style="width:170px" @keyup.enter="load" /></div>
        <div class="ds-filter-item"><span>单据状态</span><DsSelect v-model="q.status" :options="statusOptions" size="sm" style="width:130px" placeholder="全部状态" /></div>
        <div class="ds-filter-item"><span>仓库</span><DsSelect v-model="q.warehouseId" :options="warehouseOptions" size="sm" style="width:150px" placeholder="全部仓库" /></div>
        <div class="ds-filter-item"><span>创建时间</span><DsDatePicker v-model="q.dateFrom" type="date" placeholder="开始日期" style="width:150px" /><span>至</span><DsDatePicker v-model="q.dateTo" type="date" placeholder="结束日期" style="width:150px" /></div>
        <DsButton variant="primary" size="sm" @click="page = 1; load()"><IconFont name="Search" :size="14" />查询</DsButton>
        <DsButton size="sm" @click="reset"><IconFont name="Refresh" :size="14" />重置</DsButton>
        <DsButton size="sm" @click="exportCsv"><IconFont name="Download" :size="14" />导出</DsButton>
      </div>
      <div class="ds-toolbar">
        <DsButton variant="primary" size="sm" @click="openCreate"><IconFont name="Plus" :size="14" />新增盘点单</DsButton>
      </div>

      <DsTable :columns="columns" :data="paged" :loading="loading" row-key="id" striped>
        <template #range="{ row }">{{ row.source === 'FULL' ? '全仓' : '指定仓库' }}</template>
        <template #status="{ row }"><DsTag :color="statusColor(row.status)" size="sm">{{ statusLabel(row.status) }}</DsTag></template>
        <template #action="{ row }"><DsButton variant="text" size="sm" @click="openDetail(row)">详情</DsButton></template>
      </DsTable>
      <div class="flex justify-end mt-3">
        <DsPagination v-model:current-page="page" v-model:page-size="size" :total="filtered.length" />
      </div>
    </DsCard>

    <DsModal v-model="createVisible" title="新增盘点单" :width="480" :resizable="false">
      <div class="mb-3">
        <label class="ds-field-label">盘点仓库<em>*</em></label>
        <DsSelect v-model="createForm.warehouseId" :options="editWarehouseOptions" placeholder="请选择仓库" style="width:100%" />
      </div>
      <div>
        <label class="ds-field-label">备注</label>
        <DsInput v-model="createForm.remark" placeholder="请输入备注" style="width:100%" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <DsButton @click="createVisible = false">取消</DsButton>
          <DsButton variant="primary" :loading="saving" @click="create">保存</DsButton>
        </div>
      </template>
    </DsModal>

    <DsModal v-model="detailVisible" :title="`盘点单详情 ${cur.order_no || ''}`" :width="940" :resizable="false">
      <div class="grid grid-cols-3 gap-3 text-sm mb-3">
        <span>盘点单号：<b>{{ cur.order_no }}</b></span>
        <span>盘点范围：<b>{{ cur.source === 'FULL' ? '全仓' : '指定仓库' }}</b></span>
        <span>状态：<DsTag :color="statusColor(cur.status)" size="sm">{{ statusLabel(cur.status) }}</DsTag></span>
        <span>仓库：<b>{{ cur.warehouse_name || '-' }}</b></span>
        <span>明细条数：<b>{{ items.length }}</b></span>
        <span>制单人：<b>{{ cur.create_by || '-' }}</b></span>
        <span>创建时间：<b>{{ cur.create_time || '-' }}</b></span>
        <span>备注：<b>{{ cur.remark || '-' }}</b></span>
      </div>
      <table class="ds-line-table">
        <thead>
          <tr><th>#</th><th>库位编码</th><th>商品编码</th><th>商品名称</th><th>批次号</th><th>账面数量</th><th>实盘数量</th><th>差异量</th></tr>
        </thead>
        <tbody>
          <tr v-for="(it, i) in items" :key="it.id">
            <td>{{ i + 1 }}</td><td>{{ it.location_code }}</td><td>{{ it.goods_code }}</td>
            <td>{{ it.goods_name }}</td><td>{{ it.batch_no }}</td><td>{{ it.book_qty }}</td>
            <td><DsInput v-model="it.real_qty" type="number" size="sm" :disabled="cur.status === 2" placeholder="未录入" style="width:110px" /></td>
            <td :style="{ color: Number(it.real_qty || it.book_qty) - Number(it.book_qty) === 0 ? 'inherit' : '#e55353' }">
              {{ it.real_qty === null || it.real_qty === '' || it.real_qty === undefined ? 0 : Number(it.real_qty) - Number(it.book_qty) }}
            </td>
          </tr>
          <tr v-if="!items.length"><td colspan="8" class="text-center ds-muted py-4">暂无盘点明细</td></tr>
        </tbody>
      </table>
      <template #footer>
        <div class="flex justify-end gap-2">
          <DsButton @click="detailVisible = false">关闭</DsButton>
          <DsButton v-if="cur.status !== 2" :loading="saving" @click="record">保存录入</DsButton>
          <DsButton v-if="cur.status !== 2" variant="primary" :loading="saving" @click="finish">完成盘点</DsButton>
        </div>
      </template>
    </DsModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { confirm, useToast } from '@/components';
import http from '@/utils/request';

const toast = useToast();
const statusOptions = [
  { label: '全部状态', value: '' }, { label: '全盘', value: 0 }, { label: '盘点中', value: 1 }, { label: '已完成', value: 2 },
];
const columns = [
  { title: '盘点单号', key: 'order_no', minWidth: '180px' },
  { title: '盘点范围', key: 'range', slot: true, width: '110px' },
  { title: '仓库', key: 'warehouse_name', width: '120px' },
  { title: '明细条数', key: 'item_count', width: '100px' },
  { title: '状态', key: 'status', slot: true, width: '100px' },
  { title: '制单人', key: 'create_by', width: '100px' },
  { title: '创建时间', key: 'create_time', width: '170px' },
  { title: '备注', key: 'remark' },
  { title: '操作', key: 'action', slot: true, fixed: 'right', width: '100px' },
];

const q = reactive<any>({ orderNo: '', status: '', warehouseId: '', dateFrom: '', dateTo: '' });
const rows = ref<any[]>([]);
const warehouses = ref<any[]>([]);
const page = ref(1);
const size = ref(10);
const loading = ref(false);
const saving = ref(false);
const createVisible = ref(false);
const detailVisible = ref(false);
const createForm = reactive<any>({ warehouseId: null, remark: '' });
const cur = ref<any>({});
const items = ref<any[]>([]);

const warehouseOptions = computed(() => [{ label: '全部仓库', value: '' }, ...warehouses.value.map((w: any) => ({ label: w.name, value: w.id }))]);
const editWarehouseOptions = computed(() => warehouses.value.map((w: any) => ({ label: w.name, value: w.id })));
const filtered = computed(() => rows.value.filter((r) => {
  if (q.orderNo && !String(r.order_no).includes(q.orderNo)) return false;
  if (q.status !== '' && Number(r.status) !== Number(q.status)) return false;
  if (q.warehouseId && Number(r.warehouse_id) !== Number(q.warehouseId)) return false;
  if (q.dateFrom && String(r.create_time) < q.dateFrom) return false;
  if (q.dateTo && String(r.create_time) > q.dateTo + ' 23:59:59') return false;
  return true;
}));
const paged = computed(() => filtered.value.slice((page.value - 1) * size.value, page.value * size.value));

function statusLabel(v: any) { return ({ 0: '全盘', 1: '盘点中', 2: '已完成' } as any)[v] ?? v; }
function statusColor(v: any) { return ({ 0: 'neutral', 1: 'warning', 2: 'success' } as any)[v] || 'neutral'; }

async function load() {
  loading.value = true;
  try { rows.value = await http.get('/check/list'); } finally { loading.value = false; }
}
async function loadOptions() { warehouses.value = await http.get('/basic/warehouse/list'); }
function reset() { Object.assign(q, { orderNo: '', status: '', warehouseId: '', dateFrom: '', dateTo: '' }); page.value = 1; }
function openCreate() { createForm.warehouseId = warehouses.value[0]?.id ?? null; createForm.remark = ''; createVisible.value = true; }
async function create() {
  if (!createForm.warehouseId) { toast.warning('请选择盘点仓库'); return; }
  saving.value = true;
  try {
    await http.post('/check', createForm);
    toast.success('盘点单已创建，已带出账面库存快照');
    createVisible.value = false; load();
  } finally { saving.value = false; }
}
async function openDetail(row: any) {
  const d: any = await http.get(`/check/${row.id}`);
  cur.value = d.order || {};
  items.value = (d.items || []).map((i: any) => ({ ...i, real_qty: i.real_qty ?? '' }));
  detailVisible.value = true;
}
async function record() {
  const payload = items.value
    .filter((i) => i.real_qty !== '' && i.real_qty !== null && i.real_qty !== undefined)
    .map((i) => ({ id: i.id, realQty: Number(i.real_qty) }));
  if (!payload.length) { toast.warning('请至少录入一条实盘数量'); return; }
  saving.value = true;
  try {
    await http.post(`/check/${cur.value.id}/record`, { items: payload });
    toast.success('实盘数已保存');
    await openDetail({ id: cur.value.id });
  } finally { saving.value = false; }
}
async function finish() {
  if (!(await confirm('确认完成盘点？差异将自动生成调整单并同步库存', '完成盘点'))) return;
  saving.value = true;
  try {
    await recordSilently();
    const r: any = await http.post(`/check/${cur.value.id}/finish`);
    toast.success(`盘点完成，生成 ${r.diffCount || 0} 张差异调整单`);
    detailVisible.value = false; load();
  } finally { saving.value = false; }
}
async function recordSilently() {
  const payload = items.value
    .filter((i) => i.real_qty !== '' && i.real_qty !== null && i.real_qty !== undefined)
    .map((i) => ({ id: i.id, realQty: Number(i.real_qty) }));
  if (payload.length) await http.post(`/check/${cur.value.id}/record`, { items: payload });
}
function exportCsv() {
  const head = '盘点单号,仓库,明细条数,状态,制单人,创建时间,备注';
  const body = filtered.value.map((r) => [r.order_no, r.warehouse_name, r.item_count, statusLabel(r.status), r.create_by, r.create_time, r.remark].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = '盘点单.csv'; a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(async () => { await Promise.all([loadOptions(), load()]); });
</script>

<style scoped>
.ds-field-label { display: block; font-size: 13px; margin-bottom: 6px; color: var(--ds-text-2); }
.ds-field-label em { color: #e55353; font-style: normal; margin-left: 3px; }
.ds-date { border: 1px solid var(--ds-border, #dfe3ea); border-radius: 6px; padding: 4px 8px; font-size: 13px; background: var(--ds-bg-elevated, #fff); }
.ds-line-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ds-line-table th, .ds-line-table td { border: 1px solid var(--ds-border, #e5e8ef); padding: 6px 8px; text-align: left; }
.ds-line-table th { background: var(--ds-bg-soft, #f7f8fb); white-space: nowrap; }
</style>
