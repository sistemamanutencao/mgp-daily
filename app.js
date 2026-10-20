const APP_VERSION = '1.2.0';
const AUTHORIZED_UID = 'Ykt4W9Kv3UbBKzba0GH3ziMQzOA3';
const FIREBASE_VERSION = '12.17.1';
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyD641XWCUceDF02Dv1TSlumZV2s4XB81ms',
  authDomain: 'mgp-daily.firebaseapp.com',
  projectId: 'mgp-daily',
  storageBucket: 'mgp-daily.firebasestorage.app',
  messagingSenderId: '851586835666',
  appId: '1:851586835666:web:4b2c7c2c7e4e5a3a35790b',
};
const VERIFIED_UID_KEY = 'mgpDailyVerifiedUid'; // Mantém sessão já autorizada
const DB_NAME = 'nexo-finance-db'; // Isola completamente os dados antigos
const DB_VERSION = 1;
const STORES = ['accounts','categories','transactions','cards'];
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now = () => new Date().toISOString();
const today = () => new Date().toLocaleDateString('en-CA');
const state = {tab:'home',accounts:[],categories:[],transactions:[],cards:[],month:today().slice(0,7),view:'purchase',user:null,accessGranted:false,firebaseConfigured:true,syncStatus:'local',syncMessage:'Somente neste dispositivo'};
const cloud = {initialized:false,initializing:false,app:null,auth:null,db:null,api:null,unsubscribers:[]};
const money = cents => (Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc = value => String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const cents = value => Math.round(Number(value||0)*100);
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{for(const s of [...STORES,'syncQueue'])if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function all(store){const db=await openDb();return new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
async function putLocal(store,value){const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
async function delLocal(store,id){const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).delete(id);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
async function clearLocal(store){const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).clear();t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
async function enqueueSync(op){await putLocal('syncQueue',{id:uid(),queuedAt:now(),...op});}
async function put(store,record,{sync=true}={}){await putLocal(store,record);if(sync&&STORES.includes(store)){await enqueueSync({type:'put',store,record});scheduleSync();}}
async function del(store,id,{sync=true}={}){await delLocal(store,id);if(sync&&STORES.includes(store)){await enqueueSync({type:'delete',store,recordId:id});scheduleSync();}}
async function refresh({renderNow=true}={}){for(const s of STORES)state[s]=await all(s);if(renderNow)render();}
function toast(message){document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),2800);}
function modalShell(html){const el=document.createElement('div');el.className='overlay';el.innerHTML=html;document.body.append(el);el.addEventListener('click',e=>{if(e.target===el)el.remove()});return el;}
function syncBadge(){return `<button class="sync" id="accountBtn">● ${!navigator.onLine?'Offline':state.syncStatus==='synced'?'Sincronizado':state.syncStatus==='error'?'Erro de sync':state.syncStatus==='syncing'?'Sincronizando':'Conta'}</button>`;}
const defaultCategories=[['Alimentação','#f59e0b'],['Moradia','#7656bd'],['Transporte','#12a594'],['Saúde','#ef6588'],['Compras','#3b82f6'],['Lazer','#8b5cf6'],['Educação','#0ea5e9'],['Assinaturas','#64748b'],['Outros','#8d99ae']];
function accountBalance(a){return Number(a.openingCents||0)+state.transactions.filter(t=>t.accountId===a.id&&t.status==='paid'&&t.method!=='credit').reduce((s,t)=>s+(t.type==='income'?1:-1)*Number(t.amountCents||0),0);}
function catName(id){return state.categories.find(c=>c.id===id)?.name||'Outros';}
function catColor(id){return state.categories.find(c=>c.id===id)?.color||'#64748b';}
// Despesas avulsas pertencem somente ao mês de lançamento. Contas fixas
// são projetadas por competência, sem criar débitos bancários fictícios.
function monthlyInstances(month){
  const items=state.transactions.filter(t=>t.type==='expense' && t.status!=='cancelled' && !t.isRecurring);
  const originals=state.transactions.filter(t=>t.type==='expense' && t.isRecurring && t.recurrence==='monthly' && t.status!=='cancelled');
  for(const t of originals){
    const start=(t.dueDate||t.date||'').slice(0,7);
    if(!start || month<=start || (t.recurrenceEnd && month>t.recurrenceEnd.slice(0,7)))continue;
    const occurrenceId=`${t.id}__${month}`;
    if(state.transactions.some(x=>x.id===occurrenceId))continue;
    const day=Number((t.dueDate||t.date||'').slice(8,10))||1;
    const [y,m]=month.split('-').map(Number);
    const last=new Date(y,m,0).getDate();
    const date=`${month}-${String(Math.min(day,last)).padStart(2,'0')}`;
    items.push({...t,id:occurrenceId,date,dueDate:date,status:'pending',isRecurring:false,virtualRecurring:true,recurringSourceId:t.id});
  }
  return items;
}
function txMonth(t){return (t.method==='boleto'||(state.view==='installments'&&t.method==='credit')?(t.dueDate||t.date):t.date||'').slice(0,7);}
function monthBoletos(){return monthlyInstances(state.month).filter(t=>t.method==='boleto'&&txMonth(t)===state.month);}
function boletoTotals(){const list=monthBoletos();return {total:list.reduce((s,t)=>s+Number(t.amountCents||0),0),pending:list.filter(t=>t.status!=='paid').reduce((s,t)=>s+Number(t.amountCents||0),0),paid:list.filter(t=>t.status==='paid').reduce((s,t)=>s+Number(t.amountCents||0),0),count:list.length};}
function boletoPanel(){const b=boletoTotals();return `<section class="panel boleto-panel"><div class="panel-title"><h2>Boletos do mês</h2><button data-new="boleto">＋ Novo boleto</button></div><div class="boleto-summary"><div><small>Total previsto</small><strong>${money(b.total)}</strong></div><div><small>Saldo devedor</small><strong>${money(b.pending)}</strong></div><div><small>Pago</small><strong>${money(b.paid)}</strong></div></div><p class="muted">${b.count} boleto(s) no mês selecionado. Valores pendentes não reduzem o saldo bancário.</p>${transactionList(monthBoletos())}</section>`;}
function monthTransactions(){return monthlyInstances(state.month).filter(t=>txMonth(t)===state.month);}
function monthIncome(){return state.transactions.filter(t=>t.type==='income'&&t.status==='paid'&&(t.date||'').slice(0,7)===state.month).reduce((s,t)=>s+t.amountCents,0);}
function monthExpense(){return monthTransactions().reduce((s,t)=>s+t.amountCents,0);}
function cardTotals(){return state.transactions.filter(t=>t.method==='credit'&&t.type==='expense'&&t.status!=='cancelled').reduce((s,t)=>s+t.amountCents,0);}
function categoriesSummary(){const grouped=new Map();for(const t of monthTransactions()){const id=t.categoryId||'other';grouped.set(id,(grouped.get(id)||0)+t.amountCents)}return [...grouped].sort((a,b)=>b[1]-a[1]);}
function categoryChart(){const groups=categoriesSummary(),max=groups[0]?.[1]||1;return groups.length?`<div class="chart">${groups.map(([id,value])=>`<div class="bar-col"><span>${Math.round(value/Math.max(monthExpense(),1)*100)}%</span><div class="bar" style="height:${Math.max(7,value/max*145)}px;background:${catColor(id)}"></div><small>${esc(catName(id)).slice(0,9)}</small></div>`).join('')}</div><div class="cat-list">${groups.map(([id,value])=>`<button class="cat-line" data-category-filter="${esc(id)}"><span class="dot" style="background:${catColor(id)}"></span><span>${esc(catName(id))}</span><strong class="amount-expense">${money(value)}</strong><small>›</small></button>`).join('')}</div>`:'<div class="empty">Ainda não há despesas neste período.</div>';}
function homeView(){const balance=state.accounts.reduce((s,a)=>s+accountBalance(a),0);return `<section class="hero"><p>SALDO TOTAL DISPONÍVEL</p><h1>${money(balance)}</h1><small>${state.accounts.length} conta(s) cadastrada(s)</small><div class="hero-bottom"><div><span>Entradas do mês</span><strong class="amount-income">${money(monthIncome())}</strong></div><div><span>Gastos do mês</span><strong class="amount-expense">${money(monthExpense())}</strong></div></div></section><div class="quick"><button data-new="income">＋ Receita</button><button data-new="expense">− Despesa</button><button data-new="boleto">▣ Boleto</button></div><section class="panel"><div class="panel-title"><h2>Meus gastos</h2><button data-tab="expenses">Ver detalhes →</button></div>${filters()}${categoryChart()}</section>${boletoPanel()}<section class="panel"><h2>Contas bancárias</h2>${accountList()}</section>`;}
function filters(){return `<div class="filters"><label>Mês <input id="monthFilter" type="month" value="${state.month}"></label><label>Visualização <select id="viewFilter"><option value="purchase" ${state.view==='purchase'?'selected':''}>Compras realizadas</option><option value="installments" ${state.view==='installments'?'selected':''}>Parcelas por mês</option></select></label></div>`;}
function expenseView(){return `<section class="panel"><h2>Meus gastos por categoria</h2><p class="muted">Inclui contas fixas previstas no mês selecionado. O saldo bancário só muda após pagamento registrado.</p>${filters()}<div class="big-number amount-expense">${money(monthExpense())}</div><p class="muted">${monthTransactions().length} lançamento(s)</p>${categoryChart()}</section>${boletoPanel()}<section class="panel"><h2>Movimentações do mês</h2>${transactionList(monthTransactions())}</section>`;}
function transactionList(list){return list.length?`<div class="transactions">${[...list].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(t=>`<div class="tx"><span class="tx-icon">${t.type==='income'?'↙':'↗'}</span><div class="tx-body"><strong>${esc(t.description)}</strong><small>${esc(t.date)} · ${esc(t.type==='income'?'Receita':catName(t.categoryId))} · ${esc(t.method||'')}${t.virtualRecurring?' · Previsto (conta fixa)':t.isRecurring?' · Conta fixa':''}</small></div><strong class="${t.type==='income'?'amount-income':'amount-expense'}">${t.type==='income'?'+':'−'} ${money(t.amountCents)}</strong><button class="icon-button" data-edit-tx="${t.id}" aria-label="Editar">⋯</button></div>`).join('')}</div>`:'<div class="empty">Nenhum lançamento cadastrado.</div>';}
function transactionsView(){return `<section class="panel"><div class="panel-title"><h2>Movimentações</h2><button data-new="expense">＋ Adicionar</button></div>${transactionList(state.transactions)}</section>`;}
function accountList(){return state.accounts.length?state.accounts.map(a=>`<div class="account-line"><div><strong>${esc(a.name)}</strong><small>${esc(a.bank||'Conta bancária')}</small></div><strong>${money(accountBalance(a))}</strong><button class="icon-button" data-edit-account="${a.id}">⋯</button></div>`).join(''):'<div class="empty">Cadastre sua primeira conta para iniciar.</div>';}
function accountsView(){return `<section class="panel"><div class="panel-title"><h2>Minhas contas</h2><button data-new="account">＋ Nova conta</button></div>${accountList()}</section><section class="panel"><div class="panel-title"><h2>Cartões de crédito</h2><button data-new="card">＋ Novo cartão</button></div>${state.cards.length?state.cards.map(c=>`<div class="account-line"><div><strong>${esc(c.name)}</strong><small>Fecha dia ${c.closingDay} · Vence dia ${c.dueDay}</small></div><button class="icon-button" data-edit-card="${c.id}">⋯</button></div>`).join(''):'<div class="empty">Nenhum cartão cadastrado.</div>'}</section><section class="panel"><div class="panel-title"><h2>Categorias</h2><button data-new="category">＋ Nova categoria</button></div>${state.categories.map(c=>`<div class="account-line"><div><span class="dot" style="background:${c.color}"></span> <strong>${esc(c.name)}</strong></div><button class="icon-button" data-edit-category="${c.id}">⋯</button></div>`).join('')}</section>`;}
function render(){const app=document.querySelector('#app');if(!app)return;if(!state.accessGranted){app.innerHTML=`<div class="login"><div class="brand-icon">N</div><h1>Nexo</h1><p>Seu dinheiro, em perspectiva.</p><button class="primary" id="accountBtn">Entrar com minha conta</button><small>Seu login Firebase existente continua válido.</small></div>`;bind();return;}const tabs=[['home','Início','⌂'],['expenses','Gastos','▥'],['transactions','Extrato','⇄'],['accounts','Contas','▤']];app.innerHTML=`<header class="top"><div class="brand"><span class="brand-icon">N</span><div><strong>Nexo</strong><small>Controle financeiro</small></div></div>${syncBadge()}</header><main>${state.tab==='home'?homeView():state.tab==='expenses'?expenseView():state.tab==='transactions'?transactionsView():accountsView()}</main><nav class="bottom">${tabs.map(([key,label,icon])=>`<button data-tab="${key}" class="${state.tab===key?'selected':''}"><span>${icon}</span>${label}</button>`).join('')}</nav><button class="fab" data-new="expense" aria-label="Novo lançamento">＋</button>`;bind();}
function bind(){document.querySelector('#accountBtn')?.addEventListener('click',accountModal);document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render()});document.querySelectorAll('[data-new]').forEach(b=>b.onclick=()=>openForm(b.dataset.new));document.querySelectorAll('[data-edit-account]').forEach(b=>b.onclick=()=>openForm('account',b.dataset.editAccount));document.querySelectorAll('[data-edit-card]').forEach(b=>b.onclick=()=>openForm('card',b.dataset.editCard));document.querySelectorAll('[data-edit-category]').forEach(b=>b.onclick=()=>openForm('category',b.dataset.editCategory));document.querySelectorAll('[data-edit-tx]').forEach(b=>b.onclick=()=>openForm('transaction',b.dataset.editTx));document.querySelector('#monthFilter')?.addEventListener('change',e=>{state.month=e.target.value;render()});document.querySelector('#viewFilter')?.addEventListener('change',e=>{state.view=e.target.value;render()});document.querySelectorAll('[data-category-filter]').forEach(b=>b.onclick=()=>{state.tab='transactions';render();document.querySelector('.transactions')?.scrollIntoView({behavior:'smooth'});toast('Categoria: '+catName(b.dataset.categoryFilter))});}
function field(label,name,value='',type='text',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function select(label,name,options,value){return `<label>${label}<select name="${name}">${options.map(([id,title])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;}
function openForm(kind,id){const store=kind==='account'?'accounts':kind==='card'?'cards':kind==='category'?'categories':'transactions';const existing=state[store].find(r=>r.id===id);const virtual=store==='transactions'&&!existing&&id?.includes('__')?monthlyInstances(id.split('__').pop()).find(r=>r.id===id):null;const old=existing||virtual||{};const isTx=store==='transactions';let content='';if(kind==='account'){content=field('Nome da conta','name',old.name,'text','required')+field('Banco','bank',old.bank)+field('Saldo inicial (R$)','opening',old.id?(old.openingCents/100).toFixed(2):'0.00','number','min="0" step="0.01" required')+field('Data de início','startDate',old.startDate||today(),'date','required');}else if(kind==='category'){content=field('Nome da categoria','name',old.name,'text','required')+field('Cor','color',old.color||'#3b82f6','color');}else if(kind==='card'){content=field('Nome do cartão','name',old.name,'text','required')+field('Limite (R$)','limit',old.id?(old.limitCents/100).toFixed(2):'0','number','min="0" step="0.01"')+field('Dia de fechamento','closingDay',old.closingDay||1,'number','min="1" max="28" required')+field('Dia do vencimento','dueDay',old.dueDay||10,'number','min="1" max="28" required');}else{const type=kind==='income'?'income':kind==='expense'||kind==='boleto'?'expense':old.type||'expense';content=select('Tipo','type',[['expense','Despesa'],['income','Receita']],type)+field('Descrição','description',old.description,'text','required')+field('Valor (R$)','amount',old.id?(old.amountCents/100).toFixed(2):'','number','min="0.01" step="0.01" required')+field('Data da movimentação','date',old.date||today(),'date','required')+select('Situação','status',[['paid','Pago / recebido'],['pending','Pendente']],old.status||(kind==='boleto'?'pending':'paid'))+select('Forma de pagamento','method',[['debit','Débito'],['pix','Pix'],['boleto','Boleto'],['cash','Dinheiro'],['credit','Crédito']],old.method||(kind==='boleto'?'boleto':'pix'))+select('Conta bancária','accountId',[['','Selecione uma conta'],...state.accounts.map(a=>[a.id,a.name])],old.accountId||'')+select('Cartão de crédito','cardId',[['','Nenhum'],...state.cards.map(c=>[c.id,c.name])],old.cardId||'')+select('Categoria','categoryId',[['','Sem categoria'],...state.categories.map(c=>[c.id,c.name])],old.categoryId||'')+field('Vencimento (opcional)','dueDate',old.dueDate||(kind==='boleto'?today():'') ,'date')+select('Repetição','recurrence',[['none','Não repetir'],['monthly','Mensal (boleto ou conta fixa)']],old.isRecurring?'monthly':'none')+field('Fim da recorrência (opcional)','recurrenceEnd',old.recurrenceEnd||'','date');}
const overlay=modalShell(`<form class="dialog"><div class="dialog-head"><h2>${id?'Editar':'Adicionar'} ${kind==='account'?'conta':kind==='card'?'cartão':kind==='category'?'categoria':'lançamento'}</h2><button type="button" class="close" aria-label="Fechar">×</button></div><div class="fields">${content}</div><div class="dialog-actions">${id?'<button type="button" class="danger" id="deleteRecord">Excluir</button>':''}<button class="primary" type="submit">Salvar</button></div></form>`);overlay.querySelector('.close').onclick=()=>overlay.remove();overlay.querySelector('#deleteRecord')?.addEventListener('click',async()=>{if(store==='accounts'&&state.transactions.some(t=>t.accountId===id)){alert('Esta conta possui movimentações. Não é possível excluí-la.');return}if(store==='categories'&&state.transactions.some(t=>t.categoryId===id)){alert('Reclassifique os lançamentos antes de excluir esta categoria.');return}if(store==='cards'&&state.transactions.some(t=>t.cardId===id)){alert('Este cartão possui compras vinculadas.');return}if(virtual){alert('Para encerrar a recorrência, edite o lançamento original e informe a data final.');return}if(!confirm('Excluir este registro?'))return;await del(store,id);await refresh();overlay.remove()});overlay.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),v=Object.fromEntries(f.entries());const record={...old,id:virtual?virtual.id:(id||uid()),createdAt:old.createdAt||now(),updatedAt:now()};if(kind==='account'){if(!v.name.trim())return;Object.assign(record,{name:v.name.trim(),bank:v.bank.trim(),openingCents:cents(v.opening),startDate:v.startDate});}else if(kind==='category'){Object.assign(record,{name:v.name.trim(),color:v.color});}else if(kind==='card'){Object.assign(record,{name:v.name.trim(),limitCents:cents(v.limit),closingDay:Number(v.closingDay),dueDay:Number(v.dueDay)});}else{if(!state.accounts.length){alert('Cadastre uma conta bancária antes de registrar movimentações.');return}if(v.method==='boleto'&&!v.dueDate){alert('Informe a data de vencimento do boleto.');return}if(v.method==='credit'&&!v.cardId){alert('Selecione o cartão de crédito.');return}if(v.method!=='credit'&&!v.accountId){alert('Selecione a conta bancária.');return}Object.assign(record,{type:v.type,description:v.description.trim(),amountCents:cents(v.amount),date:v.date,status:v.status,method:v.method,accountId:v.accountId,cardId:v.method==='credit'?v.cardId:'',categoryId:v.categoryId,dueDate:v.dueDate,isRecurring:!virtual&&v.recurrence==='monthly',recurrence:!virtual?v.recurrence:'none',recurrenceEnd:!virtual?v.recurrenceEnd:'',recurringSourceId:virtual?virtual.recurringSourceId:(old.recurringSourceId||'')});delete record.virtualRecurring;}await put(store,record);await refresh();overlay.remove();toast('Registro salvo.');};}
function getFirebaseConfig() {
  return FIREBASE_CONFIG;
}

function loginForm() {
  return `<div class="modal-head"><div><span class="eyebrow">ACESSO PESSOAL</span><h2>Entrar no Nexo</h2></div><button type="button" class="icon-btn subtle close">×</button></div>
    <div class="cloud-explainer"><strong>Somente sua conta é aceita</strong><span>O Firebase e o UID autorizado já estão configurados nesta versão.</span></div>
    <label>E-mail<input name="email" type="email" required autocomplete="email" placeholder="seu@email.com"></label>
    <label>Senha<input name="password" type="password" required minlength="6" autocomplete="current-password" placeholder="Mínimo 6 caracteres"></label>
    <div class="modal-actions stacked"><button type="submit" class="primary-btn" data-auth-action="login">Entrar</button></div>`;
}

function signedInView() {
  return `<div class="modal-head"><div><span class="eyebrow">CONTA</span><h2>Nuvem conectada</h2></div><button type="button" class="icon-btn subtle close">×</button></div>
    <div class="account-card"><div class="account-avatar">${esc((state.user?.email || '?')[0].toUpperCase())}</div><div><strong>${esc(state.user?.email || '')}</strong><span>${esc(state.syncMessage)}</span></div></div>
    <div class="sync-detail"><span>Estado atual</span><strong>${navigator.onLine ? (state.syncStatus === 'synced' ? 'Sincronizado' : 'Aguardando sincronização') : 'Offline — alterações ficam no dispositivo'}</strong></div>
    <div class="modal-actions stacked"><button type="button" class="primary-btn" id="syncNowBtn">Sincronizar agora</button><button type="button" class="secondary-btn" id="logoutBtn">Sair da conta</button></div>`;
}

function accountModal() {
  const el = modalShell(`<form class="modal account-modal">${state.user ? signedInView() : loginForm()}</form>`);
  const form = el.querySelector('form');
  el.querySelectorAll('.close').forEach((button) => (button.onclick = () => el.remove()));

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
        for (const store of STORES) await clearLocal(store);
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
    cloud.app = appModule.initializeApp(firebaseAppConfig, 'nexo');
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
        alert('Acesso negado. Esta conta não é a conta autorizada do Nexo.');
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
  for(const unsub of cloud.unsubscribers) unsub();
  cloud.unsubscribers = [];
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

  for (const store of ['accounts', 'categories', 'transactions', 'cards']) {
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
  for (const store of STORES) {
    const unsub = cloud.api.onSnapshot(userCollection(store), async snapshot => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'removed') await delLocal(store,change.doc.id);
        else await putLocal(store,{...change.doc.data(),id:change.doc.id});
      }
      await refresh();
    },error=>{console.error('listener',store,error);state.syncStatus='error';render();});
    cloud.unsubscribers.push(unsub);
  }
}

async function warmFirebaseCache() {
  if (!('caches' in window)) return;
  const urls = [
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`,
  ];
  try {
    const cache = await caches.open(`nexo-firebase-${FIREBASE_VERSION}`);
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
  if (!(await all('categories')).length) { for (const [name,color] of defaultCategories) await put('categories',{id:uid(),name,color,createdAt:now(),updatedAt:now()}); }
  await refresh();
  initFirebase();
})();
