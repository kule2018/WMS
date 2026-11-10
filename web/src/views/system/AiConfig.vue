<template>
  <div>
    <DsCard :title="conf.title">
      <template #extra><span class="ds-muted">{{ conf.hint }}</span></template>

      <div class="ds-filter">
        <div class="ds-filter-item"><span>关键字</span><DsInput v-model="keyword" :placeholder="conf.searchHint" size="sm" style="width: 220px" @keyup.enter="load" /></div>
        <DsButton variant="primary" size="sm" @click="load"><IconFont name="Search" :size="14" />查询</DsButton>
        <DsButton size="sm" @click="keyword = ''"><IconFont name="Refresh" :size="14" />重置</DsButton>
      </div>

      <div class="ds-toolbar">
        <DsButton variant="primary" size="sm" @click="openForm()"><IconFont name="Plus" :size="14" />新增</DsButton>
        <span class="flex-1" />
        <span class="ds-muted">共 {{ filtered.length }} 条</span>
      </div>

      <DsTable :columns="conf.columns" :data="paged" :loading="loading" row-key="id" striped>
        <template #enabled="{ row }">
          <DsTag v-if="Number(row.enabled) === 1" color="success" size="sm">启用</DsTag>
          <DsTag v-else color="neutral" size="sm">停用</DsTag>
        </template>
        <template #has_key="{ row }">
          <DsTag v-if="row.has_key" color="success" size="sm">已配置</DsTag>
          <DsTag v-else color="neutral" size="sm">未配置</DsTag>
        </template>
        <template #write_action="{ row }">
          <DsTag v-if="Number(row.write_action) === 1" color="warning" size="sm">写工具</DsTag>
          <DsTag v-else color="neutral" size="sm">只读</DsTag>
        </template>
        <template #status="{ row }">
          <DsTag v-if="row.status === '正常'" color="success" size="sm">正常</DsTag>
          <DsTag v-else color="neutral" size="sm">{{ row.status || '未测试' }}</DsTag>
        </template>
        <template #action="{ row }">
          <div class="flex items-center gap-1 flex-wrap">
            <DsButton variant="text" size="sm" @click="openForm(row)">修改</DsButton>
            <DsButton v-if="conf.testUrl" variant="text" size="sm" @click="testRow(row)">测试</DsButton>
            <DsButton v-if="conf.enabledUrl" variant="text" size="sm" @click="toggleEnabled(row)">
              <template v-if="Number(row.enabled) === 1">停用</template>
              <template v-else>启用</template>
            </DsButton>
            <DsButton variant="text" size="sm" @click="remove(row)">删除</DsButton>
          </div>
        </template>
      </DsTable>

      <div class="flex justify-end mt-3">
        <DsPagination v-model:current-page="page" v-model:page-size="size" :total="filtered.length" :page-sizes="[10, 20, 50]" />
      </div>
    </DsCard>

    <!-- 四类配置各写一段表单，字段与表格列直接对应，避免通过配置对象隐式渲染 -->
    <DsModal v-model="formVisible" :title="formTitle" :width="720" :resizable="false">
      <!-- 模型配置 -->
      <div v-if="type === 'model'" class="grid grid-cols-2 gap-x-4">
        <div class="mb-3"><label class="ds-field-label">配置名称<em>*</em></label><DsInput v-model="form.name" placeholder="如 DeepSeek 官方" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">供应商</label><DsInput v-model="form.provider" placeholder="openai_compatible" style="width:100%" /></div>
        <div class="mb-3 col-span-2"><label class="ds-field-label">接口地址<em>*</em></label><DsInput v-model="form.base_url" placeholder="https://api.deepseek.com/v1" style="width:100%" /></div>
        <div class="mb-3 col-span-2">
          <label class="ds-field-label">API Key（修改时留空表示不更换密钥）</label>
          <DsInput v-model="form.api_key" type="password" placeholder="留空保持原密钥" style="width:100%" />
        </div>
        <div class="mb-3"><label class="ds-field-label">模型名<em>*</em></label><DsInput v-model="form.model" placeholder="deepseek-chat" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">生成温度</label><DsInput v-model="form.temperature" type="number" placeholder="0.10" style="width:100%" /></div>
        <div class="mb-3 col-span-2"><label class="ds-field-label">备注</label><DsInput v-model="form.remark" placeholder="用途说明" style="width:100%" /></div>
        <div class="mb-3 col-span-2">
          <label class="flex items-center gap-2 cursor-pointer text-sm"><input v-model="form.enabled" type="checkbox" />启用该配置（会自动停用其他模型配置）</label>
        </div>
      </div>

      <!-- Prompt 模板 -->
      <div v-else-if="type === 'prompt'" class="grid grid-cols-2 gap-x-4">
        <div class="mb-3"><label class="ds-field-label">模板编码<em>*</em></label><DsInput v-model="form.code" placeholder="main / inventory_expert" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">模板名称<em>*</em></label><DsInput v-model="form.name" placeholder="调度主管提示词" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">使用场景</label><DsSelect v-model="form.scene" :options="sceneOptions" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">占位变量</label><DsInput v-model="form.variables" placeholder="question,warehouse" style="width:100%" /></div>
        <div class="mb-3 col-span-2"><label class="ds-field-label">模板正文<em>*</em></label><DsInput v-model="form.content" type="textarea" :rows="6" placeholder="输入提示词内容" style="width:100%" /></div>
        <div class="mb-3 col-span-2"><label class="ds-field-label">备注</label><DsInput v-model="form.remark" placeholder="用途说明" style="width:100%" /></div>
        <div class="mb-3 col-span-2">
          <label class="flex items-center gap-2 cursor-pointer text-sm"><input v-model="form.enabled" type="checkbox" />启用（覆盖代码内置提示词）</label>
        </div>
      </div>

      <!-- Function 工具 -->
      <div v-else-if="type === 'tool'" class="grid grid-cols-2 gap-x-4">
        <div class="mb-3"><label class="ds-field-label">工具编码<em>*</em></label><DsInput v-model="form.code" placeholder="query_realtime_inventory" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">工具名称<em>*</em></label><DsInput v-model="form.name" placeholder="实时库存查询" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">归属专家</label><DsSelect v-model="form.owner" :options="ownerOptions" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">参数 Schema</label><DsInput v-model="form.params_schema" placeholder='{"type":"object"}' style="width:100%" /></div>
        <div class="mb-3 col-span-2"><label class="ds-field-label">用途说明</label><DsInput v-model="form.description" placeholder="这个工具查什么数据" style="width:100%" /></div>
        <div class="mb-3 col-span-2"><label class="ds-field-label">备注</label><DsInput v-model="form.remark" placeholder="用途说明" style="width:100%" /></div>
        <div class="mb-3 col-span-2 flex gap-6">
          <label class="flex items-center gap-2 cursor-pointer text-sm"><input v-model="form.write_action" type="checkbox" />写工具</label>
          <label class="flex items-center gap-2 cursor-pointer text-sm"><input v-model="form.enabled" type="checkbox" />启用</label>
        </div>
      </div>

      <!-- MCP 服务 -->
      <div v-else class="grid grid-cols-2 gap-x-4">
        <div class="mb-3"><label class="ds-field-label">服务名称<em>*</em></label><DsInput v-model="form.name" placeholder="本地文件系统 MCP" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">传输方式<em>*</em></label><DsSelect v-model="form.transport" :options="transportOptions" style="width:100%" /></div>
        <div class="mb-3 col-span-2"><label class="ds-field-label">服务地址（HTTP / SSE）</label><DsInput v-model="form.endpoint" placeholder="http://127.0.0.1:9000/sse" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">启动命令（stdio）</label><DsInput v-model="form.command" placeholder="npx" style="width:100%" /></div>
        <div class="mb-3"><label class="ds-field-label">启动参数（stdio）</label><DsInput v-model="form.args" placeholder="-y @modelcontextprotocol/server-filesystem /data" style="width:100%" /></div>
        <div class="mb-3 col-span-2"><label class="ds-field-label">环境变量 JSON</label><DsInput v-model="form.env_json" type="textarea" :rows="3" placeholder='{"TOKEN":"..."}' style="width:100%" /></div>
        <div class="mb-3 col-span-2"><label class="ds-field-label">备注</label><DsInput v-model="form.remark" placeholder="用途说明" style="width:100%" /></div>
        <div class="mb-3 col-span-2">
          <label class="flex items-center gap-2 cursor-pointer text-sm"><input v-model="form.enabled" type="checkbox" />启用登记</label>
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
const type = computed(() => String(route.params.type || 'model'));

