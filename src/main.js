
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Framework7 from 'framework7/lite-bundle'
import Framework7Vue, { registerComponents } from 'framework7-vue/bundle'

import 'framework7/css/bundle'
import 'framework7-icons/css/framework7-icons.css'
import './css/app.css'

import App from './App.vue'
import { initializePersistence } from './services/persistence'

// Підключаємо Framework7 до Vue
Framework7.use(Framework7Vue)

const app = createApp(App)
const pinia = createPinia()

// Pinia керує спільним станом завдань і проєктів
app.use(pinia)

// Зберігаємо підтримку компонентів та іконок Framework7
registerComponents(app)

// Спочатку відновлюємо дані, потім показуємо застосунок
async function bootstrap() {
  await initializePersistence(pinia)
  app.mount('#app')
}

bootstrap().catch((error) => {
  console.error('TaskFlow: помилка запуску:', error)
  app.mount('#app')
})
