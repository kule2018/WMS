<template>
  <div>
    <DsCard :title="conf.title">
      <div class="ds-filter">
        <div class="ds-filter-item"><span>{{ type === 'role' ? '角色名称' : '关键字' }}</span><DsInput v-model="keyword" :placeholder="type === 'role' ? '请输入角色名称' : '请输入名称搜索'" size="sm" style="width:200px" @keyup.enter="load" /></div>
        <DsButton variant="primary" size="sm" @click="load"><IconFont name="Search" :size="14" />查询</DsButton>
        <DsButton size="sm" @click="keyword = ''; load()"><IconFont name="Refresh" :size="14" />重置</DsButton>
        <DsButton size="sm" @click="exportCsv"><IconFont name="Download" :size="14" />导出</DsButton>
      </div>
      <div class="ds-toolbar">
        <DsButton variant="primary" size="sm" @click="openForm()"><IconFont name="Plus" :size="14" />新增</DsButton>
        <DsButton size="sm" :disabled="!selected" @click="openForm(selected)">修改</DsButton>
        <DsButton v-if="type === 'user'" size="sm" :disabled="!selected" @click="toggleStatus(selected)">启用 / 停用</DsButton>
        <DsButton v-if="type === 'user'" size="sm" :disabled="!selected" @click="resetPwd(selected)">重置密码</DsButton>
        <DsButton v-if="type === 'user'" size="sm" :disabled="!selected" @click="openRole(selected)">分配角色</DsButton>
        <DsButton variant="danger" size="sm" :disabled="!selected" @click="remove(selected)">删除</DsButton>
        <span class="flex-1" /><span class="ds-muted">共 {{ filtered.length }} 条</span>
      </div>

      <DsTable :columns="conf.columns" :data="paged" :loading="loading" row-key="id" clickable striped :row-class="rowClass" @row-click="onRowClick">
        <template #status="{ row }"><DsTag :color="Number(row.status) === 1 ? 'success' : 'danger'" size="sm">{{ Number(row.status) === 1 ? '启用' : '停用' }}</DsTag></template>
        <template #menu_type="{ row }"><DsTag size="sm">{{ Number(row.menu_type) === 1 ? '目录' : '菜单' }}</DsTag></template>
        <template #menu_ids="{ row }"><span class="menu-names" :title="menuNames(row.menu_ids)">{{ menuNames(row.menu_ids) }}</span></template>
        <template #action="{ row }">
          <div class="flex gap-1">
            <DsButton variant="text" size="sm" @click="openForm(row)">修改</DsButton>
            <DsButton variant="text" size="sm" @click="remove(row)">删除</DsButton>
          </div>
        </template>
      </DsTable>
      <div class="flex justify-end mt-3">
        <DsPagination v-model:current-page="page" v-model:page-size="size" :total="filtered.length" />
      </div>
    </DsCard>

    <DsModal v-model="formVisible" :title="(form.id ? '修改' : '新增') + conf.title" :width="600" :resizable="false">
      <div class="grid grid-cols-2 gap-x-4">
        <div v-for="f in fields" :key="f.key" class="mb-3" :class="f.span === 2 ? 'col-span-2' : ''">
          <label class="ds-field-label">{{ f.label }}<em v-if="f.required">*</em></label>
          <DsSelect v-if="f.type === 'select'" v-model="form[f.key]" :options="f.options || []" placeholder="请选择" style="width:100%" />
          <div v-else-if="f.type === 'menus'" class="menu-checks">
            <label v-for="m in menus" :key="m.id" class="menu-check-item" :title="m.name">
              <input v-model="form.menuIdList" type="checkbox" :value="m.id" />
              <span>{{ m.name }}</span>
            </label>
          </div>
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

    <DsModal v-model="roleVisible" title="分配角色" :width="420" :resizable="false">
      <label class="ds-field-label">选择角色</label>
      <DsSelect v-model="assignRoleId" :options="roleOptions" placeholder="请选择角色" style="width:100%" />
      <template #footer>
        <div class="flex justify-end gap-2">
          <DsButton @click="roleVisible = false">取消</DsButton>
          <DsButton variant="primary" @click="assignRole">确定</DsButton>
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
const type = computed(() => String(route.params.type || 'user'));