/** 四类配置的表格列、接口路径与提示文案，集中在一处便于对照后端路由 */
const CONF: Record<string, any> = {
  model: {
    title: '模型配置', listUrl: '/ai-config/model/list', saveUrl: '/ai-config/model', deleteUrl: '/ai-config/model',
    testUrl: '/ai-config/model', searchHint: '按名称或模型名搜索',
    hint: '启用一条配置后，Agent 会用它覆盖 .env；换供应商无需改环境变量',
    columns: [
      { title: '配置名称', key: 'name', width: '160px' },
      { title: '供应商', key: 'provider', width: '150px' },
      { title: '接口地址', key: 'base_url', minWidth: '220px' },
      { title: '模型名', key: 'model', width: '150px' },
      { title: '密钥', key: 'has_key', slot: true, width: '100px' },
      { title: '温度', key: 'temperature', width: '80px' },
      { title: '状态', key: 'enabled', slot: true, width: '90px' },
      { title: '备注', key: 'remark', minWidth: '150px' },
      { title: '操作', key: 'action', slot: true, fixed: 'right', width: '210px' },
    ],
  },
  prompt: {
    title: 'Prompt 模板', listUrl: '/ai-config/prompt/list', saveUrl: '/ai-config/prompt', deleteUrl: '/ai-config/prompt',
    searchHint: '按编码或名称搜索',
    hint: '模板编码对应 main 与四位专家；启用后覆盖代码内置提示词',
    columns: [
      { title: '模板编码', key: 'code', width: '170px' },
      { title: '模板名称', key: 'name', width: '170px' },
      { title: '场景', key: 'scene', width: '130px' },
      { title: '模板正文', key: 'content', minWidth: '260px' },
      { title: '变量', key: 'variables', width: '120px' },
      { title: '状态', key: 'enabled', slot: true, width: '90px' },
      { title: '操作', key: 'action', slot: true, fixed: 'right', width: '140px' },
    ],
  },
  tool: {
    title: 'Function 工具', listUrl: '/ai-config/tool/list', saveUrl: '/ai-config/tool', deleteUrl: '/ai-config/tool',
    enabledUrl: '/ai-config/tool', searchHint: '按工具编码或名称搜索',
    hint: '编码必须与后端工具函数一致；停用后该工具不再注册给专家',
    columns: [
      { title: '工具编码', key: 'code', width: '200px' },
      { title: '工具名称', key: 'name', width: '160px' },
      { title: '归属专家', key: 'owner', width: '150px' },
      { title: '用途说明', key: 'description', minWidth: '200px' },
      { title: '类型', key: 'write_action', slot: true, width: '100px' },
      { title: '状态', key: 'enabled', slot: true, width: '90px' },
      { title: '操作', key: 'action', slot: true, fixed: 'right', width: '210px' },
    ],
  },
  mcp: {
    title: 'MCP 服务', listUrl: '/ai-config/mcp/list', saveUrl: '/ai-config/mcp', deleteUrl: '/ai-config/mcp',
    testUrl: '/ai-config/mcp', searchHint: '按服务名称搜索',
    hint: '仅登记连接信息与启停；服务端不会执行 stdio 命令',
    columns: [
      { title: '服务名称', key: 'name', width: '170px' },
      { title: '传输方式', key: 'transport', width: '130px' },
      { title: '服务地址', key: 'endpoint', minWidth: '200px' },
      { title: '启动命令', key: 'command', minWidth: '160px' },
      { title: '检测结果', key: 'status', slot: true, width: '100px' },
      { title: '状态', key: 'enabled', slot: true, width: '90px' },
      { title: '操作', key: 'action', slot: true, fixed: 'right', width: '210px' },
    ],
  },
};

