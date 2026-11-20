
<script setup>
import { ref, computed, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import AppTabbar from '../components/AppTabbar.vue'
import TaskCard from '../components/TaskCard.vue'
import TaskForm from '../components/TaskForm.vue'
import TaskListControls from '../components/TaskListControls.vue'
import { useTasksStore } from '../store/tasks'
import { useProjectsStore } from '../store/projects'
import {
  persistenceState,
  retrySave,
} from '../services/persistence'
import '../css/task-components.css'
import '../css/task-list.css'
import '../css/persistence.css'

// Отримуємо завдання, проєкти та фільтри зі спільних сховищ
const taskStore = useTasksStore()
const projectStore = useProjectsStore()

const {
  tasks,
  visibleTasks,
  searchText,
  selectedStatus,
  selectedPriority,
  selectedProject,
  sortOrder,
} = storeToRefs(taskStore)

const { projects } = storeToRefs(projectStore)

// Стан форми та повідомлення залишаються локальними
const showForm = ref(false)
const editingId = ref(null)
const formAnchor = ref(null)
const feedback = ref('')
const newProjectTitle = ref('')
const newProjectError = ref('')

const editingTask = computed(() =>
  tasks.value.find((task) => task.id === editingId.value) ?? null,
)

// Рахуємо кількість завдань у кожному проєкті
const projectStats = computed(() =>
  projects.value.map((project) => ({
    ...project,
    taskCount: tasks.value.filter(
      (task) => task.projectId === project.id,
    ).length,
  })),
)

// Повідомлення залежить від фактичного стану IndexedDB
const saveMessage = computed(() => {
  if (persistenceState.status === 'loading') {
    return 'Завантаження локальних даних…'
  }

  if (persistenceState.status === 'saving') {
    return 'Збереження змін у IndexedDB…'
  }

  if (persistenceState.status === 'saved') {
    return 'Усі зміни збережено в цьому браузері.'
  }

  return persistenceState.error || 'Помилка локального збереження.'
})

// Переходимо до форми після відкриття
async function scrollToForm() {
  await nextTick()
  formAnchor.value?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

function startCreate() {
  editingId.value = null
  showForm.value = true
  feedback.value = ''
  scrollToForm()
}

function startEdit(id) {
  editingId.value = Number(id)
  showForm.value = true
  feedback.value = ''
  scrollToForm()
}

function cancelForm() {
  editingId.value = null
  showForm.value = false
}

// Передаємо зміни в Pinia — збереження виконається автоматично
function saveTask(values) {
  const isNew = values.id === null

  const saved = isNew
    ? taskStore.addTask(values)
    : taskStore.updateTask(values)

  if (!saved) {
    feedback.value = 'Не вдалося зберегти завдання.'
    return
  }

  cancelForm()
  taskStore.resetFilters()

  feedback.value = isNew
    ? 'Завдання створено.'
    : 'Завдання оновлено.'
}

// Видаляємо завдання лише після підтвердження
function handleDelete(id) {
  const task = tasks.value.find(
    (item) => item.id === Number(id),
  )

  if (!task) return

  if (!window.confirm(`Видалити завдання «${task.title}»?`)) {
    return
  }

  if (taskStore.deleteTask(id)) {
    if (editingId.value === Number(id)) {
      cancelForm()
    }

    feedback.value = `Завдання «${task.title}» видалено.`
  }
}

// Створюємо проєкт через Pinia
function createProject() {
  const project = projectStore.addProject(newProjectTitle.value)

  if (!project) {
    newProjectError.value =
      'Назва: 3–40 символів. Не повторюйте назви проєктів.'
    return
  }

  newProjectTitle.value = ''
  newProjectError.value = ''
  selectedProject.value = project.id

  feedback.value = `Проєкт «${project.title}» створено.`
}
</script>

<template>
  <f7-page name="tasks" class="tf3-page">
    <f7-navbar title="Мої завдання" />

    <div class="tf3-container">
      <section class="tf3-hero">
        <div class="tf3-eyebrow">TASKFLOW / TASK MANAGER</div>

        <h1>Керування завданнями і проєктами</h1>

        <p>
          Pinia керує станом, а IndexedDB зберігає
          завдання та проєкти локально.
        </p>

        <button
          type="button"
          class="tf5-btn tf5-btn--primary tf5-new"
          @click="startCreate"
        >
          + Додати завдання
        </button>
      </section>

      <!-- Статус запису в IndexedDB -->
      <section
        class="tf7-persistence"
        :class="`tf7-persistence--${persistenceState.status}`"
        role="status"
        aria-live="polite"
      >
        <strong>Локальне збереження</strong>

        <span>{{ saveMessage }}</span>

        <button
          v-if="persistenceState.canRetry"
          type="button"
          class="tf5-btn"
          @click="retrySave"
        >
          Повторити збереження
        </button>
      </section>

      <!-- Каталог проєктів -->
      <section
        class="tf5-panel tf6-project-panel"
        aria-label="Проєкти"
      >
        <h2>Мої проєкти</h2>

        <div class="tf6-project-list">
          <span
            v-for="project in projectStats"
            :key="project.id"
            class="tf6-project-pill"
          >
            {{ project.title }}
            <strong>{{ project.taskCount }}</strong>
          </span>
        </div>

        <form
          class="tf6-project-form"
          @submit.prevent="createProject"
        >
          <label>
            Назва нового проєкту
            <input
              v-model="newProjectTitle"
              type="text"
              maxlength="40"
              placeholder="Наприклад: Лабораторні"
              @input="newProjectError = ''"
            />
          </label>

          <button
            type="submit"
            class="tf5-btn tf5-btn--primary"
          >
            Створити проєкт
          </button>
        </form>

        <p
          v-if="newProjectError"
          class="tf5-error"
          role="alert"
        >
          {{ newProjectError }}
        </p>
      </section>

      <!-- Форма створення та редагування -->
      <div ref="formAnchor">
        <TaskForm
          v-if="showForm"
          :key="editingId ?? 'new'"
          :task="editingTask"
          :projects="projects"
          @save="saveTask"
          @cancel="cancelForm"
        />
      </div>

      <p
        v-if="feedback"
        class="tf5-feedback"
        role="status"
      >
        {{ feedback }}
      </p>

      <!-- Пошук, фільтрація та сортування -->
      <TaskListControls
        v-model:search="searchText"
        v-model:status="selectedStatus"
        v-model:priority="selectedPriority"
        v-model:project="selectedProject"
        v-model:sort="sortOrder"
        :projects="projects"
        @reset="taskStore.resetFilters"
      />

      <!-- Список завдань -->
      <section class="tf3-section">
        <div class="tf3-section-heading">
          <div>
            <div class="tf3-eyebrow">TASK LIST</div>
            <h2>Список завдань</h2>
          </div>

          <div class="tf3-counter">
            Показано: {{ visibleTasks.length }} із {{ tasks.length }}
          </div>
        </div>

        <div
          v-if="visibleTasks.length"
          class="tf3-task-grid"
        >
          <TaskCard
            v-for="task in visibleTasks"
            :key="task.id"
            :task="task"
            :project-title="
              projectStore.projectTitle(task.projectId)
            "
            @status-change="taskStore.setTaskStatus"
            @priority-change="taskStore.setTaskPriority"
            @edit="startEdit"
            @delete="handleDelete"
          />
        </div>

        <div v-else class="tf5-empty">
          <p>
            За поточними умовами завдань не знайдено.
          </p>

          <button
            type="button"
            class="tf5-btn"
            @click="taskStore.resetFilters"
          >
            Показати всі завдання
          </button>
        </div>
      </section>
    </div>

    <AppTabbar active="tasks" />
  </f7-page>
</template>
