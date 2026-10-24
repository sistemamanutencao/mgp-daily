const APP_VERSION = '1.9.0';
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
const DB_VERSION = 2;
const STORES = ['accounts','categories','transactions','cards','notes'];
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const now = () => new Date().toISOString();
const today = () => new Date().toLocaleDateString('en-CA');
const state = {tab:'home',accounts:[],categories:[],transactions:[],cards:[],notes:[],month:today().slice(0,7),view:'purchase',user:null,accessGranted:false,firebaseConfigured:true,syncStatus:'local',syncMessage:'Somente neste dispositivo'};
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
function accountBalance(a){return Number(a.openingCents||0)+state.transactions.filter(t=>t.accountId===a.id&&t.status==='paid'&&t.method!=='credit').reduce((s,t)=>s+(t.type==='income'?1:-1)*Number(t.amountCents||0),0);}
function catName(id){return state.categories.find(c=>c.id===id)?.name||'Sem categoria';}
function catColor(id){return state.categories.find(c=>c.id===id)?.color||'#64748b';}
// Uma série mensal é um lançamento original; as ocorrências futuras são projeções.
// Exceções reais substituem a projeção do mês, sem duplicar valores.
function occurrenceDate(month, source){
  const day=Number((source.dueDate||source.date||'').slice(8,10))||1;
  const [y,m]=month.split('-').map(Number);
  return `${month}-${String(Math.min(day,new Date(y,m,0).getDate())).padStart(2,'0')}`;
}
function instanceMonth(t){
  // A competência de uma ocorrência editada é imutável, mesmo se sua data mudar.
  return t.occurrenceMonth || (t.recurringSourceId && t.id?.includes('__') ? t.id.split('__').pop() : txMonth(t));
}
function monthlyInstances(month){
  const originals=state.transactions.filter(t=>t.type==='expense'&&t.isRecurring&&t.recurrence==='monthly'&&t.status!=='cancelled'&&!t.recurringSourceId);
  const items=state.transactions.filter(t=>t.type==='expense'&&t.status!=='cancelled'&&!t.recurringSourceId);
  const overrides=state.transactions.filter(t=>t.type==='expense'&&t.recurringSourceId&&instanceMonth(t)===month);
  // Uma única ocorrência por série e competência, com preferência pela edição real.
  const overrideBySeries=new Map();
  for(const t of overrides){
    const key=t.recurringSourceId;
    const prev=overrideBySeries.get(key);
    if(!prev || String(t.updatedAt||'')>String(prev.updatedAt||''))overrideBySeries.set(key,t);
  }
  for(const t of originals){
    const start=(t.dueDate||t.date||'').slice(0,7);
    if(!start||month<=start||(t.recurrenceEnd&&month>t.recurrenceEnd.slice(0,7)))continue;
    if(t.recurrenceCount>0){const [sy,sm]=start.split('-').map(Number),[cy,cm]=month.split('-').map(Number);if((cy-sy)*12+cm-sm>=t.recurrenceCount)continue;}
    if(overrideBySeries.has(t.id))continue;
    const occurrenceId=`${t.id}__${month}`;
    const date=occurrenceDate(month,t);
    items.push({...t,id:occurrenceId,date,dueDate:date,status:'pending',isRecurring:false,virtualRecurring:true,recurringSourceId:t.id,occurrenceMonth:month});
  }
  for(const t of overrideBySeries.values())if(t.status!=='cancelled')items.push(t);
  return items;
}
function monthlyObligations(){return monthTransactions().filter(t=>t.type==='expense');}
function unpaidMonthlyObligations(){return monthlyObligations().filter(t=>t.status!=='paid'&&t.status!=='cancelled');}
function obligationTotals(){const list=monthlyObligations();return {total:list.reduce((a,t)=>a+Number(t.amountCents||0),0),pending:list.filter(t=>t.status!=='paid').reduce((a,t)=>a+Number(t.amountCents||0),0),paid:list.filter(t=>t.status==='paid').reduce((a,t)=>a+Number(t.amountCents||0),0)};}
function recurringPanel(){const totals=obligationTotals();const list=unpaidMonthlyObligations().filter(t=>t.isRecurring||t.recurringSourceId);return `<section class="panel recurring-panel"><div class="panel-title"><h2>Contas mensais</h2><button data-new="expense">＋ Nova conta</button></div><p class="muted">Contas mensais repetem automaticamente. Cada vencimento é independente e só reduz o saldo bancário quando pago.</p><div class="boleto-summary"><div><small>Despesas previstas</small><strong class="amount-expense">${money(totals.total)}</strong></div><div><small>A pagar no mês</small><strong class="amount-expense">${money(totals.pending)}</strong></div><div><small>Pagas no mês</small><strong class="amount-income">${money(totals.paid)}</strong></div></div>${transactionList(list)}</section>`;}
function txMonth(t){return (t.method==='boleto'||(state.view==='installments'&&t.method==='credit')?(t.dueDate||t.date):t.date||'').slice(0,7);}
function monthTransactions(){return monthlyInstances(state.month).filter(t=>t.recurringSourceId?instanceMonth(t)===state.month:txMonth(t)===state.month);}
function monthIncome(){return state.transactions.filter(t=>t.type==='income'&&t.status==='paid'&&(t.date||'').slice(0,7)===state.month).reduce((s,t)=>s+t.amountCents,0);}
function monthExpense(){return unpaidMonthlyObligations().reduce((s,t)=>s+Number(t.amountCents||0),0);}
function categoriesSummary(){const grouped=new Map();for(const t of unpaidMonthlyObligations()){const id=t.categoryId||'other';grouped.set(id,(grouped.get(id)||0)+t.amountCents)}return [...grouped].sort((a,b)=>b[1]-a[1]);}
function categoryChart(){const groups=categoriesSummary(),max=groups[0]?.[1]||1;return groups.length?`<div class="chart">${groups.map(([id,value])=>`<div class="bar-col"><span>${Math.round(value/Math.max(monthExpense(),1)*100)}%</span><div class="bar" style="height:${Math.max(7,value/max*145)}px;background:${catColor(id)}"></div><small>${esc(catName(id)).slice(0,9)}</small></div>`).join('')}</div><div class="cat-list">${groups.map(([id,value])=>`<button class="cat-line" data-category-filter="${esc(id)}"><span class="dot" style="background:${catColor(id)}"></span><span>${esc(catName(id))}</span><strong class="amount-expense">${money(value)}</strong><small>›</small></button>`).join('')}</div>`:'<div class="empty">Ainda não há despesas neste período.</div>';}
function homeView(){const balance=state.accounts.reduce((s,a)=>s+accountBalance(a),0);return `<section class="hero"><p>SALDO TOTAL DISPONÍVEL</p><h1>${money(balance)}</h1><small>${state.accounts.length} conta(s) cadastrada(s)</small><div class="hero-bottom"><div><span>Entradas do mês</span><strong class="amount-income">${money(monthIncome())}</strong></div><div><span>Gastos a pagar no mês</span><strong class="amount-expense">${money(monthExpense())}</strong></div></div></section><div class="quick"><button data-new="income">＋ Receita</button><button data-new="expense">− Despesa</button></div><section class="panel"><div class="panel-title"><h2>Meus gastos</h2><button data-tab="expenses">Ver detalhes →</button></div>${filters()}${categoryChart()}</section><section class="panel"><h2>Contas bancárias</h2>${accountList()}${bankBalanceChart()}</section>${notesPanel()}`;}
function filters(){return `<div class="filters"><label>Mês <input id="monthFilter" type="month" value="${state.month}"></label><label>Visualização <select id="viewFilter"><option value="purchase" ${state.view==='purchase'?'selected':''}>Compras realizadas</option><option value="installments" ${state.view==='installments'?'selected':''}>Parcelas por mês</option></select></label></div>`;}
function expenseView(){return `<section class="panel"><h2>Gastos pendentes por categoria</h2><p class="muted">Mostra somente despesas pendentes do mês selecionado. Pagamentos concluídos permanecem no Extrato e já foram considerados no saldo bancário.</p>${filters()}<div class="big-number amount-expense">${money(monthExpense())}</div><p class="muted">${monthTransactions().length} lançamento(s)</p>${categoryChart()}</section><section class="panel"><h2>Movimentações ainda não pagas</h2>${transactionList(monthTransactions().filter(t=>t.type!=='expense'||t.status!=='paid'))}</section>`;}
function transactionList(list){return list.length?`<div class="transactions">${[...list].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(t=>`<div class="tx"><span class="tx-icon">${t.type==='income'?'↙':'↗'}</span><div class="tx-body"><strong>${esc(t.description)}</strong><small>${esc(t.date)} · ${esc(t.type==='income'?'Receita':catName(t.categoryId))} · ${esc(t.method||'')}${t.virtualRecurring?' · Previsto':t.recurringSourceId?' · Conta mensal':t.isRecurring?' · Conta mensal':''}</small></div><strong class="${t.type==='income'?'amount-income':'amount-expense'}">${t.type==='income'?'+':'−'} ${money(t.amountCents)}</strong><button class="icon-button" data-edit-tx="${t.id}" aria-label="Editar">⋯</button></div>`).join('')}</div>`:'<div class="empty">Nenhum lançamento cadastrado.</div>';}
function transactionsView(){return `<section class="panel"><div class="panel-title"><h2>Movimentações</h2><button data-new="expense">＋ Adicionar</button></div>${transactionList(state.transactions.filter(t=>!t.recurringSourceId || txMonth(t)===state.month))}</section>`;}

