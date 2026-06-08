import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import '../css/styles.css';
import '../css/sign.css';

createApp(App).use(router).mount('#app');
