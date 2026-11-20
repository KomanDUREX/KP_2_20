
import { reactive } from 'vue'
import { useTasksStore } from '../store/tasks'
import { useProjectsStore } from '../store/projects'
import { readSnapshot, writeSnapshot } from './database'

export const persistenceState = reactive({
  status: 'loading', // loading | saving | saved | error
  error: '',
  canRetry: false,
  lastSavedAt: null,
})

let taskStore = null
let projectStore = null
let enabled = false
let writing = false
let revision = 0
let savedRevision = 0
let lastRequestedSnapshot = ''
let scheduled = false

// Перетворюємо реактивні дані Pinia на звичайні об'єкти
function makeSnapshot() {
  return JSON.parse(JSON.stringify({
    tasks: taskStore.tasks,
    projects: projectStore.projects,
    nextProjectId: projectStore.nextProjectId,
  }))
}

// Записуємо зміни послідовно, без одночасних транзакцій
async function flushChanges() {
  if (!enabled || writing) return

  writing = true

  try {
    while (savedRevision < revision) {
      const targetRevision = revision
      const snapshot = makeSnapshot()

      try {
        await writeSnapshot(snapshot)
        savedRevision = targetRevision
        persistenceState.lastSavedAt = new Date()
      } catch (error) {
        console.error('TaskFlow: збереження не вдалося:', error)
        persistenceState.status = 'error'
        persistenceState.error =
          'Зміни поки що залишилися лише в пам’яті.'
        persistenceState.canRetry = true
        return
      }
    }

    persistenceState.status = 'saved'
    persistenceState.error = ''
    persistenceState.canRetry = false
  } finally {
    writing = false
  }
}

function requestSave(force = false) {
  if (!enabled) return

  const fingerprint = JSON.stringify(makeSnapshot())

  // Не записуємо однакові дані повторно
  if (!force && fingerprint === lastRequestedSnapshot) return

  lastRequestedSnapshot = fingerprint
  revision += 1
  persistenceState.status = 'saving'
  persistenceState.error = ''
  persistenceState.canRetry = false

  void flushChanges()
}

// Об'єднуємо синхронні зміни в одну спробу збереження
function onStoreChanged() {
  if (scheduled) return

  scheduled = true

  queueMicrotask(() => {
    scheduled = false
    requestSave()
  })
}

// Повторна спроба запису після помилки
export function retrySave() {
  if (!enabled || persistenceState.status !== 'error') return
  requestSave(true)
}

// Відновлюємо дані до запуску інтерфейсу
export async function initializePersistence(pinia) {
  taskStore = useTasksStore(pinia)
  projectStore = useProjectsStore(pinia)

  try {
    const snapshot = await readSnapshot()

    if (snapshot.initialized) {
      if (
        !Array.isArray(snapshot.tasks) ||
        !Array.isArray(snapshot.projects)
      ) {
        throw new Error('Некоректний формат локальних даних.')
      }

      // Відновлюємо наступний доступний ID проєкту
      const calculatedNextId = Math.max(
        0,
        ...snapshot.projects.map((project) => {
          const match = /^project-(\d+)$/.exec(String(project.id))
          return match ? Number(match[1]) : 0
        }),
      ) + 1

      projectStore.$patch({
        projects: snapshot.projects,
        nextProjectId:
          Number.isSafeInteger(snapshot.nextProjectId) &&
          snapshot.nextProjectId >= calculatedNextId
            ? snapshot.nextProjectId
            : calculatedNextId,
      })

      taskStore.$patch({ tasks: snapshot.tasks })
    } else {
      // Початкові дані записуємо тільки один раз
      await writeSnapshot(makeSnapshot())
    }

    persistenceState.status = 'saved'
    persistenceState.lastSavedAt = new Date()
    lastRequestedSnapshot = JSON.stringify(makeSnapshot())
    enabled = true

    // Стежимо за змінами обох сховищ Pinia
    taskStore.$subscribe(onStoreChanged, {
      detached: true,
      flush: 'sync',
    })

    projectStore.$subscribe(onStoreChanged, {
      detached: true,
      flush: 'sync',
    })
  } catch (error) {
    console.error('TaskFlow: IndexedDB недоступна:', error)

    persistenceState.status = 'error'
    persistenceState.error =
      'Не вдалося відкрити або відновити локальні дані. ' +
      'Працює лише тимчасовий стан; наявну базу не перезаписано.'
    persistenceState.canRetry = false
  }
}
