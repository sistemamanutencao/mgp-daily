const APP_VERSION = '0.2.2';
const AUTHORIZED_UID = 'r7phpAeSu2TKzettmItVRC6qZ6j2';
const DB_NAME = 'mgp-daily-db';
const DB_VERSION = 2;
const FIREBASE_VERSION = '12.17.1';
const FIREBASE_CONFIG_KEY = 'mgpDailyFirebaseConfig';
const VERIFIED_UID_KEY = 'mgpDailyVerifiedUid';

const priorityMeta = {
  emergency: { label: 'Emergência', weight: 4, tone: 'danger' },
  high: { label: 'Alta', weight: 3, tone: 'warning' },
  medium: { label: 'Média', weight: 2, tone: 'info' },
  low: { label: 'Baixa', weight: 1, tone: 'neutral' },
};

const statusMeta = {
  planned: 'Planejada',
  inProgress: 'Em execução',
  interrupted: 'Interrompida',
  waitingMaterial: 'Aguardando material',
  waitingEnvironment: 'Aguardando ambiente',
  saturday: 'Sábado',
  completed: 'Concluída',
};

const categories = ['Elétrica', 'Hidráulica', 'Pintura', 'Civil', 'Gesso', 'Marcenaria', 'Inspeção', 'Preventiva', 'Outro'];
const interruptionReasons = ['Solicitação da gestão', 'Emergência', 'Falta de material', 'Ambiente ocupado', 'Terceiro', 'Fim do expediente', 'Outro'];

const state = {
  tab: 'today',
  tasks: [],
  materials: [],
  firebaseConfigured: false,
  user: null,
  accessGranted: false,
  syncStatus: 'local',
  syncMessage: 'Somente neste dispositivo',
};