const BANKS = [
  ['nubank','Nubank','nubank','#820ad1'],
  ['bb','Banco do Brasil','bb','#f9dc00'],
  ['caixa','Caixa','caixa','#0066b3'],
  ['c6','C6 Bank','c6','#252525'],
  ['itau','Itaú','itau','#f58220']
];
function bankInfo(value){
  const v=String(value||'').trim().toLocaleLowerCase('pt-BR');
  if(v==='caixa econômica federal'||v==='caixa economica federal')return BANKS[2];
  return BANKS.find(b=>b[0]===v||b[1].toLocaleLowerCase('pt-BR')===v)||null;
}
function bankLogo(bank){
  const b=bankInfo(bank);
  if(!b)return `<span class="bank-mark bank-unknown" aria-hidden="true">▣</span>`;
  return `<img class="bank-mark bank-icon" src="./assets/banks/${b[2]}.png" alt="${esc(b[1])}" width="44" height="44" loading="lazy">`;
}
function bankBalanceChart(){
  if(!state.accounts.length)return '';
  const accounts=state.accounts.map(a=>({a,balance:accountBalance(a),bank:bankInfo(a.bank)}));
  const max=Math.max(1,...accounts.map(x=>Math.max(0,x.balance)));
  return `<div class="bank-balances"><h3>Saldos por conta</h3><p class="muted">Comparação dos saldos disponíveis. Valores negativos são identificados sem barra positiva.</p>${accounts.map(({a,balance,bank})=>`<div class="bank-balance-row"><div class="bank-balance-heading">${bankLogo(a.bank)}<span>${esc(a.name)} <small>· ${esc(bank?.[1]||a.bank||'Banco')}</small></span><strong>${money(balance)}</strong></div><div class="bank-balance-track"><div class="bank-balance-fill ${bank?'bank-'+bank[0]:'bank-other'}" style="width:${balance>0?Math.max(2,balance/max*100):0}%"></div></div></div>`).join('')}</div>`;
}
const NOTE_COLORS=[['amarelo','Amarelo'],['azul','Azul'],['rosa','Rosa'],['verde','Verde'],['lilas','Lilás'],['cinza','Cinza']];
function noteColor(value){return NOTE_COLORS.some(([key])=>key===value)?value:'amarelo';}
// Restrict note formatting to a small, safe HTML subset; no event handlers, links or inline styles.
function safeNoteHtml(html){
 const template=document.createElement('template');template.innerHTML=String(html||'');
 const allowed=new Set(['B','STRONG','I','EM','U','S','STRIKE','DIV','P','BR','UL','OL','LI']);
 function clean(node){
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
  if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
  const tag=node.tagName;const out=allowed.has(tag)?document.createElement(tag.toLowerCase()):document.createDocumentFragment();
  for(const child of [...node.childNodes])out.appendChild(clean(child));
  return out;
 }
 const result=document.createElement('div');for(const child of [...template.content.childNodes])result.appendChild(clean(child));
 return result.innerHTML;
}
function noteBodyHtml(n){return n.bodyHtml?safeNoteHtml(n.bodyHtml):esc(n.body||'').replace(/\n/g,'<br>');}
function notesPanel(){
 const items=[...state.notes].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
 return `<section class="panel notes-panel"><div class="panel-title"><h2>Minhas anotações</h2><button data-add-note aria-label="Nova anotação">＋ Nova anotação</button></div><p class="muted">Seus lembretes, tarefas e compras em destaque.</p>${items.length?`<div class="notes-list">${items.map((n,i)=>`<article class="note-line note-${noteColor(n.color||NOTE_COLORS[i%NOTE_COLORS.length][0])}"><div class="note-content"><strong>${esc(n.title||'Anotação')}</strong><div class="note-body">${noteBodyHtml(n)}</div></div><div class="note-actions"><button data-edit-note="${esc(n.id)}" aria-label="Editar anotação">Editar</button><button data-delete-note="${esc(n.id)}" aria-label="Excluir anotação">×</button></div></article>`).join('')}</div>`:'<div class="empty">Nenhuma anotação ainda. Toque em Nova anotação para começar.</div>'}</section>`;
}
function openNote(id){
 const old=state.notes.find(n=>n.id===id)||{};
 const color=noteColor(old.color||NOTE_COLORS[state.notes.length%NOTE_COLORS.length][0]);
 const overlay=modalShell(`<form class="dialog"><div class="dialog-head"><h2>${id?'Editar':'Nova'} anotação</h2><button type="button" class="close">×</button></div><div class="fields"><label>Título<input name="title" maxlength="100" value="${esc(old.title||'')}" required></label><div class="note-editor-group"><label id="note-editor-label">O que precisa lembrar?</label><div class="note-toolbar" role="toolbar" aria-label="Formatação da anotação"><button type="button" data-format="bold" title="Negrito" aria-label="Negrito"><b>N</b></button><button type="button" data-format="italic" title="Itálico" aria-label="Itálico"><i>I</i></button><button type="button" data-format="underline" title="Sublinhado" aria-label="Sublinhado"><u>S</u></button><button type="button" data-format="insertUnorderedList" title="Lista" aria-label="Lista">☷</button><button type="button" data-format="removeFormat" title="Limpar formatação" aria-label="Limpar formatação">Tx</button></div><div class="note-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="note-editor-label" data-placeholder="Escreva sua anotação aqui..."></div><small class="note-editor-hint">Selecione um trecho e escolha a formatação. Também é possível usar Ctrl+B e Ctrl+I.</small></div><fieldset class="note-color-field"><legend>Cor de fundo</legend><div class="note-color-options">${NOTE_COLORS.map(([key,label])=>`<label class="note-color-choice note-${key}" title="${label}"><input type="radio" name="color" value="${key}" ${color===key?'checked':''}><span>${label}</span></label>`).join('')}</div></fieldset></div><div class="dialog-actions"><button class="primary" type="submit">Salvar</button></div></form>`);
 overlay.querySelector('.close').onclick=()=>overlay.remove();
 const editor=overlay.querySelector('.note-editor');
 editor.innerHTML=noteBodyHtml(old);
 overlay.querySelectorAll('[data-format]').forEach(button=>{
  button.addEventListener('mousedown',e=>e.preventDefault());
  button.addEventListener('click',()=>{editor.focus();document.execCommand(button.dataset.format,false,null);});
 });
 editor.addEventListener('paste',e=>{e.preventDefault();const plain=e.clipboardData.getData('text/plain');document.execCommand('insertText',false,plain);});
 overlay.querySelector('form').onsubmit=async e=>{e.preventDefault();if(e.currentTarget.dataset.saving)return;e.currentTarget.dataset.saving='true';const f=new FormData(e.currentTarget);const body=editor.innerText.trim();if(!body){alert('Escreva uma anotação.');e.currentTarget.dataset.saving='';return;}if(body.length>3000){alert('A anotação deve ter até 3000 caracteres.');e.currentTarget.dataset.saving='';return;}try{await put('notes',{...old,id:old.id||uid(),title:String(f.get('title')).trim(),body,bodyHtml:safeNoteHtml(editor.innerHTML),color:noteColor(f.get('color')),createdAt:old.createdAt||now(),updatedAt:now()});await refresh();overlay.remove();toast('Anotação salva.');}catch(error){console.error(error);alert('Não foi possível salvar a anotação.');e.currentTarget.dataset.saving='';}};
}

