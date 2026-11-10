import { createRouter, createWebHistory } from 'vue-router';

const basic = () => import('@/views/basic/BasicList.vue');
const order = () => import('@/views/biz/OrderList.vue');
const inventory = () => import('@/views/biz/Inventory.vue');

/**
 * 路由表覆盖后端 sys_menu 中的全部 path。
 * 可见菜单由 /auth/login 与 /auth/profile 动态下发，前端只做「有哪些页面」的映射。
 */
const routes = [
  { path: '/login', component: () => import('@/views/Login.vue'), meta: { title: '登录' } },
  {
    path: '/', component: () => import('@/layout/AdminLayout.vue'), redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '首页看板', group: '/dashboard' } },
      { path: 'portal', component: () => import('@/views/portal/Portal.vue'), meta: { title: '工作台', group: '/portal' } },
      { path: 'basic/:type', component: basic, meta: { title: '基础数据', group: '/basic' } },
      { path: 'inbound', component: order, meta: { title: '入库管理', group: '/inbound', type: 'inbound' } },
      { path: 'outbound', component: order, meta: { title: '出库管理', group: '/outbound', type: 'outbound' } },
      { path: 'inventory/:type', component: inventory, meta: { title: '库存管理', group: '/inventory' } },
      { path: 'check', component: () => import('@/views/biz/Check.vue'), meta: { title: '盘点管理', group: '/check' } },
      { path: 'agent', component: () => import('@/views/agent/AgentChat.vue'), meta: { title: '仓储多Agent', group: '/agent' } },
      { path: 'system/:type', component: () => import('@/views/system/SystemList.vue'), meta: { title: '系统管理', group: '/system' } },
      { path: 'ai-config/:type', component: () => import('@/views/system/AiConfig.vue'), meta: { title: 'AI 配置', group: '/ai-config' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({ history: createWebHistory(), routes });
router.beforeEach((to) => {
  if (to.path === '/login') return true;
  if (!localStorage.getItem('token')) return '/login';
  return true;
});
export default router;