const CONF: Record<string, any> = {
  user: {
    title: '用户管理', url: '/system/user',
    columns: [
      { title: '编号', key: 'id', width: '80px' }, { title: '用户名', key: 'username', width: '130px' },
      { title: '昵称', key: 'nickname', width: '130px' }, { title: '角色', key: 'role_name', width: '150px' },
      { title: '状态', key: 'status', slot: true, width: '100px' },
      { title: '创建时间', key: 'create_time', width: '170px' },
      { title: '操作', key: 'action', slot: true, width: '90px' },
    ],
    fields: [
      { key: 'username', label: '用户名', required: true },
      { key: 'password', label: '初始密码' },
      { key: 'nickname', label: '昵称' },
      { key: 'roleId', label: '角色', type: 'select', dynamic: 'roles' },
    ],
  },
  role: {
    title: '角色管理', url: '/system/role',
    columns: [
      { title: '角色编号', key: 'id', width: '100px' }, { title: '角色名称', key: 'role_name', width: '160px' },
      { title: '角色标识', key: 'role_key', width: '160px' }, { title: '授权菜单', key: 'menu_ids', slot: true, minWidth: '220px' },
      { title: '备注', key: 'remark', minWidth: '160px' },
      { title: '操作', key: 'action', slot: true, fixed: 'right', width: '140px' },
    ],
    fields: [
      { key: 'roleName', label: '角色名称', required: true },
      { key: 'roleKey', label: '角色标识', required: true },
      { key: 'menuIds', label: '授权菜单', type: 'menus', span: 2 },
      { key: 'remark', label: '备注', span: 2 },
    ],
  },
  menu: {
    title: '菜单管理', url: '/system/menu',
    columns: [
      { title: '编号', key: 'id', width: '80px' }, { title: '菜单名称', key: 'name', width: '140px' },
      { title: '路由路径', key: 'path', width: '180px' }, { title: '组件', key: 'component', width: '160px' },
      { title: '类型', key: 'menu_type', slot: true, width: '90px' },
      { title: '排序', key: 'sort', width: '80px' }, { title: '权限标识', key: 'perms', width: '160px' },
    ],
    fields: [
      { key: 'name', label: '菜单名称', required: true },
      { key: 'path', label: '路由路径', required: true },
      { key: 'component', label: '组件名' },
      { key: 'icon', label: '图标' },
      { key: 'parentId', label: '上级菜单', type: 'select', dynamic: 'menus' },
      { key: 'sort', label: '排序', inputType: 'number' },
      { key: 'menuType', label: '类型', type: 'select', options: [{ label: '目录', value: 1 }, { label: '菜单', value: 2 }, { label: '按钮', value: 3 }] },
      { key: 'perms', label: '权限标识', span: 2 },
    ],
  },
};
const conf = computed(() => CONF[type.value] || CONF.user);

const rows = ref<any[]>([]);
const roles = ref<any[]>([]);
const menus = ref<any[]>([]);
const keyword = ref('');
const page = ref(1);
const size = ref(10);
const loading = ref(false);
const saving = ref(false);
const selected = ref<any>(null);
const formVisible = ref(false);
const form = reactive<any>({});
const roleVisible = ref(false);
const assignRoleId = ref<any>(null);
const assignUserId = ref<number | null>(null);

const roleOptions = computed(() => roles.value.map((r: any) => ({ label: r.role_name || r.name, value: r.id })));
const menuOptions = computed(() => [{ label: '顶级菜单', value: 0 }, ...menus.value.map((m: any) => ({ label: m.name, value: m.id }))]);
/** 把角色的 menu_ids（如 "1,2,3"）映射为中文菜单名称，找不到的 ID 回退显示 #ID */
function menuNames(ids: any): string {
  if (!ids) return '—';
  const list = String(ids).split(',').map((s: string) => Number(s.trim())).filter(Boolean);
  if (!list.length) return '—';
  return list.map((id: number) => menus.value.find((m: any) => Number(m.id) === id)?.name || `#${id}`).join('、');
}
const fields = computed(() => conf.value.fields.map((f: any) => f.dynamic === 'roles' ? { ...f, options: roleOptions.value } : f.dynamic === 'menus' ? { ...f, options: menuOptions.value } : f));
const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  if (!k) return rows.value;
  return rows.value.filter((r) => ['username', 'nickname', 'name', 'role_name', 'role_key', 'path'].some((key) => String(r[key] || '').toLowerCase().includes(k)));
});
const paged = computed(() => filtered.value.slice((page.value - 1) * size.value, page.value * size.value));