function accountList(){return state.accounts.length?state.accounts.map(a=>`<div class="account-line">${bankLogo(a.bank)}<div><strong>${esc(a.name)}</strong><small>${esc(bankInfo(a.bank)?.[1]||a.bank||'Conta bancária')}</small></div><strong>${money(accountBalance(a))}</strong><button class="icon-button" data-edit-account="${a.id}">⋯</button></div>`).join(''):'<div class="empty">Cadastre sua primeira conta para iniciar.</div>';}
function accountsView(){return `<section class="panel"><div class="panel-title"><h2>Minhas contas</h2><button data-new="account">＋ Nova conta</button></div>${accountList()}</section><section class="panel"><div class="panel-title"><h2>Categorias</h2><button data-new="category">＋ Nova categoria</button></div><p class="muted">Nenhuma categoria é criada automaticamente. Crie suas próprias categorias ao cadastrar despesas.</p>${state.categories.map(c=>`<div class="account-line"><div><span class="dot" style="background:${c.color}"></span> <strong>${esc(c.name)}</strong></div><button class="icon-button" data-edit-category="${c.id}">⋯</button></div>`).join('')}<div class="category-actions"><button class="danger" id="clearCategories">Limpar categorias existentes</button></div></section><section class="panel"><div class="panel-title"><h2>Dados do aplicativo</h2></div><p class="muted">Reiniciar os dados financeiros de teste deste usuário no dispositivo e no Firebase. Esta ação não pode ser desfeita.</p><button class="danger" id="resetFinancialData">Apagar todos os dados financeiros</button></section>`;}
function render(){const app=document.querySelector('#app');if(!app)return;if(!state.accessGranted){app.innerHTML=`<div class="login"><div class="brand-icon">N</div><h1>Nexo</h1><p>Seu dinheiro, em perspectiva.</p><button class="primary" id="accountBtn">Entrar com minha conta</button><small>Seu login Firebase existente continua válido.</small></div>`;bind();return;}const tabs=[['home','Início','⌂'],['expenses','Gastos','▥'],['recurring','Mensais','↻'],['transactions','Extrato','⇄'],['accounts','Contas','▤']];app.innerHTML=`<header class="top"><div class="brand"><span class="brand-icon">N</span><div><strong>Nexo</strong><small>Controle financeiro</small></div></div>${syncBadge()}</header><main>${state.tab==='home'?homeView():state.tab==='expenses'?expenseView():state.tab==='transactions'?transactionsView():state.tab==='recurring'?`${filters()}${recurringPanel()}`:accountsView()}</main><nav class="bottom">${tabs.map(([key,label,icon])=>`<button data-tab="${key}" class="${state.tab===key?'selected':''}"><span>${icon}</span>${label}</button>`).join('')}</nav><button class="fab" data-new="expense" aria-label="Novo lançamento">＋</button>`;bind();}
function bind(){document.querySelector('[data-add-note]')?.addEventListener('click',()=>openNote());document.querySelectorAll('[data-edit-note]').forEach(b=>b.addEventListener('click',()=>openNote(b.dataset.editNote)));document.querySelectorAll('[data-delete-note]').forEach(b=>b.addEventListener('click',async()=>{await del('notes',b.dataset.deleteNote);await refresh();toast('Anotação excluída.')}));document.querySelector('#clearCategories')?.addEventListener('click',clearExistingCategories);document.querySelector('#resetFinancialData')?.addEventListener('click',resetFinancialData);document.querySelector('#accountBtn')?.addEventListener('click',accountModal);document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render()});document.querySelectorAll('[data-new]').forEach(b=>b.onclick=()=>openForm(b.dataset.new));document.querySelectorAll('[data-edit-account]').forEach(b=>b.onclick=()=>openForm('account',b.dataset.editAccount));document.querySelectorAll('[data-edit-category]').forEach(b=>b.onclick=()=>openForm('category',b.dataset.editCategory));document.querySelectorAll('[data-edit-tx]').forEach(b=>b.onclick=()=>openForm('transaction',b.dataset.editTx));document.querySelector('#monthFilter')?.addEventListener('change',e=>{state.month=e.target.value;render()});document.querySelector('#viewFilter')?.addEventListener('change',e=>{state.view=e.target.value;render()});document.querySelectorAll('[data-category-filter]').forEach(b=>b.onclick=()=>{state.tab='transactions';render();document.querySelector('.transactions')?.scrollIntoView({behavior:'smooth'});toast('Categoria: '+catName(b.dataset.categoryFilter))});}