/** 用 if/else 链明确返回当前类型对应的配置对象，不靠索引兜底 */
const conf = computed(() => {
  if (type.value === 'prompt') return CONF.prompt;
  if (type.value === 'tool') return CONF.tool;
  if (type.value === 'mcp') return CONF.mcp;
  return CONF.model;
});

const formTitle = computed(() => {
  const prefix = form.id ? '修改' : '新增';
  return prefix + conf.value.title;
});

const sceneOptions = [
  { label: '调度主管', value: 'main' },
  { label: '库存查询专家', value: 'inventory_expert' },
  { label: '单据管理专家', value: 'order_expert' },
  { label: '预警分析专家', value: 'warning_expert' },
  { label: '统计分析专家', value: 'stats_expert' },
];
const ownerOptions = sceneOptions.filter((item) => item.value !== 'main');
const transportOptions = [
  { label: 'SSE', value: 'sse' },
  { label: 'stdio', value: 'stdio' },
  { label: 'Streamable HTTP', value: 'streamable_http' },
];

const rows = ref<any[]>([]);
const loading = ref(false);
const keyword = ref('');
const page = ref(1);
const size = ref(10);
const formVisible = ref(false);
const saving = ref(false);
const form = reactive<Record<string, any>>({});

/** 关键字搜索：把可搜索的字段拼成一个字符串再匹配，逻辑直接、好维护 */
const filtered = computed(() => {
  const key = keyword.value.trim().toLowerCase();
  if (!key) return rows.value;

  const result: any[] = [];
  for (const row of rows.value) {
    const text = String(row.name || '') + ' ' +
      String(row.code || '') + ' ' +
      String(row.model || '') + ' ' +
      String(row.base_url || '') + ' ' +
      String(row.endpoint || '');
    if (text.toLowerCase().includes(key)) {
      result.push(row);
    }
  }
  return result;
});
const paged = computed(() => filtered.value.slice((page.value - 1) * size.value, page.value * size.value));

