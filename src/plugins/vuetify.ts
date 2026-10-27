import { createVuetify } from 'vuetify'
import { ja } from 'vuetify/locale'

export function createAppVuetify() {
  return createVuetify({
    locale: { locale: 'ja', messages: { ja } },
    theme: {
      defaultTheme: 'speed',
      themes: {
        speed: {
          dark: false,
          colors: {
            primary: '#17624D',
            background: '#F4F6F3',
            surface: '#FFFFFF',
            'on-background': '#1E3029',
            'on-surface': '#1E3029',
          },
        },
      },
    },
  })
}