async function load() {
  loading.value = true;
  try {
    rows.value = await http.get(conf.value.url + '/list');
    if (type.value !== 'user') menus.value = type.value === 'menu' ? rows.value : await http.get('/system/menu/list');
  } finally { loading.value = false; }
}
async function loadRoles() { roles.value = await http.get('/system/role/list'); }
function onRowClick(row: any) { selected.value = row; }
/** 选中行高亮（DsTable 的 rowClass 回调） */
function rowClass(row: any) { return selected.value && Number(row.id) === Number(selected.value.id) ? 'row-active' : ''; }
function openForm(row?: any) {
  Object.keys(form).forEach((k) => delete form[k]);
  if (row) {
    Object.assign(form, {
      id: row.id,
      username: row.username, nickname: row.nickname, roleId: row.role_id,
      roleName: row.role_name, roleKey: row.role_key, menuIds: row.menu_ids,
      menuIdList: row.menu_ids ? String(row.menu_ids).split(',').map((s: string) => Number(s.trim())).filter(Boolean) : [],
      name: row.name, path: row.path, component: row.component, icon: row.icon,
      parentId: row.parent_id, sort: row.sort, menuType: row.menu_type, perms: row.perms,
    });
  } else if (type.value === 'menu') { form.menuType = 2; form.parentId = 0; form.sort = 1; }
  form.menuIdList = form.menuIdList || [];
  formVisible.value = true;
}
async function save() {
  const required = conf.value.fields.filter((f: any) => f.required);
  for (const f of required) {
    if (form[f.key] === undefined || form[f.key] === null || form[f.key] === '') { toast.warning(`请填写${f.label}`); return; }
  }
  if (type.value === 'role') form.menuIds = (form.menuIdList || []).join(',');
  saving.value = true;
  try {
    if (form.id) await http.put(`${conf.value.url}/${form.id}`, form);
    else await http.post(conf.value.url, form);
    toast.success('保存成功');
    formVisible.value = false;
    await Promise.all([load(), loadRoles()]);
  } finally { saving.value = false; }
}
async function remove(row: any) {
  if (!row) return;
  if (type.value === 'user' && Number(row.id) === 1) { toast.warning('不能删除管理员账号'); return; }
  const label = row.username || row.name || row.role_name || '该项';
  if (!(await confirm(`确认删除「${label}」？`, '删除确认'))) return;
  await http.delete(`${conf.value.url}/${row.id}`);
  toast.success('已删除'); load();
}
async function toggleStatus(row: any) {
  if (!row) return;
  await http.put(`/system/user/${row.id}/status`, { status: Number(row.status) === 1 ? 0 : 1 });
  toast.success('状态已更新'); load();
}
async function resetPwd(row: any) {
  if (!row) return;
  if (!(await confirm(`确认将 ${row.username} 的密码重置为 123456？`, '重置密码'))) return;
  await http.put(`/system/user/${row.id}/password`, { password: '123456' });
  toast.success('密码已重置为 123456');
}
function openRole(row: any) {
  if (!row) return;
  assignUserId.value = row.id;
  assignRoleId.value = row.role_id || null;
  roleVisible.value = true;
}
async function assignRole() {
  if (!assignUserId.value || !assignRoleId.value) { toast.warning('请选择角色'); return; }
  await http.put(`/system/user/${assignUserId.value}/roles`, { roleIds: [assignRoleId.value] });
  toast.success('角色已分配');
  roleVisible.value = false; load();
}
function exportCsv() {
  const cols = conf.value.columns.filter((c: any) => c.key !== 'action');
  const head = cols.map((c: any) => c.title).join(',');
  const body = filtered.value.map((r) => cols.map((c: any) => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${conf.value.title}.csv`; a.click();
  URL.revokeObjectURL(a.href);
}

watch(() => route.params.type, () => { keyword.value = ''; selected.value = null; page.value = 1; load(); });
onMounted(async () => { await Promise.all([loadRoles(), load()]); });
</script>

<style scoped>
.ds-field-label { display: block; font-size: 13px; margin-bottom: 6px; color: var(--ds-text-2); }
/* 当前选中行：主色底 + 左侧色条，让"选中的是哪一行"一目了然 */
:deep(.ds-table tbody tr.row-active td) { background: var(--ds-brand-soft); color: var(--ds-text); }
:deep(.ds-table tbody tr.row-active td:first-child) { box-shadow: inset 3px 0 0 var(--ds-brand); }
/* 授权菜单复选框组 */
.menu-checks { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 10px; max-height: 220px; overflow: auto; padding: 10px 12px; border: 1px solid var(--ds-border); border-radius: 6px; }
.menu-check-item { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.menu-names { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
.ds-field-label em { color: #e55353; font-style: normal; margin-left: 3px; }
</style>
