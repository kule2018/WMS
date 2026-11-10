<template>
  <div>
    <DsCard :title="title">
      <template #extra>
        <span class="ds-muted">{{ subtitle }}</span>
      </template>

      <!-- 预警页的类型切换 -->
      <DsTabs v-if="type === 'warning'" v-model="warnType" :items="warnTabs" variant="pill" class="mb-3" @change="load" />

      <!-- 筛选栏 -->
      <div class="ds-filter">
        <template v-if="isOrder">
          <div class="ds-filter-item"><span>单据号</span><DsInput v-model="q.orderNo" placeholder="请输入单据号" size="sm" style="width:170px" @keyup.enter="load" /></div>
          <div class="ds-filter-item"><span>单据状态</span><DsSelect v-model="q.status" :options="orderStatusOptions" size="sm" style="width:120px" placeholder="全部状态" /></div>
        </template>
        <div v-if="type === 'stock' || type === 'log' || isOrder" class="ds-filter-item">
          <span>仓库</span><DsSelect v-model="q.warehouseId" :options="warehouseOptions" size="sm" style="width:150px" placeholder="全部仓库" />
        </div>
        <div v-if="type === 'stock' || type === 'log' || isOrder" class="ds-filter-item">
          <span>商品</span><DsSelect v-model="q.goodsId" :options="goodsOptions" size="sm" style="width:170px" placeholder="全部商品" />
        </div>
        <div v-if="type === 'stock'" class="ds-filter-item"><span>库位编码</span><DsInput v-model="q.locationCode" placeholder="请输入库位编码" size="sm" style="width:140px" /></div>
        <div v-if="type === 'stock'" class="ds-filter-item"><span>批次号</span><DsInput v-model="q.batchNo" placeholder="请输入批次号" size="sm" style="width:140px" /></div>
        <div v-if="type === 'stock'" class="ds-filter-item">
          <label class="flex items-center gap-1 cursor-pointer"><input v-model="q.showZero" type="checkbox" />显示零库存</label>
        </div>
        <div v-if="type === 'log'" class="ds-filter-item"><span>关联单号</span><DsInput v-model="q.bizNo" placeholder="请输入单号" size="sm" style="width:170px" /></div>
        <template v-if="type === 'warning'">
          <div class="ds-filter-item"><span>预警类型</span><DsSelect v-model="q.warnType" :options="warnTypeOptions" size="sm" style="width:130px" placeholder="全部" /></div>
          <div class="ds-filter-item"><span>商品</span><DsInput v-model="q.keyword" placeholder="编码 / 名称" size="sm" style="width:160px" /></div>
        </template>
        <div v-if="type === 'adjust'" class="ds-filter-item"><span>调整类型</span><DsSelect v-model="q.adjustType" :options="adjustTypeOptions" size="sm" style="width:120px" placeholder="全部类型" /></div>
        <template v-if="isOrder">
          <div class="ds-filter-item"><span>创建时间</span><DsDatePicker v-model="q.dateFrom" type="date" placeholder="开始日期" style="width:150px" /><span>至</span><DsDatePicker v-model="q.dateTo" type="date" placeholder="结束日期" style="width:150px" /></div>
        </template>
        <DsButton variant="primary" size="sm" @click="page = 1; load()"><IconFont name="Search" :size="14" />查询</DsButton>
        <DsButton size="sm" @click="reset"><IconFont name="Refresh" :size="14" />重置</DsButton>
        <DsButton size="sm" @click="exportCsv"><IconFont name="Download" :size="14" />导出</DsButton>
      </div>

      <div class="ds-toolbar">
        <DsButton v-if="isOrder" variant="primary" size="sm" @click="openForm"><IconFont name="Plus" :size="14" />{{ newLabel }}</DsButton>
        <span v-if="type === 'stock'" class="text-sm">在库 <b>{{ sum.onhand ?? 0 }}</b> · 冻结 <b>{{ sum.frozen ?? 0 }}</b> · 可用 <b style="color:var(--ds-brand)">{{ sum.available ?? 0 }}</b> · SKU <b>{{ sum.skus ?? 0 }}</b></span>
      </div>

      <DsTable :columns="columns" :data="pagedRows" :loading="loading" row-key="id" striped clickable>
        <template #status="{ row }"><DsTag :color="orderStatusColor(row.status)" size="sm">{{ orderStatusLabel(row.status) }}</DsTag></template>
        <template #available_qty="{ row }"><b :style="{ color: Number(row.available_qty) <= 0 ? '#e55353' : '#2ba471' }">{{ row.available_qty }}</b></template>
        <template #level="{ row }"><DsTag :color="row.level === '严重' ? 'danger' : 'warning'" size="sm">{{ warnLabel }}</DsTag></template>
        <template #change_qty="{ row }"><span :style="{ color: Number(row.change_qty) >= 0 ? '#2ba471' : '#e55353' }">{{ row.change_qty }}</span></template>
        <template #action="{ row }">
          <div class="flex gap-1">
            <DsButton variant="text" size="sm" @click="openDetail(row)">详情</DsButton>
            <DsButton v-if="type === 'stock'" variant="text" size="sm" @click="showFlow(row)">流水</DsButton>
          </div>
        </template>
      </DsTable>
      <div class="flex justify-end mt-3">
        <DsPagination v-model:current-page="page" v-model:page-size="size" :total="totalRows" @change="onPageChange" />
      </div>
    </DsCard>

    <!-- 新建库存作业单 -->
    <DsModal v-model="formVisible" :title="newLabel" :width="640" :resizable="false">
      <div class="grid grid-cols-2 gap-x-4">
        <div v-for="f in formFields" :key="f.key" class="mb-3" :class="f.span === 2 ? 'col-span-2' : ''">
          <label class="ds-field-label">{{ f.label }}<em v-if="f.required">*</em></label>
          <DsSelect v-if="f.type === 'select'" v-model="opForm[f.key]" :options="f.options" placeholder="请选择" style="width:100%" />
          <DsInput v-else v-model="opForm[f.key]" :type="f.inputType || 'text'" :placeholder="`请输入${f.label}`" style="width:100%" />
        </div>
      </div>
      <DsAlert
        v-if="type === 'freeze'" type="warning" class="mt-1"
        description="冻结操作仅改变可用量，不会减少在库数量；冻结货不可出库，需解冻后才可恢复。"
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <DsButton @click="formVisible = false">取消</DsButton>
          <DsButton variant="primary" :loading="saving" @click="save">确认{{ type === 'freeze' ? '冻结' : '提交' }}</DsButton>
        </div>
      </template>
    </DsModal>

    <!-- 作业单详情 -->
    <DsModal v-model="detailVisible" :title="type === 'stock' ? '库存详情' : '单据详情'" :width="640" :resizable="false">
      <table class="ds-detail-table" v-if="detail.order">
        <tbody>
          <tr v-for="d in detailRows" :key="d.label"><th>{{ d.label }}</th><td>{{ d.value }}</td></tr>
        </tbody>
      </table>
      <template #footer><DsButton @click="detailVisible = false">关闭</DsButton></template>
    </DsModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from '@/components';