const cloud = {
  initialized: false,
  initializing: false,
  app: null,
  auth: null,
  db: null,
  api: null,
  unsubscribeTasks: null,
  unsubscribeMaterials: null,
};

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now = () => new Date().toISOString();

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ['tasks', 'materials', 'syncQueue']) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function all(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function putLocal(store, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function delLocal(store, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearLocal(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function enqueueSync(operation) {
  await putLocal('syncQueue', {
    id: uid(),
    queuedAt: now(),
    ...operation,
  });
}

async function put(store, value, { sync = true } = {}) {
  await putLocal(store, value);
  if (sync && ['tasks', 'materials'].includes(store)) {
    await enqueueSync({ type: 'put', store, record: value });
    scheduleSync();
  }
}

async function del(store, id, { sync = true } = {}) {
  await delLocal(store, id);
  if (sync && ['tasks', 'materials'].includes(store)) {
    await enqueueSync({ type: 'delete', store, recordId: id });
    scheduleSync();
  }
}

async function refresh({ renderNow = true } = {}) {
  state.tasks = await all('tasks');
  state.materials = await all('materials');
  if (renderNow) render();
}

function active() {
  return state.tasks.filter((t) => t.status !== 'completed');
}

function executable() {
  return active()
    .filter((t) => ['planned', 'interrupted', 'inProgress'].includes(t.status))
    .sort((a, b) =>
      a.status === 'inProgress'
        ? -1
        : b.status === 'inProgress'
          ? 1
          : priorityMeta[b.priority].weight - priorityMeta[a.priority].weight || new Date(a.createdAt) - new Date(b.createdAt),
    );
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function toast(message) {
  let el = document.querySelector('.toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function stat(value, label, tone = '') {
  return `<div class="stat ${tone}"><strong>${value}</strong><span>${label}</span></div>`;
}

function empty(title, text) {
  return `<div class="empty"><div class="empty-icon">✓</div><strong>${title}</strong><span>${text}</span></div>`;
}

function syncBadge() {
  const status = navigator.onLine ? state.syncStatus : 'offline';
  const meta = {
    local: ['Local', 'cloud-local'],
    connecting: ['Conectando', 'cloud-working'],
    syncing: ['Sincronizando', 'cloud-working'],
    synced: ['Nuvem OK', 'cloud-ok'],
    offline: ['Offline', 'cloud-offline'],
    error: ['Erro de sync', 'cloud-error'],
  }[status] || ['Local', 'cloud-local'];
  return `<button class="cloud-badge ${meta[1]}" id="accountBtn" title="${esc(state.syncMessage)}"><span class="cloud-dot"></span>${meta[0]}</button>`;
}

function cloudSetupNotice() {
  if (state.firebaseConfigured) return '';
  return `<section class="cloud-setup-card"><div><span class="eyebrow">BACKUP E SINCRONIZAÇÃO</span><strong>Proteja seus dados na nuvem</strong><p>Configure o Firebase para acessar a mesma manutenção no computador e no celular e recuperar seus dados mesmo após limpar o navegador.</p></div><button class="primary-btn" id="setupCloudBtn">Configurar agora</button></section>`;
}

function card(task, { deleteButton = false } = {}) {
  const pm = priorityMeta[task.priority];
  return `<article class="task-card ${task.status === 'inProgress' ? 'featured' : ''}">
    <div class="task-top">
      <div>
        <div class="badge-row"><span class="priority-badge ${pm.tone}">${pm.label}</span><span class="status-badge">${statusMeta[task.status]}</span></div>
        <h3>${esc(task.title)}</h3>
        <p>${esc(task.location)} · ${esc(task.category)} · ${task.estimatedMinutes} min</p>
        ${task.interruptionReason ? `<p class="reason">Motivo: ${esc(task.interruptionReason)}</p>` : ''}
      </div>
      <button class="kebab" data-edit="${task.id}">•••</button>
    </div>
    <div class="task-actions">
      ${task.status !== 'inProgress' && task.status !== 'completed' ? `<button class="primary-btn" data-start="${task.id}">▶ ${task.status === 'interrupted' ? 'Retomar' : 'Iniciar'}</button>` : ''}
      ${task.status === 'inProgress' ? `<button class="secondary-btn" data-interrupt="${task.id}">Pausar</button><button class="success-btn" data-complete="${task.id}">Concluir</button>` : ''}
      ${!['completed', 'waitingMaterial'].includes(task.status) ? `<button class="text-btn" data-block="waitingMaterial:${task.id}">Falta material</button>` : ''}
      ${!['completed', 'waitingEnvironment'].includes(task.status) ? `<button class="text-btn" data-block="waitingEnvironment:${task.id}">Ambiente ocupado</button>` : ''}
      ${!['completed', 'saturday'].includes(task.status) ? `<button class="text-btn" data-block="saturday:${task.id}">Sábado</button>` : ''}
      ${task.status !== 'completed' && task.status !== 'inProgress' ? `<button class="text-btn success-text" data-complete="${task.id}">Concluir</button>` : ''}
      ${deleteButton ? `<button class="text-btn danger-text" data-delete="${task.id}">Excluir</button>` : ''}
    </div>
  </article>`;
}

function todayView() {
  const a = active();
  const ex = executable();
  const next = ex[0];
  const interrupted = a.filter((t) => t.status === 'interrupted');
  const blocked = a.filter((t) => ['waitingMaterial', 'waitingEnvironment'].includes(t.status));
  return `${cloudSetupNotice()}
    <section class="hero"><p class="muted">Controle primeiro o que realmente pode e deve ser feito.</p><div class="stats-grid">${stat(a.filter((t) => t.priority === 'emergency').length, 'Emergências', 'danger')}${stat(a.filter((t) => t.priority === 'high').length, 'Alta prioridade', 'warning')}${stat(interrupted.length, 'Interrompidas', 'violet')}${stat(a.filter((t) => t.status === 'waitingMaterial').length, 'Sem material')}</div></section>
    <section class="section"><div class="section-head"><div><span class="eyebrow">PRÓXIMA MISSÃO</span><h2>O que fazer agora</h2></div></div>${next ? card(next) : empty('Nenhuma tarefa executável', 'Cadastre uma tarefa ou revise as atividades bloqueadas.')}</section>
    ${interrupted.length ? `<section class="section"><div class="section-head"><h2>Retomar</h2><span class="count-pill">${interrupted.length}</span></div>${interrupted.slice(0, 3).map((t) => card(t)).join('')}</section>` : ''}
    ${blocked.length ? `<section class="section"><div class="section-head"><h2>Bloqueadas</h2><span class="count-pill">${blocked.length}</span></div>${blocked.slice(0, 3).map((t) => card(t)).join('')}</section>` : ''}`;
}

function tasksView() {
  const sorted = [...state.tasks].sort((a, b) => priorityMeta[b.priority].weight - priorityMeta[a.priority].weight || new Date(a.createdAt) - new Date(b.createdAt));
  return `<section class="section flush"><div class="filter-row"><button class="chip selected">Todas</button><button class="chip">Ativas: ${active().length}</button><button class="chip">Concluídas: ${state.tasks.filter((t) => t.status === 'completed').length}</button></div>${sorted.length ? sorted.map((t) => card(t, { deleteButton: true })).join('') : empty('Sem tarefas', 'Crie sua primeira tarefa usando o botão +.')}</section>`;
}

function saturdayView() {
  const tasks = state.tasks.filter((t) => t.status === 'saturday');
  return `<section class="section flush"><div class="notice"><div><strong>Janela protegida</strong><span>Use o sábado para serviços que exigem ambiente desocupado, ruído ou bloqueio de área.</span></div></div>${tasks.length ? tasks.map((t) => card(t)).join('') : empty('Sábado livre', 'Nenhuma tarefa está programada para sábado.')}</section>`;
}

function materialState(material) {
  return material.quantity <= 0 ? 'out' : material.quantity <= material.minimum ? 'low' : 'ok';
}

function materialsView() {
  const materials = [...state.materials].sort((a, b) => ({ out: 0, low: 1, ok: 2 })[materialState(a)] - ({ out: 0, low: 1, ok: 2 })[materialState(b)]);
  return `<section class="section flush"><div class="section-head"><div><span class="eyebrow">ESTOQUE OPERACIONAL</span><h2>Essenciais</h2></div><button class="secondary-btn" id="newMaterial">＋ Material</button></div><div class="material-summary">${stat(materials.filter((m) => materialState(m) === 'out').length, 'Acabou', 'danger')}${stat(materials.filter((m) => materialState(m) === 'low').length, 'Baixo', 'warning')}${stat(materials.filter((m) => materialState(m) === 'ok').length, 'OK', 'success')}</div>${materials.length ? materials.map((m) => `<div class="material-card"><div><strong>${esc(m.name)}</strong><span>${m.quantity} ${esc(m.unit)} · mínimo ${m.minimum}</span></div><div class="material-actions"><span class="stock-badge ${materialState(m)}">${materialState(m) === 'out' ? 'Acabou' : materialState(m) === 'low' ? 'Baixo' : 'OK'}</span><button class="text-btn" data-edit-material="${m.id}">Editar</button></div></div>`).join('') : empty('Sem materiais cadastrados', 'Cadastre somente os itens essenciais que você precisa acompanhar.')}</section>`;
}

function historyView() {
  const events = state.tasks
    .flatMap((t) => (t.history || []).map((h) => ({ ...h, task: t.title, location: t.location })))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  return `<section class="section flush"><div class="backup-box"><div><strong>Backup adicional</strong><span>${state.user ? 'Seus dados também estão sincronizados com o Firebase. O arquivo JSON continua útil como cópia independente.' : 'Sem login na nuvem, este arquivo é sua principal proteção contra perda de dados.'}</span></div><div class="backup-actions"><button class="secondary-btn" id="exportBtn">Exportar</button><button class="secondary-btn" id="importBtn">Importar</button></div></div><div class="section-head"><h2>Atividade recente</h2></div>${events.length ? events.slice(0, 60).map((e) => `<div class="history-row"><div class="timeline-dot"></div><div><strong>${esc(e.action)}</strong><span>${esc(e.task)} · ${esc(e.location)}</span><small>${new Date(e.at).toLocaleString('pt-BR')}</small></div></div>`).join('') : empty('Sem histórico', 'As movimentações das tarefas aparecerão aqui.')}</section>`;
}


function accessGateView() {
  const config = getFirebaseConfig();
  const configured = Boolean(config?.apiKey && config?.projectId && config?.appId);
  const title = configured ? 'Acesso restrito' : 'Configuração inicial';
  const text = configured
    ? 'Entre com a única conta autorizada para acessar suas tarefas e materiais. Depois do primeiro login, o app continua disponível offline neste dispositivo.'
    : 'Configure o Firebase. O MGP Daily já está bloqueado para a conta pessoal autorizada.';
  const buttonId = configured ? 'accountBtn' : 'setupCloudBtn';
  const buttonText = configured ? 'Entrar' : 'Configurar Firebase';
  return `<div class="auth-gate"><div class="auth-gate-card"><div class="auth-mark">M</div><span class="eyebrow">MGP DAILY <span class="version">v${APP_VERSION}</span></span><h1>${title}</h1><p>${text}</p><button class="primary-btn auth-gate-btn" id="${buttonId}">${buttonText}</button><small>Uso pessoal · acesso por UID do Firebase</small></div></div>`;
}

function render() {
  if (!state.accessGranted) {
    document.querySelector('#app').innerHTML = accessGateView();
    bind();
    return;
  }
  const titles = { today: 'Minha Jornada', tasks: 'Tarefas', saturday: 'Sábado', materials: 'Materiais', history: 'Histórico' };
  document.querySelector('#app').innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div><div class="eyebrow">MGP Daily <span class="version">v${APP_VERSION}</span></div><h1>${titles[state.tab]}</h1></div>
      <div class="topbar-actions">${syncBadge()}<button class="icon-btn" id="newTask">＋</button></div>
    </header>
    <main class="content">${state.tab === 'today' ? todayView() : state.tab === 'tasks' ? tasksView() : state.tab === 'saturday' ? saturdayView() : state.tab === 'materials' ? materialsView() : historyView()}</main>
    <nav class="bottom-nav">${[['today', '⌂', 'Hoje'], ['tasks', '☷', 'Tarefas'], ['saturday', '◷', 'Sábado'], ['materials', '▣', 'Materiais'], ['history', '↺', 'Histórico']].map(([value, icon, label]) => `<button class="nav-btn ${state.tab === value ? 'active' : ''}" data-tab="${value}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('')}</nav>
  </div>`;
  bind();
}

function bind() {
  document.querySelectorAll('[data-tab]').forEach((button) => (button.onclick = () => { state.tab = button.dataset.tab; render(); }));
  document.querySelector('#newTask')?.addEventListener('click', () => taskModal());
  document.querySelector('#accountBtn')?.addEventListener('click', accountModal);
  document.querySelector('#setupCloudBtn')?.addEventListener('click', accountModal);
  document.querySelectorAll('[data-edit]').forEach((button) => (button.onclick = () => taskModal(state.tasks.find((t) => t.id === button.dataset.edit))));
  document.querySelectorAll('[data-start]').forEach((button) => (button.onclick = () => startTask(button.dataset.start)));
  document.querySelectorAll('[data-interrupt]').forEach((button) => (button.onclick = () => interruptTask(button.dataset.interrupt)));
  document.querySelectorAll('[data-complete]').forEach((button) => (button.onclick = () => transition(button.dataset.complete, 'completed', 'Tarefa concluída', { completedAt: now(), interruptionReason: '' })));
  document.querySelectorAll('[data-block]').forEach((button) => (button.onclick = () => {
    const [status, id] = button.dataset.block.split(':');
    transition(id, status, status === 'waitingMaterial' ? 'Aguardando material' : status === 'waitingEnvironment' ? 'Aguardando ambiente' : 'Programada para sábado');
  }));
  document.querySelectorAll('[data-delete]').forEach((button) => (button.onclick = async () => {
    const task = state.tasks.find((t) => t.id === button.dataset.delete);
    if (confirm(`Excluir "${task.title}"?`)) {
      await del('tasks', task.id);
      await refresh();
    }
  }));
  document.querySelector('#newMaterial')?.addEventListener('click', () => materialModal());
  document.querySelectorAll('[data-edit-material]').forEach((button) => (button.onclick = () => materialModal(state.materials.find((m) => m.id === button.dataset.editMaterial))));
  document.querySelector('#exportBtn')?.addEventListener('click', exportBackup);
  document.querySelector('#importBtn')?.addEventListener('click', importBackup);
}

async function transition(id, status, action, extra = {}) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  await put('tasks', { ...task, ...extra, status, updatedAt: now(), history: [...(task.history || []), { at: now(), action }] });
  await refresh();
}

async function startTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  const running = state.tasks.find((t) => t.status === 'inProgress' && t.id !== id);
  if (running) {
    await put('tasks', { ...running, status: 'interrupted', interruptionReason: 'Troca de prioridade', updatedAt: now(), history: [...(running.history || []), { at: now(), action: `Interrompida automaticamente para iniciar: ${task.title}` }] });
  }
  await transition(id, 'inProgress', 'Execução iniciada', { startedAt: task.startedAt || now(), interruptionReason: '' });
}

async function interruptTask(id) {
  const reason = prompt(`Motivo da interrupção:\n${interruptionReasons.join('\n')}`, 'Solicitação da gestão');
  if (reason) await transition(id, 'interrupted', `Interrompida: ${reason}`, { interruptionReason: reason });
}

function modalShell(inner) {
  const el = document.createElement('div');
  el.className = 'modal-backdrop';
  el.innerHTML = inner;
  el.addEventListener('mousedown', (event) => { if (event.target === el) el.remove(); });
  document.body.appendChild(el);
  return el;
}

function taskModal(task) {
  const el = modalShell(`<form class="modal"><div class="modal-head"><div><span class="eyebrow">${task ? 'EDITAR' : 'NOVA'}</span><h2>${task ? 'Tarefa' : 'Nova tarefa'}</h2></div><button type="button" class="icon-btn subtle close">×</button></div><label>Título<input name="title" required value="${esc(task?.title || '')}" placeholder="Ex.: Trocar luminária"></label><label>Local<input name="location" required value="${esc(task?.location || '')}" placeholder="Ex.: Biblioteca"></label><div class="form-grid"><label>Categoria<select name="category">${categories.map((c) => `<option ${task?.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>Prioridade<select name="priority">${Object.entries(priorityMeta).map(([value, meta]) => `<option value="${value}" ${(task?.priority || 'medium') === value ? 'selected' : ''}>${meta.label}</option>`).join('')}</select></label></div><label>Tempo estimado (min)<input name="estimatedMinutes" type="number" min="1" value="${task?.estimatedMinutes || 20}"></label><label>Observação<textarea name="notes" rows="3" placeholder="Detalhes úteis para retomar depois...">${esc(task?.notes || '')}</textarea></label><div class="modal-actions"><button type="button" class="secondary-btn close">Cancelar</button><button class="primary-btn">Salvar tarefa</button></div></form>`);
  el.querySelectorAll('.close').forEach((button) => (button.onclick = () => el.remove()));
  el.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const existing = task || {};
    const value = {
      id: task?.id || uid(),
      title: form.get('title').trim(),
      location: form.get('location').trim(),
      category: form.get('category'),
      priority: form.get('priority'),
      estimatedMinutes: Number(form.get('estimatedMinutes')) || 15,
      notes: form.get('notes').trim(),
      status: existing.status || 'planned',
      createdAt: existing.createdAt || now(),
      updatedAt: now(),
      history: existing.history || [{ at: now(), action: 'Tarefa criada' }],
      interruptionReason: existing.interruptionReason || '',
    };
    await put('tasks', value);
    el.remove();
    await refresh();
    toast(task ? 'Tarefa atualizada.' : 'Tarefa criada.');
  };
}

function materialModal(material) {
  const el = modalShell(`<form class="modal small"><div class="modal-head"><div><span class="eyebrow">ESTOQUE</span><h2>${material ? 'Editar material' : 'Novo material'}</h2></div><button type="button" class="icon-btn subtle close">×</button></div><label>Material<input name="name" required value="${esc(material?.name || '')}" placeholder="Ex.: Lâmpada LED 18W"></label><div class="form-grid"><label>Quantidade<input name="quantity" type="number" min="0" value="${material?.quantity || 0}"></label><label>Mínimo<input name="minimum" type="number" min="0" value="${material?.minimum || 0}"></label></div><label>Unidade<select name="unit">${['un', 'm', 'kg', 'L', 'cx', 'pct'].map((u) => `<option ${material?.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label><div class="modal-actions"><button type="button" class="secondary-btn close">Cancelar</button><button class="primary-btn">Salvar</button></div></form>`);
  el.querySelectorAll('.close').forEach((button) => (button.onclick = () => el.remove()));
  el.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    await put('materials', {
      id: material?.id || uid(),
      name: form.get('name').trim(),
      quantity: Number(form.get('quantity')) || 0,
      minimum: Number(form.get('minimum')) || 0,
      unit: form.get('unit'),
      createdAt: material?.createdAt || now(),
      updatedAt: now(),
    });
    el.remove();
    await refresh();
    toast(material ? 'Material atualizado.' : 'Material adicionado.');
  };
}

async function exportBackup() {
  const data = { version: APP_VERSION, exportedAt: now(), tasks: state.tasks, materials: state.materials };
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  anchor.download = `mgp-daily-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    try {
      const data = JSON.parse(await input.files[0].text());
      if (!Array.isArray(data.tasks) || !Array.isArray(data.materials)) throw new Error('Formato inválido');
      await clearLocal('tasks');
      await clearLocal('materials');
      for (const task of data.tasks) await putLocal('tasks', task);
      for (const material of data.materials) await putLocal('materials', material);
      await enqueueSync({ type: 'replaceAll', store: 'tasks', records: data.tasks });
      await enqueueSync({ type: 'replaceAll', store: 'materials', records: data.materials });
      await refresh();
      scheduleSync();
      toast('Backup restaurado.');
    } catch {
      alert('Arquivo de backup inválido.');
    }
  };
  input.click();
}

function getFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveFirebaseConfig(config) {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
  state.firebaseConfigured = true;
}

function firebaseConfigForm(current = {}) {
  return `<div class="modal-head"><div><span class="eyebrow">FIREBASE · USO PESSOAL</span><h2>Conectar sua conta</h2></div><button type="button" class="icon-btn subtle close">×</button></div>
    <div class="cloud-explainer"><strong>Acesso pessoal bloqueado</strong><span>Esta versão aceita somente a conta Firebase autorizada na compilação do aplicativo.</span></div>
    <label>API Key<input name="apiKey" required value="${esc(current.apiKey || '')}" placeholder="AIza..."></label>
    <label>Auth Domain<input name="authDomain" required value="${esc(current.authDomain || '')}" placeholder="seu-projeto.firebaseapp.com"></label>
    <label>Project ID<input name="projectId" required value="${esc(current.projectId || '')}" placeholder="seu-projeto"></label>
    <label>App ID<input name="appId" required value="${esc(current.appId || '')}" placeholder="1:123:web:abc..."></label>
    <label>Messaging Sender ID<input name="messagingSenderId" value="${esc(current.messagingSenderId || '')}" placeholder="123456789"></label>
    <label>Storage Bucket<input name="storageBucket" value="${esc(current.storageBucket || '')}" placeholder="seu-projeto.firebasestorage.app"></label>
    <div class="modal-actions"><button type="button" class="secondary-btn close">Cancelar</button><button class="primary-btn">Salvar configuração</button></div>`;
}

function loginForm() {
  return `<div class="modal-head"><div><span class="eyebrow">ACESSO PESSOAL</span><h2>Entrar no MGP Daily</h2></div><button type="button" class="icon-btn subtle close">×</button></div>
    <div class="cloud-explainer"><strong>Somente sua conta é aceita</strong><span>Não existe cadastro público neste aplicativo. A conta autorizada é definida pelo UID configurado no Firebase.</span></div>
    <label>E-mail<input name="email" type="email" required autocomplete="email" placeholder="seu@email.com"></label>
    <label>Senha<input name="password" type="password" required minlength="6" autocomplete="current-password" placeholder="Mínimo 6 caracteres"></label>
    <div class="modal-actions stacked"><button type="submit" class="primary-btn" data-auth-action="login">Entrar</button><button type="button" class="text-btn" id="editFirebaseBtn">Alterar configuração do Firebase</button></div>`;
}

function signedInView() {
  return `<div class="modal-head"><div><span class="eyebrow">CONTA</span><h2>Nuvem conectada</h2></div><button type="button" class="icon-btn subtle close">×</button></div>
    <div class="account-card"><div class="account-avatar">${esc((state.user?.email || '?')[0].toUpperCase())}</div><div><strong>${esc(state.user?.email || '')}</strong><span>${esc(state.syncMessage)}</span></div></div>
    <div class="sync-detail"><span>Estado atual</span><strong>${navigator.onLine ? (state.syncStatus === 'synced' ? 'Sincronizado' : 'Aguardando sincronização') : 'Offline — alterações ficam no dispositivo'}</strong></div>
    <div class="modal-actions stacked"><button type="button" class="primary-btn" id="syncNowBtn">Sincronizar agora</button><button type="button" class="secondary-btn" id="logoutBtn">Sair da conta</button><button type="button" class="text-btn" id="editFirebaseBtn">Configuração do Firebase</button></div>`;
}

function accountModal() {
  const config = getFirebaseConfig();
  const el = modalShell(`<form class="modal account-modal">${!config ? firebaseConfigForm() : state.user ? signedInView() : loginForm()}</form>`);
  const form = el.querySelector('form');
  el.querySelectorAll('.close').forEach((button) => (button.onclick = () => el.remove()));

  if (!config) {
    form.onsubmit = (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const firebaseConfig = {
        apiKey: data.get('apiKey').trim(),
        authDomain: data.get('authDomain').trim(),
        projectId: data.get('projectId').trim(),
        appId: data.get('appId').trim(),
        messagingSenderId: data.get('messagingSenderId').trim(),
        storageBucket: data.get('storageBucket').trim(),
      };
      saveFirebaseConfig(firebaseConfig);
      el.remove();
      toast('Firebase configurado. Conectando...');
      initFirebase();
      render();
    };
    return;
  }

  el.querySelector('#editFirebaseBtn')?.addEventListener('click', () => {
    el.remove();
    firebaseConfigEditModal(config);
  });

  if (state.user) {
    el.querySelector('#syncNowBtn')?.addEventListener('click', async () => {
      await flushSyncQueue(true);
      toast(state.syncStatus === 'synced' ? 'Dados sincronizados.' : state.syncMessage);
      el.remove();
    });
    el.querySelector('#logoutBtn')?.addEventListener('click', async () => {
      try {
        await flushSyncQueue(true);
        if (state.syncStatus === 'error') {
          alert('Ainda há alterações locais que não foram sincronizadas. Tente novamente quando a conexão estiver estável.');
          return;
        }
        await cloud.api.signOut(cloud.auth);
        localStorage.removeItem(VERIFIED_UID_KEY);
        state.accessGranted = false;
        await clearLocal('tasks');
        await clearLocal('materials');
        await clearLocal('syncQueue');
        await refresh();
        el.remove();
        toast('Sessão encerrada. Os dados deste dispositivo foram limpos; a cópia sincronizada permanece na nuvem.');
      } catch (error) {
        alert(firebaseErrorMessage(error));
      }
    });
    return;
  }

  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    await authWithEmail(data.get('email').trim(), data.get('password'), false, el);
  };
}

function firebaseConfigEditModal(config) {
  const el = modalShell(`<form class="modal account-modal">${firebaseConfigForm(config)}</form>`);
  const form = el.querySelector('form');
  el.querySelectorAll('.close').forEach((button) => (button.onclick = () => el.remove()));
  form.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(form);
    saveFirebaseConfig({
      apiKey: data.get('apiKey').trim(),
      authDomain: data.get('authDomain').trim(),
      projectId: data.get('projectId').trim(),
      appId: data.get('appId').trim(),
      messagingSenderId: data.get('messagingSenderId').trim(),
      storageBucket: data.get('storageBucket').trim(),
    });
    alert('Configuração salva. O aplicativo será recarregado para aplicar a mudança.');
    location.reload();
  };
}

async function authWithEmail(email, password, _createAccount, modal) {
  if (!cloud.initialized) await initFirebase();
  if (!cloud.initialized) {
    alert(state.syncMessage);
    return;
  }
  try {
    await cloud.api.signInWithEmailAndPassword(cloud.auth, email, password);
    modal.remove();
  } catch (error) {
    alert(firebaseErrorMessage(error));
  }
}

function firebaseErrorMessage(error) {
  const code = error?.code || '';
  const known = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/operation-not-allowed': 'Ative o provedor E-mail/Senha no Firebase Authentication.',
    'auth/network-request-failed': 'Sem conexão com a internet. Seus dados locais continuam disponíveis.',
    'auth/unauthorized-domain': 'Este domínio ainda não foi autorizado no Firebase Authentication. Adicione o domínio publicado em Authentication > Settings > Authorized domains.',
  };
  return known[code] || `Firebase: ${error?.message || 'não foi possível concluir a operação.'}`;
}

async function initFirebase() {
  const config = getFirebaseConfig();
  state.firebaseConfigured = Boolean(config);
  if (!config || cloud.initialized || cloud.initializing) return;
  if (!navigator.onLine) {
    state.syncStatus = 'offline';
    state.syncMessage = 'Offline — trabalhando com os dados locais';
    render();
    return;
  }

  cloud.initializing = true;
  state.syncStatus = 'connecting';
  state.syncMessage = 'Conectando ao Firebase...';
  render();

  try {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
    ]);

    cloud.api = { ...appModule, ...authModule, ...firestoreModule };
    const firebaseAppConfig = config;
    cloud.app = appModule.initializeApp(firebaseAppConfig, 'mgp-daily');
    cloud.auth = authModule.getAuth(cloud.app);
    await authModule.setPersistence(cloud.auth, authModule.browserLocalPersistence);

    try {
      cloud.db = firestoreModule.initializeFirestore(cloud.app, {
        localCache: firestoreModule.persistentLocalCache({
          tabManager: firestoreModule.persistentMultipleTabManager(),
        }),
      });
    } catch {
      cloud.db = firestoreModule.getFirestore(cloud.app);
    }

    cloud.initialized = true;
    cloud.initializing = false;
    warmFirebaseCache();

    authModule.onAuthStateChanged(cloud.auth, async (user) => {
      const configuredUid = AUTHORIZED_UID;
      stopCloudListeners();

      if (user && configuredUid && user.uid !== configuredUid) {
        state.user = null;
        state.accessGranted = false;
        localStorage.removeItem(VERIFIED_UID_KEY);
        state.syncStatus = 'error';
        state.syncMessage = 'Conta não autorizada para este aplicativo.';
        await authModule.signOut(cloud.auth);
        render();
        alert('Acesso negado. Esta conta não é a conta autorizada do MGP Daily.');
        return;
      }

      state.user = user ? { uid: user.uid, email: user.email } : null;
      state.accessGranted = Boolean(user && configuredUid && user.uid === configuredUid);

      if (state.accessGranted) {
        localStorage.setItem(VERIFIED_UID_KEY, configuredUid);
        state.syncStatus = navigator.onLine ? 'syncing' : 'offline';
        state.syncMessage = navigator.onLine ? 'Preparando sincronização...' : 'Offline — alterações serão enviadas quando houver internet';
        render();
        if (navigator.onLine) {
          await mergeCloudAndLocal();
          await flushSyncQueue();
          startCloudListeners();
        }
      } else {
        state.syncStatus = 'local';
        state.syncMessage = 'Entre com sua conta autorizada';
        render();
      }
    });
  } catch (error) {
    cloud.initializing = false;
    state.syncStatus = 'error';
    state.syncMessage = 'Não foi possível carregar o Firebase. O modo local continua funcionando.';
    console.error(error);
    render();
  }
}

function stopCloudListeners() {
  cloud.unsubscribeTasks?.();
  cloud.unsubscribeMaterials?.();
  cloud.unsubscribeTasks = null;
  cloud.unsubscribeMaterials = null;
}

function userCollection(store) {
  return cloud.api.collection(cloud.db, 'users', state.user.uid, store);
}

async function mergeCloudAndLocal() {
  if (!cloud.initialized || !state.user || !navigator.onLine) return;
  state.syncStatus = 'syncing';
  state.syncMessage = 'Comparando dados locais e da nuvem...';
  render();

  const pending = await all('syncQueue');
  const pendingDeletes = new Set(pending.filter((op) => op.type === 'delete').map((op) => `${op.store}:${op.recordId}`));

  for (const store of ['tasks', 'materials']) {
    const localRecords = await all(store);
    const localMap = new Map(localRecords.map((record) => [record.id, record]));
    const snapshot = await cloud.api.getDocs(userCollection(store));
    const remoteRecords = snapshot.docs.map((document) => ({ ...document.data(), id: document.id }));
    const remoteMap = new Map(remoteRecords.map((record) => [record.id, record]));

    for (const remote of remoteRecords) {
      if (pendingDeletes.has(`${store}:${remote.id}`)) continue;
      const local = localMap.get(remote.id);
      if (!local) {
        await putLocal(store, remote);
        continue;
      }
      const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
      const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
      if (remoteTime > localTime) await putLocal(store, remote);
      else if (localTime > remoteTime && !pending.some((op) => op.type === 'put' && op.store === store && op.record?.id === local.id)) {
        await enqueueSync({ type: 'put', store, record: local });
      }
    }

    for (const local of localRecords) {
      if (!remoteMap.has(local.id) && !pendingDeletes.has(`${store}:${local.id}`) && !pending.some((op) => op.type === 'put' && op.store === store && op.record?.id === local.id)) {
        await enqueueSync({ type: 'put', store, record: local });
      }
    }
  }
  await refresh({ renderNow: false });
}

let syncTimer = null;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => flushSyncQueue(), 400);
}

async function flushSyncQueue(force = false) {
  if (!cloud.initialized || !state.user) return;
  if (!navigator.onLine) {
    state.syncStatus = 'offline';
    state.syncMessage = 'Offline — alterações guardadas neste dispositivo';
    render();
    return;
  }

  const queue = (await all('syncQueue')).sort((a, b) => new Date(a.queuedAt) - new Date(b.queuedAt));
  if (!queue.length && !force) {
    state.syncStatus = 'synced';
    state.syncMessage = `Sincronizado como ${state.user.email}`;
    render();
    return;
  }

  state.syncStatus = 'syncing';
  state.syncMessage = queue.length ? `${queue.length} alteração(ões) enviando...` : 'Verificando a nuvem...';
  render();

  try {
    for (const operation of queue) {
      if (operation.type === 'put') {
        const ref = cloud.api.doc(cloud.db, 'users', state.user.uid, operation.store, operation.record.id);
        await cloud.api.setDoc(ref, operation.record, { merge: true });
      } else if (operation.type === 'delete') {
        const ref = cloud.api.doc(cloud.db, 'users', state.user.uid, operation.store, operation.recordId);
        await cloud.api.deleteDoc(ref);
      } else if (operation.type === 'replaceAll') {
        await replaceCloudCollection(operation.store, operation.records || []);
      }
      await delLocal('syncQueue', operation.id);
    }
    state.syncStatus = 'synced';
    state.syncMessage = `Sincronizado como ${state.user.email}`;
  } catch (error) {
    state.syncStatus = navigator.onLine ? 'error' : 'offline';
    state.syncMessage = navigator.onLine ? 'Falha ao sincronizar. As alterações continuam salvas localmente.' : 'Offline — alterações guardadas neste dispositivo';
    console.error(error);
  }
  render();
}

async function replaceCloudCollection(store, records) {
  const snapshot = await cloud.api.getDocs(userCollection(store));
  const remoteIds = new Set(snapshot.docs.map((document) => document.id));
  const localIds = new Set(records.map((record) => record.id));
  for (const id of remoteIds) {
    if (!localIds.has(id)) await cloud.api.deleteDoc(cloud.api.doc(cloud.db, 'users', state.user.uid, store, id));
  }
  for (const record of records) {
    await cloud.api.setDoc(cloud.api.doc(cloud.db, 'users', state.user.uid, store, record.id), record, { merge: false });
  }
}

function startCloudListeners() {
  if (!cloud.initialized || !state.user) return;
  stopCloudListeners();
  cloud.unsubscribeTasks = cloud.api.onSnapshot(userCollection('tasks'), async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type === 'removed') await delLocal('tasks', change.doc.id);
      else await putLocal('tasks', { ...change.doc.data(), id: change.doc.id });
    }
    await refresh();
  }, (error) => console.error('tasks listener', error));

  cloud.unsubscribeMaterials = cloud.api.onSnapshot(userCollection('materials'), async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type === 'removed') await delLocal('materials', change.doc.id);
      else await putLocal('materials', { ...change.doc.data(), id: change.doc.id });
    }
    await refresh();
  }, (error) => console.error('materials listener', error));
}

async function warmFirebaseCache() {
  if (!('caches' in window)) return;
  const urls = [
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`,
  ];
  try {
    const cache = await caches.open(`mgp-daily-firebase-${FIREBASE_VERSION}`);
    await Promise.all(urls.map(async (url) => {
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) await cache.put(url, response.clone());
    }));
  } catch (error) {
    console.warn('Não foi possível aquecer o cache do Firebase.', error);
  }
}

window.addEventListener('online', async () => {
  state.syncMessage = 'Internet restaurada. Preparando sincronização...';
  render();
  if (!cloud.initialized) await initFirebase();
  if (state.user) {
    await mergeCloudAndLocal();
    await flushSyncQueue();
    startCloudListeners();
  }
});

window.addEventListener('offline', () => {
  state.syncStatus = 'offline';
  state.syncMessage = 'Offline — alterações guardadas neste dispositivo';
  render();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
}

(async function boot() {
  const config = getFirebaseConfig();
  state.firebaseConfigured = Boolean(config);
  const verifiedUid = localStorage.getItem(VERIFIED_UID_KEY);
  state.accessGranted = Boolean(!navigator.onLine && verifiedUid === AUTHORIZED_UID);
  await refresh();
  initFirebase();
})();
