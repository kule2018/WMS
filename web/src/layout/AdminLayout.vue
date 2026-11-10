<template>
  <div class="h-screen flex flex-col" style="background: var(--ds-bg)">
    <header class="h-14 shrink-0 flex items-center gap-5 px-4 text-white" style="background: var(--ds-brand)">
      <div class="flex items-center gap-2 text-lg font-bold shrink-0">
        <IconFont name="Box" :size="22" />智能仓储WMS系统
      </div>
      <nav class="flex-1 flex items-center gap-1 overflow-x-auto">
        <button
          v-for="m in roots" :key="m.id" type="button"
          class="px-3 py-1.5 rounded text-sm flex items-center gap-1.5 whitespace-nowrap transition-colors"
          :class="isActiveRoot(m) ? 'bg-white/25 font-medium' : 'hover:bg-white/15'"
          @click="go(m)"
        >
          <IconFont :name="iconName(m.icon)" :size="15" />{{ m.name }}
        </button>
      </nav>
      <div class="flex items-center gap-3 text-sm shrink-0">
        <span>您好，{{ store.user?.nickname || store.user?.username || 'admin' }}</span>
        <button type="button" class="flex items-center gap-1 text-sm hover:opacity-80" @click="logout">
          <IconFont name="LogOut" :size="15" />退出登录
        </button>
      </div>
    </header>

    <div class="flex flex-1 min-h-0">
      <aside
        v-if="navItems.length" class="w-48 shrink-0 overflow-auto border-r"
        style="background: var(--ds-bg-elevated); border-color: var(--ds-border)"
      >
        <DsMenu :model-value="route.path" :items="navItems" :width="192" @select="onSelect" />
      </aside>
      <main class="flex-1 min-w-0 overflow-auto">
        <div class="ds-page">
          <div class="ds-muted mb-3">首页 / {{ activeRoot?.name || '' }} <span v-if="subMenus.length"> / {{ route.meta.title }}</span></div>
          <router-view />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from '@/store';
import http from '@/utils/request';

const route = useRoute();
const router = useRouter();
const store = useStore();

/** 后端未下发菜单时的兜底（与 sql/wms.sql 的演示菜单一致） */
const FALLBACK = [
  { id: 1, parent_id: 0, name: '首页', path: '/dashboard', icon: 'Home', sort: 1 },
  { id: 2, parent_id: 0, name: '基础数据', path: '/basic', icon: 'Box', sort: 2 },
  { id: 3, parent_id: 2, name: '仓库管理', path: '/basic/warehouse', sort: 1 },
  { id: 4, parent_id: 2, name: '库位管理', path: '/basic/location', sort: 2 },
  { id: 5, parent_id: 2, name: '商品档案', path: '/basic/goods', sort: 3 },
  { id: 6, parent_id: 2, name: '商品分类', path: '/basic/category', sort: 4 },
  { id: 7, parent_id: 2, name: '供应商管理', path: '/basic/supplier', sort: 5 },
  { id: 8, parent_id: 2, name: '客户管理', path: '/basic/customer', sort: 6 },
  { id: 9, parent_id: 0, name: '入库管理', path: '/inbound', icon: 'Download', sort: 3 },
  { id: 10, parent_id: 0, name: '出库管理', path: '/outbound', icon: 'Upload', sort: 4 },
  { id: 11, parent_id: 0, name: '库存管理', path: '/inventory', icon: 'Grid', sort: 5 },
  { id: 12, parent_id: 11, name: '实时库存', path: '/inventory/stock', sort: 1 },
  { id: 13, parent_id: 11, name: '库存流水', path: '/inventory/log', sort: 2 },
  { id: 14, parent_id: 11, name: '移库管理', path: '/inventory/move', sort: 3 },
  { id: 15, parent_id: 11, name: '库存调整', path: '/inventory/adjust', sort: 4 },
  { id: 16, parent_id: 11, name: '库存预警', path: '/inventory/warning', sort: 5 },
  { id: 17, parent_id: 11, name: '库存冻结', path: '/inventory/freeze', sort: 6 },
  { id: 18, parent_id: 0, name: '盘点管理', path: '/check', icon: 'List', sort: 6 },
  { id: 19, parent_id: 0, name: '仓储多Agent', path: '/agent', icon: 'Chat', sort: 7 },
  { id: 20, parent_id: 0, name: '系统管理', path: '/system', icon: 'Setting', sort: 8 },
  { id: 21, parent_id: 20, name: '用户管理', path: '/system/user', sort: 1 },
  { id: 22, parent_id: 20, name: '角色管理', path: '/system/role', sort: 2 },
  { id: 23, parent_id: 20, name: '菜单管理', path: '/system/menu', sort: 3 },
  { id: 26, parent_id: 20, name: '模型配置', path: '/ai-config/model', sort: 4 },
  { id: 27, parent_id: 20, name: 'Prompt 模板', path: '/ai-config/prompt', sort: 5 },
  { id: 28, parent_id: 20, name: 'Function 工具', path: '/ai-config/tool', sort: 6 },
  { id: 29, parent_id: 20, name: 'MCP 服务', path: '/ai-config/mcp', sort: 7 },
  { id: 24, parent_id: 0, name: '工作台', path: '/portal', icon: 'User', sort: 9 },
];

const menus = computed<any[]>(() => (store.menus?.length ? store.menus : FALLBACK));
const roots = computed(() => menus.value.filter((m) => !m.parent_id || Number(m.parent_id) === 0).sort((a, b) => (a.sort || 0) - (b.sort || 0)));
/** 当前顶级菜单：根据路由路径找到对应菜单项，再逐层回溯父级到顶级。
 *  这样即使 AI 配置子菜单挂在「系统管理」下、自身 path 仍是 /ai-config/*，也能正确高亮系统管理。 */
const activeRoot = computed(() => {
  const byId = (id: number) => menus.value.find((m: any) => Number(m.id) === Number(id));
  const hit = menus.value.find((m: any) => route.path === m.path) ||
    menus.value.find((m: any) => route.path.startsWith((m.path || '') + '/'));
  let cur: any = hit;
  while (cur && cur.parent_id && Number(cur.parent_id) !== 0) cur = byId(cur.parent_id);
  const root = cur ? roots.value.find((r: any) => Number(r.id) === Number(cur.id)) : null;
  return root || roots.value[0];
});
const subMenus = computed(() => menus.value
  .filter((m) => String(m.parent_id) === String(activeRoot.value?.id))
  .sort((a, b) => (a.sort || 0) - (b.sort || 0)));
const navItems = computed(() => subMenus.value.map((m) => ({ label: m.name, to: m.path })));

function iconName(n?: string) { return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'Menu'; }
function isActiveRoot(m: any) { return m.id === activeRoot.value?.id; }
function go(m: any) {
  const kids = menus.value.filter((x) => String(x.parent_id) === String(m.id)).sort((a, b) => (a.sort || 0) - (b.sort || 0));
  router.push(kids.length ? kids[0].path : m.path);
}
function onSelect(item: any) { if (item?.to) router.push(item.to); }
async function logout() {
  try { await http.post('/auth/logout'); } catch { /* 忽略网络异常，本地仍退出 */ }
  store.logout();
  router.push('/login');
}
</script>