import http from '@/utils/request';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const type = computed(() => String(route.params.type || 'stock'));
const isOrder = computed(() => ['move', 'adjust', 'freeze'].includes(type.value));
const kind = computed(() => type.value as 'move' | 'adjust' | 'freeze');

const TITLES: Record<string, string> = {
  stock: '实时库存', log: '库存流水', move: '移库管理', adjust: '库存调整',
  warning: '库存预警', freeze: '库存冻结',
};
const SUBTITLES: Record<string, string> = {
  stock: '可用量 = 在库量 − 冻结量', log: '所有库存变动只增不改', move: '库位间调拨，事务同步库存与流水',
  adjust: '盘盈盘亏修正', warning: '对照安全库存上下限与保质期', freeze: '冻结/解冻登记',
};
const title = computed(() => TITLES[type.value] || '库存管理');
const subtitle = computed(() => SUBTITLES[type.value] || '');
const newLabel = computed(() => ({ move: '新增移库单', adjust: '新增调整单', freeze: '登记冻结' } as any)[type.value] || '新增');

const warnTabs = [
  { label: '低库存', value: 'low' }, { label: '超储', value: 'overstock' }, { label: '临期', value: 'expiring' },
];
const levelOptions = [{ label: '全部', value: '' }, { label: '严重', value: '严重' }, { label: '预警', value: '预警' }];
const warnTypeOptions = [
  { label: '全部', value: '' }, { label: '低库存', value: 'low' },
  { label: '超储', value: 'overstock' }, { label: '临期', value: 'expiring' },
];
const adjustTypeOptions = [
  { label: '全部类型', value: '' }, { label: '盘盈', value: 1 }, { label: '盘亏', value: 2 },
];
const orderStatusOptions = [
  { label: '全部状态', value: '' }, { label: '草稿', value: 0 }, { label: '待审核', value: 1 }, { label: '已完成', value: 2 }, { label: '已作废', value: 3 },
];

