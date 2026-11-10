<template>
  <div class="h-screen flex items-center justify-center" style="background: linear-gradient(135deg, #4d6bfe, #8aa0ff)">
    <div class="w-[380px] rounded-xl p-8 shadow-lg" style="background: var(--ds-bg-elevated, #fff)">
      <div class="flex items-center justify-center gap-2 text-xl font-bold mb-6" style="color: var(--ds-brand)">
        <IconFont name="Box" :size="26" />智能仓储WMS系统
      </div>
      <div class="space-y-3" @keyup.enter="submit">
        <DsInput v-model="form.username" placeholder="用户名" size="lg" />
        <DsInput v-model="form.password" type="password" placeholder="密码" size="lg" />
      </div>
      <DsButton variant="primary" size="lg" block class="mt-5" :loading="loading" @click="submit">登 录</DsButton>
      <p class="ds-muted text-center mt-4">演示账号 admin / keeper / viewer，密码 admin123</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from '@/components';
import http from '@/utils/request';
import { useStore } from '@/store';

const router = useRouter();
const store = useStore();
const toast = useToast();
const loading = ref(false);
const form = reactive({ username: 'admin', password: 'admin123' });

async function submit() {
  if (!form.username || !form.password) { toast.warning('请输入用户名和密码'); return; }
  loading.value = true;
  try {
    const d: any = await http.post('/auth/login', form);
    store.setLogin(d);
    toast.success('登录成功');
    const isViewer = (d.userInfo?.roleId === 3) || !d.menus?.some((m: any) => m.path === '/system');
    router.push(isViewer && d.userInfo?.roleId === 3 ? '/portal' : '/dashboard');
  } finally { loading.value = false; }
}
</script>
