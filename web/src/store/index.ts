import { defineStore } from 'pinia';

export const useStore = defineStore('main', {
  state: () => ({ token: localStorage.getItem('token') || '', user: JSON.parse(localStorage.getItem('user') || '{}'), menus: JSON.parse(localStorage.getItem('menus') || '[]') }),
  actions: {
    setLogin(d: any) {
      this.token = d.token; this.user = d.userInfo; this.menus = d.menus || [];
      localStorage.setItem('token', d.token); localStorage.setItem('user', JSON.stringify(d.userInfo)); localStorage.setItem('menus', JSON.stringify(d.menus || []));
    },
    logout() { this.token = ''; this.user = {}; this.menus = []; localStorage.clear(); },
  },
});