const columns = computed<any[]>(() => {
  const action = { title: '操作', key: 'action', slot: true, fixed: 'right', width: '120px' };
  if (type.value === 'stock') return [
    { title: '仓库', key: 'warehouse_name', width: '110px' }, { title: '库位编码', key: 'location_code', width: '110px' },
    { title: '商品编码', key: 'goods_code', width: '120px' }, { title: '商品名称', key: 'goods_name', minWidth: '150px' },
    { title: '规格型号', key: 'spec', width: '120px' }, { title: '单位', key: 'unit', width: '70px' },
    { title: '批次号', key: 'batch_no', width: '130px' },
    { title: '在库数量', key: 'onhand_qty', width: '100px' }, { title: '冻结数量', key: 'frozen_qty', width: '100px' },
    { title: '可用数量', key: 'available_qty', slot: true, width: '100px' },
    { title: '失效日期', key: 'expire_at', width: '120px' }, { title: '最后变动', key: 'update_time', width: '160px' }, action,
  ];
  if (type.value === 'log') return [
    { title: '业务类型', key: 'biz_type', width: '110px' }, { title: '关联单号', key: 'biz_no', width: '170px' },
    { title: '仓库', key: 'warehouse_name', width: '110px' }, { title: '库位', key: 'location_code', width: '100px' },
    { title: '商品', key: 'goods_name', minWidth: '150px' }, { title: '批次号', key: 'batch_no', width: '130px' },
    { title: '变动量', key: 'change_qty', slot: true, width: '100px' },
    { title: '变动前', key: 'before_qty', width: '100px' }, { title: '变动后', key: 'after_qty', width: '100px' },
    { title: '操作人', key: 'operator', width: '90px' }, { title: '时间', key: 'create_time', width: '160px' },
  ];
  if (type.value === 'warning') {
    if (warnType.value === 'expiring') return [
      { title: '商品编码', key: 'goods_code' }, { title: '商品名称', key: 'goods_name' },
      { title: '规格型号', key: 'spec' }, { title: '单位', key: 'unit' },
      { title: '库位', key: 'location_code' }, { title: '批次号', key: 'batch_no' },
      { title: '数量', key: 'qty' }, { title: '失效日期', key: 'expire_at' }, { title: '剩余天数', key: 'remain_days' },
    ];
    return [
      { title: '商品编码', key: 'goods_code' }, { title: '商品名称', key: 'goods_name', minWidth: '150px' },
      { title: '分类', key: 'category_name' }, { title: '规格型号', key: 'spec' }, { title: '单位', key: 'unit' },
      { title: '在库合计', key: 'onhand' }, { title: '安全下限', key: 'min_stock' }, { title: '库存上限', key: 'max_stock' },
      { title: '预警类型', key: 'level', slot: true },
      { title: warnType.value === 'overstock' ? '超储量' : '缺口/启动补货量', key: 'gap' },
    ];
  }
  const base: any[] = [
    { title: '单据号', key: 'order_no', minWidth: '170px' }, { title: '仓库', key: 'warehouse_name', width: '120px' },
    { title: type.value === 'move' ? '源库位' : '库位', key: 'location_code', width: '110px' },
  ];
  if (type.value === 'move') base.push({ title: '目标库位', key: 'to_location_code', width: '110px' });
  base.push(
    { title: '商品编码', key: 'goods_code', width: '120px' },
    { title: '商品名称', key: 'goods_name', minWidth: '140px' },
    { title: '批次号', key: 'batch_no', width: '130px' },
    { title: '数量', key: type.value === 'adjust' ? 'diff_qty' : 'qty', width: '100px' },
    ...(type.value === 'adjust' ? [
      { title: '调整类型', key: 'adjust_type_text', width: '100px' },
      { title: '调整原因', key: 'remark', width: '140px' },
    ] : type.value === 'freeze' ? [
      { title: '冻结类型', key: 'action_text', width: '100px' },
      { title: '冻结原因', key: 'remark', width: '140px' },
    ] : []),
    { title: '状态', key: 'status', slot: true, width: '100px' },
    { title: '制单人', key: 'create_by', width: '100px' },
    { title: '创建时间', key: 'create_time', width: '160px' },
    action,
  );
  return base;
});

