import axios from 'axios';
import { useToast } from '@/components';

const http = axios.create({ baseURL: '/api', timeout: 30000 });
http.interceptors.request.use((c) => {
  const t = localStorage.getItem('token');
  if (t) c.headers!.Authorization = `Bearer ${t}`;
  return c;
});
http.interceptors.response.use(
  (r) => r.data,
  (e) => {
    if (e.response?.status === 401) {
      localStorage.clear();
      location.href = '/login';
    } else {
      useToast().error(e.response?.data?.message || e.message || '请求失败');
    }
    return Promise.reject(e);
  },
);
export default http;
export const token = () => localStorage.getItem('token') || '';