async function load() {
  loading.value = true;
  try {
    rows.value = await http.get(conf.value.listUrl);
    page.value = 1;
  } finally {
    loading.value = false;
  }
}

function openForm(row?: any) {
  // 先清空，避免上一次弹窗的字段残留到另一类配置
  for (const key of Object.keys(form)) delete form[key];

  if (row) {
    Object.assign(form, row);
  } else {
    // 给每类配置一组明确的默认值，表单打开即可直接填写
    if (type.value === 'model') {
      Object.assign(form, { name: '', provider: 'openai_compatible', base_url: '', api_key: '', model: '', temperature: 0.1, enabled: false, remark: '' });
    } else if (type.value === 'prompt') {
      Object.assign(form, { code: '', name: '', scene: 'main', content: '', variables: '', enabled: false, remark: '' });
    } else if (type.value === 'tool') {
      Object.assign(form, { code: '', name: '', owner: 'order_expert', description: '', params_schema: '', write_action: false, enabled: true, remark: '' });
    } else {
      Object.assign(form, { name: '', transport: 'sse', endpoint: '', command: '', args: '', env_json: '', enabled: false, remark: '' });
    }
  }

  // 编辑模型时密钥框留空，保存后保持原密钥不变
  if (type.value === 'model' && row) form.api_key = '';
  formVisible.value = true;
}

async function save() {
  const payload: any = { ...form };

  // 复选框的布尔值统一转成后端 tinyint，逐个写清楚避免隐式转换
  if (typeof payload.enabled === 'boolean') {
    payload.enabled = payload.enabled ? 1 : 0;
  }
  if (typeof payload.write_action === 'boolean') {
    payload.write_action = payload.write_action ? 1 : 0;
  }
  if (payload.temperature !== undefined) {
    payload.temperature = Number(payload.temperature);
  }

  saving.value = true;
  try {
    await http.post(conf.value.saveUrl, payload);
    toast.success('保存成功');
    formVisible.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function remove(row: any) {
  if (!(await confirm(`确认删除「${row.name || row.code}」？`, '删除确认'))) return;
  await http.delete(`${conf.value.deleteUrl}/${row.id}`);
  toast.success('已删除');
  await load();
}

async function toggleEnabled(row: any) {
  // 计算目标状态：当前启用则停用，否则启用
  let next = 0;
  if (Number(row.enabled) === 1) {
    next = 0;
  } else {
    next = 1;
  }
  await http.put(`${conf.value.enabledUrl}/${row.id}/enabled`, { enabled: next });
  toast.success(next === 1 ? '已启用' : '已停用');
  await load();
}

async function testRow(row: any) {
  try {
    const result: any = await http.post(`${conf.value.testUrl}/${row.id}/test`, {});
    if (result.ok) toast.success(result.message || '检测通过');
    else toast.warning(result.message || '检测未通过');
    await load();
  } catch (error) {
    // 拦截器已经提示错误信息，这里只刷新状态
    await load();
  }
}

watch(() => route.params.type, () => {
  keyword.value = '';
  page.value = 1;
  load();
});

onMounted(load);
</script>

<style scoped>
.ds-field-label { display: block; font-size: 13px; margin-bottom: 6px; color: var(--ds-text-2); }
.ds-field-label em { color: #e55353; font-style: normal; margin-left: 3px; }
</style>