const q = reactive<any>({ orderNo: '', status: '', warehouseId: '', goodsId: '', locationCode: '', batchNo: '', bizNo: '', warnType: '', keyword: '', showZero: false, adjustType: '', dateFrom: '', dateTo: '' });
const warnType = ref<string | number>('low');
const warnLabel = computed(() => ({ low: '低库存', overstock: '超储', expiring: '临期' } as any)[warnType.value] || '预警');
const rows = ref<any[]>([]);
const sum = ref<any>({});
const total = ref(0);
const page = ref(1);
const size = ref(10);
const loading = ref(false);
const warehouses = ref<any[]>([]);
const goods = ref<any[]>([]);
const locations = ref<any[]>([]);
const stockRows = ref<any[]>([]);
const stockOptions = computed(() => stockRows.value
  .filter((s: any) => (!opForm.warehouseId || Number(s.warehouse_id) === Number(opForm.warehouseId))
    && (!opForm.goodsId || Number(s.goods_id) === Number(opForm.goodsId)))
  .map((s: any) => ({
    label: `${s.location_code} / ${s.batch_no} / ${s.goods_name} / 可用 ${s.available_qty}`,
    value: s.stock_id,
  })));
const warehouseOptions = computed(() => [{ label: '全部仓库', value: '' }, ...warehouses.value.map((w: any) => ({ label: w.name, value: w.id }))]);
const goodsOptions = computed(() => [{ label: '全部商品', value: '' }, ...goods.value.map((g: any) => ({ label: `${g.code} ${g.name}`, value: g.id }))]);
const locationSelect = computed(() => locations.value.map((l: any) => ({ label: `${l.code}${l.warehouse_name ? ' · ' + l.warehouse_name : ''}`, value: l.id })));
const warehouseSelect = computed(() => warehouses.value.map((w: any) => ({ label: w.name, value: w.id })));

const filtered = computed(() => {
  let list = rows.value;
  if (type.value === 'stock') {
    if (!q.showZero) list = list.filter((r) => Number(r.onhand_qty) > 0);
    if (q.locationCode) list = list.filter((r) => String(r.location_code || '').includes(q.locationCode));
    if (q.batchNo) list = list.filter((r) => String(r.batch_no || '').includes(q.batchNo));
  }
  if (type.value === 'warning' && q.keyword) {
    const k = String(q.keyword).toLowerCase();
    list = list.filter((r) => String(r.goods_code || '').toLowerCase().includes(k) || String(r.goods_name || '').toLowerCase().includes(k));
  }
  return list;
});
const totalRows = computed(() => (isOrder.value ? total.value : filtered.value.length));
const pagedRows = computed(() => (isOrder.value ? rows.value : filtered.value.slice((page.value - 1) * size.value, page.value * size.value)));

const formVisible = ref(false);
const saving = ref(false);
const opForm = reactive<any>({});
const detailVisible = ref(false);
const detail = ref<any>({ order: null });

