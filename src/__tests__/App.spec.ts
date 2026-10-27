import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import { createAppRouter } from '@/router'
import { createAppVuetify } from '@/plugins/vuetify'

async function mountApp(path: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    global: { plugins: [createPinia(), router, createAppVuetify()] },
  })
  await flushPromises()
  return { router, wrapper }
}

describe('App', () => {
  it('VuetifyとRouterを組み合わせ、トップ画面とタイトルを表示する', async () => {
    const { wrapper } = await mountApp('/')
    expect(wrapper.get('h1').text()).toBe('スピード')
    expect(wrapper.text()).toContain('対戦機能は今後追加します。')
    expect(document.title).toBe('ホーム | Speed Card Game')
  })

  it('未知のネストしたURLは404となり、リンクでホームに戻るとタイトルも変わる', async () => {
    const { router, wrapper } = await mountApp('/unknown/nested')
    expect(router.currentRoute.value.name).toBe('not-found')
    expect(wrapper.get('h1').text()).toBe('ページが見つかりません')
    expect(document.title).toBe('ページが見つかりません | Speed Card Game')

    await wrapper.get('a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
    expect(wrapper.get('h1').text()).toBe('スピード')
    expect(document.title).toBe('ホーム | Speed Card Game')
  })
})
