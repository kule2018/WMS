<template>
  <div>
    <div class="flex gap-3 items-start">
      <DsCard v-if="conf.tree" title="仓库结构" class="w-64 shrink-0" :pad="true">
        <DsTree
          class="mt-2" :data="treeData" filterable default-expand-all
          highlight-current @select="onTreeNode"
        />
      </DsCard>

      <div class="flex-1 min-w-0">
        <DsCard :title="conf.title">
          <div class="ds-filter">
            <template v-if="type === 'warehouse'">
              <div class="ds-filter-item"><span>仓库编码</span><DsInput v-model="codeKeyword" placeholder="请输入仓库编码" size="sm" style="width: 150px" @keyup.enter="load" /></div>
              <div class="ds-filter-item"><span>仓库名称</span><DsInput v-model="nameKeyword" placeholder="请输入仓库名称" size="sm" style="width: 150px" @keyup.enter="load" /></div>
            </template>
            <div v-else class="ds-filter-item">
              <span>编码 / 名称</span>
              <DsInput v-model="keyword" :placeholder="`请输入${conf.title}编码或名称`" size="sm" style="width: 200px" @keyup.enter="load" />
            </div>
            <div v-if="type === 'location'" class="ds-filter-item">
              <span>库区</span>
              <DsSelect v-model="areaId" :options="areaOptions" size="sm" style="width: 160px" placeholder="全部库区" />
            </div>
            <DsButton variant="primary" size="sm" @click="load"><IconFont name="Search" :size="14" />查询</DsButton>
            <DsButton size="sm" @click="reset"><IconFont name="Refresh" :size="14" />重置</DsButton>
          </div>

          <div class="ds-toolbar">
            <DsButton variant="primary" size="sm" @click="openForm()"><IconFont name="Plus" :size="14" />新增</DsButton>
            <DsButton size="sm" :disabled="!selected" @click="openForm(selected)">修改</DsButton>
            <DsButton variant="danger" size="sm" :disabled="!selected" @click="remove(selected)">删除</DsButton>
            <DsButton size="sm" @click="exportCsv"><IconFont name="Download" :size="14" />导出</DsButton>
            <span class="flex-1" />
            <span class="ds-muted">共 {{ filtered.length }} 条</span>
          </div>

          <DsTable
            :columns="conf.columns" :data="paged" row-key="id" clickable striped
            :loading="loading" @row-click="onRowClick"
          >
            <template #status="{ row }">
              <DsTag :color="Number(row.status) === 1 ? 'success' : 'neutral'" size="sm">{{ Number(row.status) === 1 ? '启用' : '停用' }}</DsTag>
            </template>
            <template #type="{ row }">
              <DsTag :color="Number(row.type) === 1 ? 'brand' : 'success'" size="sm">{{ Number(row.type) === 1 ? '供应商' : '客户' }}</DsTag>
            </template>
            <template #action="{ row }">
              <div class="flex gap-1">
                <DsButton variant="text" size="sm" @click="openForm(row)">修改</DsButton>
                <DsButton variant="text" size="sm" @click="remove(row)">删除</DsButton>
              </div>
            </template>
          </DsTable>
          <div class="flex justify-end mt-3">
            <DsPagination v-model:current-page="page" v-model:page-size="size" :total="filtered.length" :page-sizes="[10, 20, 50]" />
          </div>
        </DsCard>

        <!-- 左侧结构树选中节点后，就地管理该节点下的库位 -->
        <DsCard v-if="conf.tree" class="mt-3" :title="selectedNode ? `库位管理 · ${selectedNode.label}` : '库位管理'">
          <template v-if="selectedNode">
            <div class="ds-toolbar">
              <DsButton variant="primary" size="sm" @click="openLocationForm"><IconFont name="Plus" :size="14" />新增库位</DsButton>
              <span class="ds-muted">共 {{ nodeLocations.length }} 个库位</span>
            </div>
            <DsTable :columns="locationColumns" :data="nodeLocations" row-key="id" striped empty-text="该节点下暂无库位">
              <template #status="{ row }"><DsTag :color="Number(row.status) === 1 ? 'success' : 'neutral'" size="sm">{{ Number(row.status) === 1 ? '启用' : '停用' }}</DsTag></template>
              <template #action="{ row }"><DsButton variant="text" size="sm" @click="removeLocation(row)">删除</DsButton></template>
            </DsTable>
          </template>
          <div v-else class="text-center ds-muted py-8">请在左侧选择仓库/库区(管理库位)</div>
        </DsCard>
      </div>
    </div>

    <DsModal v-model="locFormVisible" title="新增库位" :width="480" :resizable="false">
      <div class="mb-3">
        <label class="block text-sm mb-1">仓库<span style="color:#e55353"> *</span></label>
        <DsSelect v-model="locForm.warehouseId" :options="warehouseSelectOptions" placeholder="请选择仓库" style="width:100%" />
      </div>
      <div class="mb-3">
        <label class="block text-sm mb-1">库区<span style="color:#e55353"> *</span></label>
        <DsSelect v-model="locForm.areaId" :options="locAreaOptions" placeholder="请选择库区" style="width:100%" />
      </div>
      <div class="mb-3">
        <label class="block text-sm mb-1">库位编码<span style="color:#e55353"> *</span></label>
        <DsInput v-model="locForm.code" placeholder="如 A-01-03" style="width:100%" />
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <DsButton @click="locFormVisible = false">取消</DsButton>
          <DsButton variant="primary" :loading="savingLoc" @click="saveLocation">保存</DsButton>
        </div>
      </template>
    </DsModal>

    <DsModal v-model="formVisible" :title="(form.id ? '修改' : '新增') + conf.title" :width="640" :resizable="false">
      <div class="grid grid-cols-2 gap-x-4">
        <div v-for="f in conf.fields" :key="f.key" class="mb-3" :class="f.span === 2 ? 'col-span-2' : ''">
          <label class="block text-sm mb-1" style="color: var(--ds-text-2)">
            {{ f.label }}<span v-if="f.required" style="color:#e55353"> *</span>
          </label>
          <DsSelect v-if="f.type === 'select'" v-model="form[f.key]" :options="selectOptions(f)" placeholder="请选择" style="width:100%" />
          <DsInput v-else v-model="form[f.key]" :type="f.inputType || 'text'" :placeholder="`请输入${f.label}`" style="width:100%" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <DsButton @click="formVisible = false">取消</DsButton>
          <DsButton variant="primary" :loading="saving" @click="save">保存</DsButton>
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
const type = computed(() => String(route.params.type || 'warehouse'));