const formFields = computed<any[]>(() => {
  const wh = { key: 'warehouseId', label: '仓库', type: 'select', options: warehouseSelect.value, required: true };
  const gd = { key: 'goodsId', label: '商品', type: 'select', options: goodsOptions.value.filter((o) => o.value !== ''), required: true };
  const loc = { key: 'locationId', label: '库位', type: 'select', options: locationSelect.value, required: true };
  const batch = { key: 'batchNo', label: '批次号' };
  const qty = { key: 'qty', label: '数量', inputType: 'number', required: true };
  if (type.value === 'move') return [
    { key: 'fromLocationId', label: '源库位', type: 'select', options: locationSelect.value, required: true },
    { key: 'toLocationId', label: '目标库位', type: 'select', options: locationSelect.value, required: true },
    gd, batch, qty, { key: 'remark', label: '备注', span: 2 },
  ];
  if (type.value === 'adjust') return [
    wh, loc, gd, batch,
    { key: 'actualQty', label: '调整数量', inputType: 'number', required: true },
    { key: 'type', label: '调整类型', type: 'select', options: [{ label: '盘盈', value: 1 }, { label: '盘亏', value: 2 }], required: true },
    { key: 'reason', label: '调整原因', span: 2 },
  ];
  return [
    wh, gd,
    { key: 'stockId', label: '冻结库存', type: 'select', options: stockOptions.value, required: true },
    qty,
    { key: 'type', label: '冻结类型', type: 'select', options: [{ label: '冻结', value: 1 }, { label: '解冻', value: 2 }], required: true },
    { key: 'reason', label: '冻结原因', span: 2 },
    { key: 'remark', label: '备注', span: 2 },
  ];
});
const detailRows = computed(() => {
  const o = detail.value.order || {};
  const pairs: Record<string, string> = {
    move: 'order_no:单据号|warehouse_name:仓库|location_code:源库位|to_location_code:目标库位|goods_code:商品编码|goods_name:商品名称|batch_no:批次号|qty:移库数量|status:状态|create_by:制单人|create_time:创建时间|remark:备注',
    adjust: 'order_no:单据号|warehouse_name:仓库|location_code:库位|goods_name:商品|batch_no:批次号|real_qty:调整后数量|diff_qty:差异量|adjust_type:调整类型|status:状态|create_by:制单人|create_time:创建时间|remark:备注',
    freeze: 'order_no:单据号|warehouse_name:仓库|location_code:库位|goods_name:商品|batch_no:批次号|qty:数量|action:操作类型|status:状态|create_by:制单人|create_time:创建时间|remark:备注',
    stock: 'warehouse_name:仓库|location_code:库位编码|goods_code:商品编码|goods_name:商品名称|spec:规格型号|unit:单位|batch_no:批次号|onhand_qty:在库数量|frozen_qty:冻结数量|available_qty:可用数量|expire_at:失效日期|update_time:最后变动',
  };
  return (pairs[type.value] || '').split('|').map((s) => {
    const [key, label] = s.split(':');
    let value = o[key];
    if (key === 'status') value = orderStatusLabel(value);
    if (key === 'action') value = Number(value) === 1 ? '冻结' : '解冻';
    if (key === 'adjust_type') value = Number(value) === 1 ? '盘盈' : '盘亏';
    return { label, value: value ?? '-' };
  });
});

function orderStatusLabel(v: any) { return ({ 0: '草稿', 1: '待审核', 2: '已完成', 3: '已作废' } as any)[v] ?? v; }
function orderStatusColor(v: any) { return ({ 0: 'neutral', 1: 'warning', 2: 'success', 3: 'danger' } as any)[v] || 'neutral'; }

