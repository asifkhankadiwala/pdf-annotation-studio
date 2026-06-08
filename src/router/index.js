import { createRouter, createWebHistory } from 'vue-router';
import MarkupStudio from '@/views/MarkupStudio.vue';
import SignMode from '@/views/SignMode.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'markup', component: MarkupStudio },
    { path: '/sign', name: 'sign', component: SignMode },
  ],
});