const CONF: Record<string, any> = {
  warehouse: {
    title: '仓库管理', url: '/basic/warehouse', tree: true,
    columns: [
      { title: '仓库编码', key: 'code' }, { title: '仓库名称', key: 'name' },
      { title: '地址', key: 'address' }, { title: '备注', key: 'remark' },
      { title: '状态', key: 'status', slot: true },
      { title: '创建时间', key: 'create_time' },
      { title: '操作', key: 'action', slot: true, fixed: 'right', width: '140px' },
    ],
    fields: [
      { key: 'code', label: '仓库编码', required: true },
      { key: 'name', label: '仓库名称', required: true },
      { key: 'address', label: '地址', span: 2 },
      { key: 'remark', label: '备注', span: 2 },
    ],
  },
  location: {
    title: '库位管理', url: '/basic/location', tree: true,
    columns: [
      { title: '库位编码', key: 'code' }, { title: '仓库', key: 'warehouse_name' },
      { title: '库区', key: 'area_name' }, { title: '状态', key: 'status', slot: true },
    ],
    fields: [
      { key: 'warehouseId', label: '仓库', type: 'select', options: 'warehouses', required: true },
      { key: 'areaId', label: '库区', type: 'select', options: 'areas', required: true },
      { key: 'code', label: '库位编码', required: true },
    ],
  },
  goods: {
    title: '商品档案', url: '/basic/goods',
    columns: [
      { title: '商品编码', key: 'code' }, { title: '商品名称', key: 'name' },
      { title: '分类', key: 'category_name' }, { title: '规格型号', key: 'spec' },
      { title: '单位', key: 'unit' }, { title: '安全库存', key: 'min_stock' },
      { title: '库存上限', key: 'max_stock' }, { title: '保质期(天)', key: 'shelf_days' },
      { title: '状态', key: 'status', slot: true },
    ],
    fields: [
      { key: 'code', label: '商品编码', required: true },
      { key: 'name', label: '商品名称', required: true },
      { key: 'categoryId', label: '商品分类', type: 'select', options: 'categories' },
      { key: 'spec', label: '规格型号' },
      { key: 'unit', label: '单位' },
      { key: 'minStock', label: '安全库存下限', inputType: 'number' },
      { key: 'maxStock', label: '库存上限', inputType: 'number' },
      { key: 'shelfDays', label: '保质期天数', inputType: 'number' },
    ],
  },
  category: {
    title: '商品分类', url: '/basic/category',
    columns: [{ title: '分类名称', key: 'name' }, { title: '上级分类', key: 'parent_id' }],
    fields: [
      { key: 'name', label: '分类名称', required: true },
      { key: 'parentId', label: '上级分类', type: 'select', options: 'categories' },
    ],
  },
  supplier: {
    title: '供应商管理', url: '/basic/partner', partnerType: 1,
    columns: [
      { title: '编码', key: 'code' }, { title: '名称', key: 'name' },
      { title: '类型', key: 'type', slot: true }, { title: '联系人', key: 'contact' },
      { title: '电话', key: 'phone' }, { title: '状态', key: 'status', slot: true },
    ],
    fields: [
      { key: 'code', label: '供应商编码', required: true },
      { key: 'name', label: '供应商名称', required: true },
      { key: 'contact', label: '联系人' }, { key: 'phone', label: '电话' },
    ],
  },
  customer: {
    title: '客户管理', url: '/basic/partner', partnerType: 2,
    columns: [
      { title: '编码', key: 'code' }, { title: '名称', key: 'name' },
      { title: '类型', key: 'type', slot: true }, { title: '联系人', key: 'contact' },
      { title: '电话', key: 'phone' }, { title: '状态', key: 'status', slot: true },
    ],
    fields: [
      { key: 'code', label: '客户编码', required: true },
      { key: 'name', label: '客户名称', required: true },
      { key: 'contact', label: '联系人' }, { key: 'phone', label: '电话' },
    ],
  },
};
const conf = computed(() => CONF[type.value] || CONF.warehouse);

