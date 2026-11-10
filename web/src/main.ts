import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { installDsUi } from './components';
import './style.css';
import App from './App.vue';
import router from './router';

const app = createApp(App);
installDsUi(app);
app.use(createPinia()).use(router).mount('#app');