let clearingCategories=false;
async function clearExistingCategories(){
  if(clearingCategories)return;
  if(!navigator.onLine||!cloud.initialized||!state.user||state.user.uid!==AUTHORIZED_UID){
    alert('Conecte-se ao Firebase para remover as categorias antigas do dispositivo e da nuvem.');return;
  }
  if(!confirm('Remover TODAS as categorias existentes? Os lançamentos financeiros serão mantidos, mas ficarão sem categoria.'))return;
  clearingCategories=true;
  clearTimeout(syncTimer);
  stopCloudListeners();
  try{
    // Ensure queued writes cannot recreate removed categories after cloud deletion.
    await flushSyncQueue(true);
    if(state.syncStatus==='error')throw new Error('Sincronização pendente');
    const snapshot=await cloud.api.getDocs(userCollection('categories'));
    for(const doc of snapshot.docs)await cloud.api.deleteDoc(cloud.api.doc(cloud.db,'users',state.user.uid,'categories',doc.id));
    for(const t of await all('transactions')){
      if(t.categoryId)await put('transactions',{...t,categoryId:'',updatedAt:now()});
    }
    await clearLocal('categories');
    await flushSyncQueue(true);
    if(state.syncStatus==='error')throw new Error('Falha ao sincronizar lançamentos reclassificados');
    await refresh();toast('Categorias antigas removidas. Crie suas próprias categorias.');
  }catch(error){
    console.error('Falha ao limpar categorias',error);
    alert('A limpeza não foi concluída. Confira a sincronização antes de tentar novamente.');
    await refresh();
  }finally{clearingCategories=false;if(cloud.initialized&&state.user)startCloudListeners();}
}