const rows = ref<any[]>([]);
const loading = ref(false);
const keyword = ref('');
const codeKeyword = ref('');
const nameKeyword = ref('');
const areaId = ref<any>(null);
const warehouseId = ref<any>(null);
const treeData = ref<any[]>([]);
const page = ref(1);
const size = ref(10);
const selected = ref<any>(null);
const selectedNode = ref<any>(null);
const locations = ref<any[]>([]);
const formVisible = ref(false);
const saving = ref(false);
const form = reactive<Record<string, any>>({});
const selects = reactive<Record<string, any[]>>({ warehouses: [], areas: [], categories: [] });
const locFormVisible = ref(false);
const savingLoc = ref(false);
const locForm = reactive<any>({ warehouseId: null, areaId: null, code: '' });
const locationColumns = [
  { title: '库位编码', key: 'code' }, { title: '仓库', key: 'warehouse_name' },
  { title: '库区', key: 'area_name' }, { title: '状态', key: 'status', slot: true },
  { title: '操作', key: 'action', slot: true, width: '90px' },
];

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  const ck = codeKeyword.value.trim().toLowerCase();
  const nk = nameKeyword.value.trim().toLowerCase();
  const list = rows.value.filter((r) => {
    if (conf.value.partnerType && Number(r.type) !== conf.value.partnerType) return false;
    if (warehouseId.value && r.warehouse_id && Number(r.warehouse_id) !== Number(warehouseId.value)) return false;
    if (areaId.value && r.area_id && Number(r.area_id) !== Number(areaId.value)) return false;
    if (ck && !String(r.code || '').toLowerCase().includes(ck)) return false;
    if (nk && !String(r.name || '').toLowerCase().includes(nk)) return false;
    if (!k) return true;
    return String(r.code || '').toLowerCase().includes(k) || String(r.name || '').toLowerCase().includes(k);
  });
  return list;
});
const paged = computed(() => filtered.value.slice((page.value - 1) * size.value, page.value * size.value));
const areaOptions = computed(() => [
  { label: '全部库区', value: null },
  ...selects.areas.map((a) => ({ label: a.name, value: a.id })),
]);
const warehouseSelectOptions = computed(() => selects.warehouses.map((w: any) => ({ label: w.name, value: w.id })));
const locAreaOptions = computed(() => selects.areas
  .filter((a: any) => !locForm.warehouseId || Number(a.warehouse_id) === Number(locForm.warehouseId))
  .map((a: any) => ({ label: a.name, value: a.id })));
const nodeLocations = computed(() => {
  const n = selectedNode.value;
  if (!n) return [];
  if (n.type === 'warehouse') return locations.value.filter((l) => Number(l.warehouse_id) === Number(n.rawId));
  if (n.type === 'area') return locations.value.filter((l) => Number(l.area_id) === Number(n.rawId));
  return locations.value.filter((l) => Number(l.id) === Number(n.rawId));
});

function selectOptions(f: any) {
  const src = selects[f.options] || [];
  const list = src.map((x: any) => ({ label: x.name || x.code, value: x.id }));
  return f.required ? list : [{ label: '无', value: null }, ...list];
}

