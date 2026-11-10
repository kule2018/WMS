<template>
  <div>
    <DsCard :title="isIn ? '入库单' : '出库单'">
      <div class="ds-filter">
        <div class="ds-filter-item"><span>单据号</span><DsInput v-model="q.orderNo" placeholder="请输入单据号" size="sm" style="width:170px" @keyup.enter="load" /></div>
        <div class="ds-filter-item"><span>{{ isIn ? '入库类型' : '出库类型' }}</span><DsSelect v-model="q.orderType" :options="typeOptions" size="sm" style="width:140px" placeholder="全部类型" /></div>
        <div class="ds-filter-item"><span>单据状态</span><DsSelect v-model="q.status" :options="statusOptions" size="sm" style="width:120px" placeholder="全部状态" /></div>
        <div class="ds-filter-item"><span>仓库</span><DsSelect v-model="q.warehouseId" :options="warehouseOptions" size="sm" style="width:150px" placeholder="全部仓库" /></div>
        <div class="ds-filter-item"><span>{{ isIn ? '供应商' : '客户' }}</span><DsSelect v-model="q.partnerId" :options="partnerOptions" size="sm" style="width:170px" placeholder="全部" /></div>
        <div class="ds-filter-item">
          <span>创建时间</span>
          <DsDatePicker v-model="q.dateFrom" type="date" placeholder="开始日期" style="width:150px" />
          <span>至</span>
          <DsDatePicker v-model="q.dateTo" type="date" placeholder="结束日期" style="width:150px" />
        </div>
        <DsButton variant="primary" size="sm" @click="page = 1; load()"><IconFont name="Search" :size="14" />查询</DsButton>
        <DsButton size="sm" @click="reset"><IconFont name="Refresh" :size="14" />重置</DsButton>
        <DsButton size="sm" @click="exportCsv"><IconFont name="Download" :size="14" />导出</DsButton>
      </div>

      <div class="ds-toolbar">
        <DsButton variant="primary" size="sm" @click="openForm"><IconFont name="Plus" :size="14" />新增{{ isIn ? '入库单' : '出库单' }}</DsButton>
      </div>

      <DsTable :columns="columns" :data="rows" :loading="loading" row-key="id" striped>
        <template #order_type="{ row }"><span>{{ typeLabel(row.order_type) }}</span></template>
        <template #status="{ row }"><DsTag :color="statusColor(row.status)" size="sm">{{ statusLabel(row.status) }}</DsTag></template>
        <template #action="{ row }">
          <div class="flex items-center gap-1 flex-wrap">
            <DsButton variant="text" size="sm" @click="openDetail(row)">明细</DsButton>
            <DsButton variant="text" size="sm" @click="openPrint(row)">打印</DsButton>
            <DsButton v-if="row.status === 0" variant="text" size="sm" @click="editRemark(row)">修改</DsButton>
            <DsButton v-if="row.status === 0" variant="text" size="sm" @click="doRemove(row)">删除</DsButton>
            <DsButton v-if="row.status === 0" variant="text" size="sm" @click="doAction(row, 'submit')">提交</DsButton>
            <DsButton v-if="row.status === 1" variant="text" size="sm" @click="doAction(row, 'audit')">审核</DsButton>
            <DsButton v-if="row.status !== 2" variant="text" size="sm" @click="doCancel(row)">取消</DsButton>
          </div>
        </template>
      </DsTable>
      <div class="flex justify-end mt-3">
        <DsPagination v-model:current-page="page" v-model:page-size="size" :total="total" @change="load" />
      </div>
    </DsCard>

    <!-- 新建单据 -->
    <DsModal v-model="formVisible" :title="`新增${isIn ? '入库单' : '出库单'}`" :width="940" :resizable="false">
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="ds-field-label">{{ isIn ? '入库类型' : '出库类型' }}<em>*</em></label>
          <DsSelect v-model="form.orderType" :options="editTypeOptions" style="width:100%" />
        </div>
        <div>
          <label class="ds-field-label">仓库<em>*</em></label>
          <DsSelect v-model="form.warehouseId" :options="editWarehouseOptions" style="width:100%" />
        </div>
        <div>
          <label class="ds-field-label">{{ isIn ? '供应商' : '客户' }}<em>*</em></label>
          <DsSelect v-model="form.partnerId" :options="editPartnerOptions" style="width:100%" />
        </div>
        <div class="col-span-3">
          <label class="ds-field-label">备注</label>
          <DsInput v-model="form.remark" placeholder="请输入备注" style="width:100%" />
        </div>
      </div>

      <div class="flex items-center justify-between mt-4 mb-2">
        <span class="text-sm font-medium">商品明细</span>
        <DsButton size="sm" @click="addLine"><IconFont name="Plus" :size="14" />添加明细</DsButton>
      </div>
      <table class="ds-line-table">
        <thead>
          <tr>
            <th>商品 *</th><th>{{ isIn ? '上架库位' : '拣货库位' }} *</th><th>批次号</th><th>数量 *</th><th>单价</th>
            <th v-if="isIn">生产日期</th><th v-if="isIn">失效日期</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(l, i) in lines" :key="i">
            <td><DsSelect v-model="l.goodsId" :options="goodsOptions" size="sm" placeholder="选择商品" /></td>
            <td><DsSelect v-model="l.locationId" :options="locationOptions" size="sm" placeholder="选择库位" /></td>
            <td><DsInput v-model="l.batchNo" size="sm" placeholder="DEFAULT" /></td>
            <td><DsInput v-model="l.qty" type="number" size="sm" placeholder="数量" /></td>
            <td><DsInput v-model="l.price" type="number" size="sm" placeholder="单价" /></td>
            <td v-if="isIn"><DsDatePicker v-model="l.productionAt" type="date" placeholder="生产日期" style="width:140px" /></td>
            <td v-if="isIn"><DsDatePicker v-model="l.expireAt" type="date" placeholder="过期日期" style="width:140px" /></td>
            <td><DsButton variant="text" size="sm" @click="lines.splice(i, 1)">移除</DsButton></td>
          </tr>
          <tr v-if="!lines.length"><td :colspan="isIn ? 8 : 6" class="text-center ds-muted py-4">请添加至少一条明细</td></tr>
        </tbody>
      </table>

      <template #footer>
        <div class="flex justify-end gap-2">
          <DsButton @click="formVisible = false">取消</DsButton>
          <DsButton variant="primary" :loading="saving" @click="save">保存草稿</DsButton>
        </div>
      </template>
    </DsModal>

    <!-- 明细 / 打印预览 -->
    <DsModal v-model="detailVisible" :title="printing ? '单据打印预览' : '单据明细'" :width="980" :resizable="false">
      <div class="ds-print" v-if="detail.order">
        <h2>{{ isIn ? '入 库 单' : '出 库 单' }}</h2>
        <div class="flex justify-between text-xs mb-2">
          <span>单号：{{ detail.order.order_no }}</span>
          <span>打印时间：{{ now }}</span>
        </div>
        <table class="mb-3">
          <tbody>
            <tr>
              <th>{{ isIn ? '入库类型' : '出库类型' }}</th><td>{{ typeLabel(detail.order.order_type) }}</td>
              <th>{{ isIn ? '供应商' : '客户' }}</th><td>{{ detail.order.partner_name || '-' }}</td>
              <th>仓库</th><td>{{ detail.order.warehouse_name || '-' }}</td>
            </tr>
            <tr>
              <th>状态</th><td>{{ statusLabel(detail.order.status) }}</td>
              <th>制单人</th><td>{{ detail.order.create_by || '-' }}</td>
              <th>创建时间</th><td>{{ detail.order.create_time || '-' }}</td>
            </tr>
            <tr>
              <th>总数量</th><td>{{ totalQty(detail.items) }}</td>
              <th>备注</th><td colspan="3">{{ detail.order.remark || '自动过账 By 系统，待审核' }}</td>
            </tr>
          </tbody>
        </table>
        <table>
          <thead>
            <tr>
              <th>序号</th><th>商品编码</th><th>商品名称</th><th>规格型号</th><th>单位</th>
              <th>数量</th>
              <th v-if="isIn">单价</th><th v-if="isIn">金额</th>
              <th>批次号</th>
              <th v-if="isIn">生产日期</th><th v-if="isIn">失效日期</th>
              <th>{{ isIn ? '上架库位' : '拣货库位' }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in detail.items" :key="it.id || i">
              <td>{{ i + 1 }}</td><td>{{ it.goods_code }}</td><td>{{ it.goods_name }}</td>
              <td>{{ it.spec || '-' }}</td><td>{{ it.unit || '-' }}</td>
              <td>{{ it.qty }}</td>
              <td v-if="isIn">{{ it.price }}</td>
              <td v-if="isIn">{{ (Number(it.qty) * Number(it.price)).toFixed(2) }}</td>
              <td>{{ it.batch_no }}</td>
              <td v-if="isIn">{{ it.production_at || '-' }}</td>
              <td v-if="isIn">{{ it.expire_at || '-' }}</td>
              <td>{{ it.location_code }}</td>
            </tr>
            <tr v-if="isIn">
              <th colspan="5">合计</th><td>{{ totalQty(detail.items) }}</td><td>-</td>
              <td>{{ totalAmount(detail.items) }}</td><th colspan="4"></th>
            </tr>
            <tr v-else>
              <th colspan="5">合计</th><td>{{ totalQty(detail.items) }}</td><th colspan="2"></th>
            </tr>
          </tbody>
        </table>
        <div class="grid grid-cols-4 gap-4 mt-8 text-xs">
          <span>制单人：____________</span><span>审核人：____________</span>
          <span>仓管员：____________</span><span>{{ isIn ? '送货人' : '提货人' }}：____________</span>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <DsButton @click="detailVisible = false">{{ printing ? '关闭' : '关闭' }}</DsButton>
          <DsButton v-if="printing" variant="primary" @click="doPrint">打印</DsButton>
        </div>
      </template>
    </DsModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { confirm, useToast } from '@/components';
import http from '@/utils/request';

const route = useRoute();
const toast = useToast();
const isIn = computed(() => route.meta.type === 'inbound');
const api = computed(() => (isIn.value ? 'inbound' : 'outbound'));

const TYPE_OPTIONS = computed(() => isIn.value
  ? [{ label: '采购入库', value: 'PURCHASE' }, { label: '调拨入库', value: 'TRANSFER' }, { label: '退货入库', value: 'RETURN' }]
  : [{ label: '销售出库', value: 'SALES' }, { label: '调拨出库', value: 'TRANSFER' }, { label: '退货出库', value: 'RETURN' }]);
const typeOptions = computed(() => [{ label: '全部类型', value: '' }, ...TYPE_OPTIONS.value]);
const editTypeOptions = TYPE_OPTIONS;
const statusOptions = computed(() => [
  { label: '全部状态', value: '' }, { label: '草稿', value: 0 }, { label: '待审核', value: 1 },
  { label: isIn.value ? '已入库' : '已出库', value: 2 }, { label: '已作废', value: 3 },
]);
const warehouseOptions = computed(() => [{ label: '全部仓库', value: '' }, ...warehouses.value.map((w: any) => ({ label: w.name, value: w.id }))]);
const editWarehouseOptions = computed(() => warehouses.value.map((w: any) => ({ label: w.name, value: w.id })));
const partnerOptions = computed(() => [{ label: '全部', value: '' }, ...partners.value.map((p: any) => ({ label: p.name, value: p.id }))]);
const editPartnerOptions = computed(() => partners.value.map((p: any) => ({ label: p.name, value: p.id })));
const goodsOptions = computed(() => goods.value.map((g: any) => ({ label: `${g.code} ${g.name}`, value: g.id })));
const locationOptions = computed(() => locations.value
  .filter((l: any) => !form.warehouseId || Number(l.warehouse_id) === Number(form.warehouseId))
  .map((l: any) => ({ label: l.code, value: l.id })));

const columns = computed(() => [
  { title: '单据号', key: 'order_no', minWidth: '170px' },
  { title: isIn.value ? '入库类型' : '出库类型', key: 'order_type', slot: true, width: '110px' },
  { title: isIn.value ? '供应商' : '客户', key: 'partner_name', minWidth: '150px' },
  { title: '仓库', key: 'warehouse_name', width: '110px' },
  { title: '总数量', key: 'total_qty', width: '90px' },
  { title: '总金额', key: 'total_amount', width: '110px' },
  { title: '状态', key: 'status', slot: true, width: '100px' },
  { title: '制单人', key: 'create_by', width: '90px' },
  { title: '创建时间', key: 'create_time', width: '160px' },
  { title: '操作', key: 'action', slot: true, fixed: 'right', width: '290px' },
]);

const q = reactive<any>({ orderNo: '', orderType: '', status: '', warehouseId: '', partnerId: '', dateFrom: '', dateTo: '' });
const rows = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const loading = ref(false);
const warehouses = ref<any[]>([]);
const partners = ref<any[]>([]);
const goods = ref<any[]>([]);
const locations = ref<any[]>([]);

const formVisible = ref(false);
const saving = ref(false);
const form = reactive<any>({ orderType: '', warehouseId: '', partnerId: '', remark: '' });
const lines = ref<any[]>([]);
const detailVisible = ref(false);
const printing = ref(false);
const detail = ref<any>({ order: null, items: [] });
const now = computed(() => new Date().toLocaleString('zh-CN'));

function typeLabel(v: any) { return TYPE_OPTIONS.value.find((t) => t.value === v)?.label || v || '-'; }
function statusLabel(v: any) { return ({ 0: '草稿', 1: '待审核', 2: isIn.value ? '已入库' : '已出库', 3: '已作废' } as any)[v] ?? v; }
function statusColor(v: any) { return ({ 0: 'neutral', 1: 'warning', 2: 'success', 3: 'danger' } as any)[v] || 'neutral'; }
function locationLabel(id: any) { return locations.value.find((l: any) => String(l.id) === String(id))?.code || '-'; }
function totalQty(items: any[]) { return (items || []).reduce((s, i) => s + Number(i.qty || 0), 0); }
function totalAmount(items: any[]) { return (items || []).reduce((s, i) => s + Number(i.qty || 0) * Number(i.price || 0), 0).toFixed(2); }

async function load() {
  loading.value = true;
  try {
    const r: any = await http.get(`/${api.value}/list`, { params: { ...q, page: page.value, size: size.value } });
    rows.value = r.rows || []; total.value = Number(r.total || 0);
  } finally { loading.value = false; }
}
function reset() {
  Object.assign(q, { orderNo: '', orderType: '', status: '', warehouseId: '', partnerId: '', dateFrom: '', dateTo: '' });
  page.value = 1; load();
}
async function loadOptions() {
  const [w, p, g, l]: any = await Promise.all([
    http.get('/basic/warehouse/list'),
    http.get('/basic/partner/list', { params: { type: isIn.value ? 1 : 2 } }),
    http.get('/basic/goods/list'),
    http.get('/basic/location/list'),
  ]);
  warehouses.value = w; partners.value = p; goods.value = g; locations.value = l;
}
function addLine() { lines.value.push({ goodsId: null, locationId: null, batchNo: '', qty: 1, price: 0, productionAt: '', expireAt: '' }); }
function openForm() {
  Object.assign(form, { orderType: TYPE_OPTIONS.value[0].value, warehouseId: warehouses.value[0]?.id ?? null, partnerId: partners.value[0]?.id ?? null, remark: '' });
  lines.value = []; addLine();
  formVisible.value = true;
}
async function save() {
  if (!form.warehouseId || !form.partnerId) { toast.warning('请选择仓库和往来单位'); return; }
  if (!lines.value.length) { toast.warning('请添加至少一条明细'); return; }
  for (const l of lines.value) {
    if (!l.goodsId || !l.locationId || Number(l.qty) <= 0) { toast.warning('明细的商品、库位、数量必须填写完整'); return; }
  }
  saving.value = true;
  try {
    await http.post(`/${api.value}`, {
      ...form,
      items: lines.value.map((l) => ({
        goodsId: Number(l.goodsId), locationId: Number(l.locationId), batchNo: l.batchNo || 'DEFAULT',
        qty: Number(l.qty), price: Number(l.price || 0),
        productionAt: l.productionAt || null, expireAt: l.expireAt || null,
      })),
    });
    toast.success('草稿单已创建，请人工审核后生效');
    formVisible.value = false;
    load();
  } finally { saving.value = false; }
}
async function doAction(row: any, action: string) {
  if (action === 'audit' && !(await confirm('确认审核过账？库存将同步更新', '审核确认'))) return;
  await http.post(`/${api.value}/${row.id}/${action}`);
  toast.success(action === 'audit' ? '审核成功，库存已同步' : '已提交审核');
  load();
}
async function doCancel(row: any) {
  if (!(await confirm(`确认作废单据 ${row.order_no}？`, '作废确认'))) return;
  await http.delete(`/${api.value}/${row.id}`);
  toast.success('已作废'); load();
}
async function doRemove(row: any) {
  if (!(await confirm(`确认删除草稿 ${row.order_no}？`, '删除确认'))) return;
  await http.delete(`/${api.value}/${row.id}/draft`);
  toast.success('已删除'); load();
}
async function editRemark(row: any) {
  const r: any = await http.get(`/${api.value}/${row.id}`);
  form.orderType = r.order.order_type;
  form.remark = r.order.remark || '';
  await http.put(`/${api.value}/${row.id}`, { remark: form.remark, orderType: form.orderType });
  toast.success('已保存'); load();
}
async function openDetail(row: any) { printing.value = false; detail.value = await http.get(`/${api.value}/${row.id}`); detailVisible.value = true; }
async function openPrint(row: any) { printing.value = true; detail.value = await http.get(`/${api.value}/${row.id}`); detailVisible.value = true; }
function doPrint() { window.print(); }
function exportCsv() {
  const head = '单据号,类型,往来单位,仓库,总数量,总金额,状态,制单人,创建时间';
  const body = rows.value.map((r) => [r.order_no, typeLabel(r.order_type), r.partner_name, r.warehouse_name, r.total_qty, r.total_amount, statusLabel(r.status), r.create_by, r.create_time].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${isIn.value ? '入库单' : '出库单'}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}

// 仓库变更后清空明细中已选库位，避免跨仓选错（图片中库位随仓库级联）
watch(() => form.warehouseId, () => { lines.value.forEach((l) => { l.locationId = null; }); });
watch(() => route.meta.type, () => { reset(); loadOptions(); });
onMounted(async () => { await Promise.all([loadOptions(), load()]); });
</script>

<style scoped>
.ds-field-label { display: block; font-size: 13px; margin-bottom: 6px; color: var(--ds-text-2); }
.ds-field-label em { color: #e55353; font-style: normal; margin-left: 3px; }
.ds-date { border: 1px solid var(--ds-border, #dfe3ea); border-radius: 6px; padding: 4px 8px; font-size: 13px; background: var(--ds-bg-elevated, #fff); }
.ds-line-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ds-line-table th, .ds-line-table td { border: 1px solid var(--ds-border, #e5e8ef); padding: 6px; text-align: left; }
.ds-line-table th { background: var(--ds-bg-soft, #f7f8fb); white-space: nowrap; }
</style>