let resettingFinancialData=false;
async function resetFinancialData(){
  if(resettingFinancialData)return;
  if(!navigator.onLine||!cloud.initialized||!state.user||state.user.uid!==AUTHORIZED_UID){
    alert('Para apagar todos os dados com segurança, conecte-se à internet e aguarde o Firebase sincronizar.');return;
  }
  const confirmation=prompt('Esta operação apaga definitivamente contas, dívidas, lançamentos, categorias e cartões de teste do Firebase e deste dispositivo. Digite APAGAR TUDO para continuar:');
  if(confirmation!=='APAGAR TUDO')return;
  resettingFinancialData=true;
  clearTimeout(syncTimer);
  stopCloudListeners();
  state.syncStatus='syncing';
  state.syncMessage='Apagando dados financeiros...';
  render();
  try{
    // Pending writes must not resurrect records after the reset.
    await clearLocal('syncQueue');
    for(const store of STORES){
      const snapshot=await cloud.api.getDocs(userCollection(store));
      for(const document of snapshot.docs){
        await cloud.api.deleteDoc(cloud.api.doc(cloud.db,'users',state.user.uid,store,document.id));
      }
    }
    for(const store of STORES)await clearLocal(store);
    await clearLocal('syncQueue');
    await refresh({renderNow:false});
    state.tab='home';state.syncStatus='synced';state.syncMessage='Dados financeiros reiniciados';
    render();toast('Dados financeiros apagados.');
  }catch(error){
    console.error('Erro ao reiniciar dados',error);
    state.syncStatus='error';state.syncMessage='Falha ao apagar: confira a conexão';
    alert('A limpeza não foi concluída. Alguns dados podem ter sido removidos. Não cadastre novos lançamentos até verificar a sincronização.');
    await refresh();
  }finally{
    resettingFinancialData=false;
    if(cloud.initialized&&state.user)startCloudListeners();
  }
}