async function loadOptions() {
  const [w, a, c, l]: any = await Promise.all([
    http.get('/basic/warehouse/list'),
    http.get('/basic/area/list'),
    http.get('/basic/category/list'),
    http.get('/basic/location/list'),
  ]);
  selects.warehouses = w; selects.areas = a; selects.categories = c; locations.value = l || [];
}
async function loadTree() {
  try { treeData.value = await http.get('/basic/structure/tree'); } catch { treeData.value = []; }
}
async function load() {
  loading.value = true;
  try {
    const params: any = {};
    if (type.value === 'supplier' || type.value === 'customer') params.type = conf.value.partnerType;
    if (type.value === 'goods' && keyword.value.trim()) params.keyword = keyword.value.trim();
    if (type.value === 'location' && warehouseId.value) params.warehouseId = warehouseId.value;
    rows.value = await http.get(conf.value.url + '/list', { params });
    page.value = 1; selected.value = null;
  } finally { loading.value = false; }
}
function reset() {
  keyword.value = ''; codeKeyword.value = ''; nameKeyword.value = '';
  areaId.value = null; warehouseId.value = null; load();
}
function onRowClick(row: any) { selected.value = row; }
function onTreeNode(node: any) {
  selectedNode.value = node;
  if (node.type === 'warehouse') warehouseId.value = node.rawId;
  else if (node.type === 'area') { warehouseId.value = null; areaId.value = node.rawId; }
  else { warehouseId.value = null; areaId.value = null; }
  load();
}
function openLocationForm() {
  const n = selectedNode.value;
  if (!n) return;
  locForm.warehouseId = n.type === 'warehouse'
    ? n.rawId
    : (locations.value.find((l) => Number(l.area_id) === Number(n.rawId))?.warehouse_id ?? selects.warehouses[0]?.id ?? null);
  locForm.areaId = n.type === 'area' ? n.rawId : null;
  locForm.code = '';
  locFormVisible.value = true;
}
async function saveLocation() {
  if (!locForm.warehouseId || !locForm.areaId || !String(locForm.code || '').trim()) { toast.warning('请填写仓库、库区与库位编码'); return; }
  savingLoc.value = true;
  try {
    await http.post('/basic/location', { ...locForm });
    toast.success('库位已新增');
    locFormVisible.value = false;
    await Promise.all([loadOptions(), loadTree(), load()]);
  } finally { savingLoc.value = false; }
}
async function removeLocation(row: any) {
  if (!(await confirm(`确认删除库位 ${row.code}？`, '删除确认'))) return;
  await http.delete(`/basic/location/${row.id}`);
  toast.success('已删除');
  await Promise.all([loadOptions(), loadTree(), load()]);
}
function openForm(row?: any) {
  Object.keys(form).forEach((k) => delete form[k]);
  if (row) Object.assign(form, row);
  else if (conf.value.partnerType) form.type = conf.value.partnerType;
  if (row?.category_id) form.categoryId = row.category_id;
  if (row?.warehouse_id) form.warehouseId = row.warehouse_id;
  if (row?.area_id) form.areaId = row.area_id;
  formVisible.value = true;
}
async function save() {
  for (const f of conf.value.fields) {
    if (f.required && (form[f.key] === undefined || form[f.key] === null || form[f.key] === '')) {
      toast.warning(`请填写${f.label}`); return;
    }
  }
  const payload: any = { ...form };
  if (conf.value.partnerType) payload.type = conf.value.partnerType;
  saving.value = true;
  try {
    if (form.id) await http.put(`${conf.value.url}/${form.id}`, payload);
    else await http.post(conf.value.url, payload);
    toast.success('保存成功');
    formVisible.value = false;
    load();
  } finally { saving.value = false; }
}
async function remove(row: any) {
  if (!row) return;
  if (!(await confirm(`确认删除「${row.name || row.code}」？`, '删除确认'))) return;
  await http.delete(`${conf.value.url}/${row.id}`);
  toast.success('已删除');
  load();
}
function exportCsv() {
  const cols = conf.value.columns.filter((c: any) => c.key !== 'action');
  const head = cols.map((c: any) => c.title).join(',');
  const body = filtered.value.map((r) => cols.map((c: any) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${conf.value.title}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

watch(() => route.params.type, () => {
  keyword.value = ''; codeKeyword.value = ''; nameKeyword.value = '';
  selectedNode.value = null; load();
});
onMounted(async () => { await Promise.all([loadOptions(), loadTree(), load()]); });
</script>
