import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'vuetify/styles'
import './styles.css'
import App from './App.vue'
import { createAppRouter } from './router'
import { createAppVuetify } from './plugins/vuetify'

createApp(App).use(createPinia()).use(createAppRouter()).use(createAppVuetify()).mount('#app')