function field(label,name,value='',type='text',extra=''){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function select(label,name,options,value){return `<label>${label}<select name="${name}">${options.map(([id,title])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;}
function openForm(kind,id){const store=kind==='account'?'accounts':kind==='category'?'categories':'transactions';const existing=state[store].find(r=>r.id===id);const virtual=store==='transactions'&&!existing&&id?.includes('__')?monthlyInstances(id.split('__').pop()).find(r=>r.id===id):null;const old=existing||virtual||{};let content='';if(kind==='account'){content=field('Nome da conta','name',old.name,'text','required')+select('Banco','bank',BANKS.map(b=>[b[0],b[1]]),bankInfo(old.bank)?.[0]||'nubank')+field('Saldo inicial (R$)','opening',old.id?(old.openingCents/100).toFixed(2):'0.00','number','min="0" step="0.01" required')+field('Data de início','startDate',old.startDate||today(),'date','required');}else if(kind==='category'){content=field('Nome da categoria','name',old.name,'text','required')+field('Cor','color',old.color||'#3b82f6','color');}else{const type=kind==='income'?'income':kind==='expense'?'expense':old.type||'expense';content=select('Tipo','type',[['expense','Despesa'],['income','Receita']],type)+field('Descrição','description',old.description,'text','required')+field('Valor (R$)','amount',old.id?(old.amountCents/100).toFixed(2):'','number','min="0.01" step="0.01" required')+field('Data da movimentação','date',old.date||today(),'date','required')+select('Situação','status',[['paid','Pago / recebido'],['pending','Pendente']],old.status||'pending')+select('Forma de pagamento','method',[['debit','Débito'],['pix','Pix'],['boleto','Boleto'],['cash','Dinheiro']],old.method||'pix')+select('Conta bancária','accountId',[['','Selecione uma conta'],...state.accounts.map(a=>[a.id,a.name])],old.accountId||'')+select('Categoria','categoryId',[['','Sem categoria'],...state.categories.map(c=>[c.id,c.name])],old.categoryId||'')+field('Criar categoria agora (opcional)','newCategoryName','','text','maxlength="60" placeholder="Ex.: Empréstimos"')+field('Cor da nova categoria','newCategoryColor','#3b82f6','color')+field('Vencimento (opcional)','dueDate',old.dueDate||'' ,'date')+select('Repetição','recurrence',[['none','Não repetir'],['monthly','Conta mensal — repetir automaticamente']],old.isRecurring?'monthly':'none')+field('Fim da recorrência (opcional)','recurrenceEnd',old.recurrenceEnd||'','date')+field('Número de meses (opcional, para empréstimos)','recurrenceCount',old.recurrenceCount||'','number','min="1" step="1"');}
const overlay=modalShell(`<form class="dialog"><div class="dialog-head"><h2>${id?'Editar':'Adicionar'} ${kind==='account'?'conta':kind==='category'?'categoria':'lançamento'}</h2><button type="button" class="close" aria-label="Fechar">×</button></div><div class="fields">${content}</div><div class="dialog-actions">${id?'<button type="button" class="danger" id="deleteRecord">Excluir</button>':''}<button class="primary" type="submit">Salvar</button></div></form>`);overlay.querySelector('.close').onclick=()=>overlay.remove();overlay.querySelector('#deleteRecord')?.addEventListener('click',async()=>{if(store==='accounts'&&state.transactions.some(t=>t.accountId===id)){alert('Esta conta possui movimentações. Não é possível excluí-la.');return}if(store==='categories'){for(const t of state.transactions.filter(t=>t.categoryId===id)){await put('transactions',{...t,categoryId:'',updatedAt:now()});}}if(virtual){await put('transactions',{...virtual,status:'cancelled',virtualRecurring:false,updatedAt:now()});}else{await del(store,id);}await refresh();overlay.remove();toast('Registro excluído.');});overlay.querySelector('form').onsubmit=async e=>{e.preventDefault();if(e.currentTarget.dataset.saving==='true')return;e.currentTarget.dataset.saving='true';const f=new FormData(e.target),v=Object.fromEntries(f.entries());const record={...old,id:virtual?virtual.id:(id||uid()),createdAt:old.createdAt||now(),updatedAt:now()};if(kind==='account'){if(!v.name.trim()){e.currentTarget.dataset.saving='false';return;}Object.assign(record,{name:v.name.trim(),bank:v.bank.trim(),openingCents:cents(v.opening),startDate:v.startDate}); }else if(kind==='category'){const name=v.name.trim();if(!name){e.currentTarget.dataset.saving='false';return;}const duplicate=state.categories.find(c=>c.id!==record.id&&c.name.trim().toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));if(duplicate){alert('Já existe uma categoria com esse nome.');e.currentTarget.dataset.saving='false';return;}Object.assign(record,{name,color:v.color});}else{if(!state.accounts.length){alert('Cadastre uma conta bancária antes de registrar movimentações.');e.currentTarget.dataset.saving='false';return}if(v.method==='boleto'&&!v.dueDate){alert('Informe a data de vencimento do boleto.');e.currentTarget.dataset.saving='false';return}if(!v.accountId){alert('Selecione a conta bancária.');e.currentTarget.dataset.saving='false';return}let categoryId=v.categoryId;const newName=(v.newCategoryName||'').trim();if(newName){const existingCategory=state.categories.find(c=>c.name.trim().toLocaleLowerCase('pt-BR')===newName.toLocaleLowerCase('pt-BR'));if(existingCategory){categoryId=existingCategory.id;}else{const category={id:uid(),name:newName,color:v.newCategoryColor||'#3b82f6',createdAt:now(),updatedAt:now()};await put('categories',category);categoryId=category.id;}}Object.assign(record,{type:v.type,description:v.description.trim(),amountCents:cents(v.amount),date:v.date,status:v.status,method:v.method,accountId:v.accountId,cardId:'',categoryId,dueDate:v.dueDate,isRecurring:!virtual&&v.recurrence==='monthly',recurrence:!virtual?v.recurrence:'none',recurrenceEnd:!virtual?v.recurrenceEnd:'',recurrenceCount:!virtual?Number(v.recurrenceCount||0):0,recurringSourceId:virtual?virtual.recurringSourceId:(old.recurringSourceId||''),occurrenceMonth:(virtual||old.recurringSourceId)?(old.occurrenceMonth||id?.split('__').pop()||old.date?.slice(0,7)):''});delete record.virtualRecurring;}await put(store,record);await refresh();overlay.remove();toast('Registro salvo.');};}
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
  const config = FIREBASE_CONFIG;
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

  for (const store of STORES) {
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
  if(resettingFinancialData)return;
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
  const config = FIREBASE_CONFIG;
  state.firebaseConfigured = Boolean(config);
  const verifiedUid = localStorage.getItem(VERIFIED_UID_KEY);
  state.accessGranted = Boolean(!navigator.onLine && verifiedUid === AUTHORIZED_UID);
  await refresh();
  initFirebase();
})();