async function load() {
  loading.value = true;
  try {
    if (type.value === 'warning' && q.warnType) warnType.value = q.warnType;
    if (type.value === 'stock') {
      const [r, s]: any = await Promise.all([
        http.get('/inventory/realtime', { params: { warehouseId: q.warehouseId || undefined, goodsId: q.goodsId || undefined } }),
        http.get('/inventory/summary', { params: { warehouseId: q.warehouseId || undefined } }),
      ]);
      rows.value = r; sum.value = s; total.value = r.length;
    } else if (type.value === 'log') {
      rows.value = await http.get('/inventory/logs', { params: {
        goodsId: q.goodsId || route.query.goodsId || undefined,
        bizNo: q.bizNo || route.query.bizNo || undefined,
        limit: 500,
      } });
      total.value = rows.value.length;
    } else if (type.value === 'warning') {
      if (warnType.value === 'low') rows.value = await http.get('/inventory/warnings', { params: { warehouseId: q.warehouseId || undefined } });
      else if (warnType.value === 'overstock') rows.value = await http.get('/inventory/warnings/overstock');
      else rows.value = await http.get('/inventory/warnings/expiring', { params: { days: 30 } });
      rows.value = rows.value.map((r: any) => ({ ...r, gap: r.gap ?? Math.max(Number(r.available) - Number(r.max_stock), 0), level: r.level || '预警' }));
      total.value = rows.value.length;
    } else {
      const r: any = await http.get(`/inventory/orders/${kind.value}`, { params: { ...q, page: page.value, size: size.value } });
      rows.value = (r.rows || [])
        .filter((x: any) => !q.adjustType || type.value !== 'adjust' || String(x.adjust_type) === String(q.adjustType))
        .map((x: any) => ({
          ...x,
          action_text: Number(x.action) === 1 ? '冻结' : '解冻',
          adjust_type_text: Number(x.adjust_type) === 1 ? '盘盈' : Number(x.adjust_type) === 2 ? '盘亏' : (x.source === 'CHECK' ? '盘点差异' : '手工调整'),
        }));
      total.value = Number(r.total || 0);
    }
  } finally { loading.value = false; }
}
function reset() {
  Object.assign(q, { orderNo: '', status: '', warehouseId: '', goodsId: '', locationCode: '', batchNo: '', bizNo: '', warnType: '', keyword: '', showZero: false, adjustType: '', dateFrom: '', dateTo: '' });
  page.value = 1; load();
}
function onPageChange() { if (isOrder.value) load(); }
async function loadOptions() {
  const [w, g, l, s]: any = await Promise.all([
    http.get('/basic/warehouse/list'), http.get('/basic/goods/list'), http.get('/basic/location/list'),
    http.get('/inventory/realtime'),
  ]);
  warehouses.value = w; goods.value = g; locations.value = l; stockRows.value = s || [];
}
function openForm() {
  Object.keys(opForm).forEach((k) => delete opForm[k]);
  opForm.type = 1; opForm.qty = 1; opForm.actualQty = 1; opForm.warehouseId = warehouses.value[0]?.id ?? null;
  formVisible.value = true;
}
async function save() {
  const payload: any = { ...opForm };
  if (type.value === 'move' && payload.fromLocationId === payload.toLocationId) { toast.warning('源库位与目标库位不能相同'); return; }
  if (type.value === 'freeze') {
    const s = stockRows.value.find((x: any) => String(x.stock_id) === String(opForm.stockId));
    if (!s || Number(s.warehouse_id) !== Number(opForm.warehouseId) || Number(s.goods_id) !== Number(opForm.goodsId)) {
      toast.warning('请选择与仓库、商品匹配的冻结库存'); return;
    }
    Object.assign(payload, { locationId: s.location_id, goodsId: s.goods_id, batchNo: s.batch_no });
    const max = Number(opForm.type) === 1 ? Number(s.available_qty) : Number(s.frozen_qty);
    if (Number(opForm.qty) > max) {
      toast.warning(`数量超过可${Number(opForm.type) === 1 ? '冻结' : '解冻'}量 ${max}`); return;
    }
  } else if (!payload.goodsId) { toast.warning('请选择商品'); return; }
  saving.value = true;
  try {
    await http.post(`/inventory/${type.value}`, payload);
    toast.success(`${newLabel.value}已提交，库存与流水已同步`);
    formVisible.value = false; loadOptions(); load();
  } finally { saving.value = false; }
}
async function openDetail(row: any) {
  if (type.value === 'stock') { detail.value = { order: { ...row } }; detailVisible.value = true; return; }
  try {
    const r: any = await http.get(`/inventory/orders/${kind.value}/${row.id}`);
    detail.value = r; detailVisible.value = true;
  } catch (e: any) { toast.error(e?.message || '详情加载失败'); }
}
function showFlow(row: any) { router.push({ path: '/inventory/log', query: { goodsId: String(row.goods_id) } }); }
function exportCsv() {
  const cols = columns.value.filter((c) => c.key !== 'action');
  const head = cols.map((c) => c.title).join(',');
  const body = filtered.value.map((r) => cols.map((c) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${title.value}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}

watch(() => route.params.type, () => { page.value = 1; reset(); });
onMounted(async () => { await Promise.all([loadOptions(), load()]); });
</script>

<style scoped>
.ds-field-label { display: block; font-size: 13px; margin-bottom: 6px; color: var(--ds-text-2); }
.ds-field-label em { color: #e55353; font-style: normal; margin-left: 3px; }
.ds-date { border: 1px solid var(--ds-border, #dfe3ea); border-radius: 6px; padding: 4px 8px; font-size: 13px; background: var(--ds-bg-elevated, #fff); }
.ds-detail-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ds-detail-table th, .ds-detail-table td { border: 1px solid var(--ds-border, #e5e8ef); padding: 8px 10px; }
.ds-detail-table th { width: 130px; text-align: right; background: var(--ds-bg-soft, #f7f8fb); color: var(--ds-text-2); }
</style>
