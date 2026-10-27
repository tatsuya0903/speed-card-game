import { createRouter, createWebHashHistory, type RouterHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import NotFoundView from '@/views/NotFoundView.vue'

export function createAppRouter(
  history: RouterHistory = createWebHashHistory(import.meta.env.BASE_URL),
) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: HomeView, meta: { title: 'ホーム' } },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: NotFoundView,
        meta: { title: 'ページが見つかりません' },
      },
    ],
  })
}
