// ==========================================
// SalesFlow Pro - Main Application Logic (Supabase Version)
// ==========================================

// ----------------------------------------------------
// ⚠️ お客様へのお願い ⚠️
// 以下の2行に、Supabaseで作成したプロジェクトの「URL」と「anon key」を貼り付けてください。
// ----------------------------------------------------
var SUPABASE_URL = 'https://gpkmgcbmmefsjoqbgidi.supabase.co';
sb_secret_IkkzkUoDuE47GAQ_T6lqlw_TIIqKhPa
var supabase = null;
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && typeof window.supabase !== 'undefined') {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// --- Auth Users Configuration (Initial Setup Only) ---
var USERS = {
  'aizu':     { pw: 'yanagawa', role: '管理者', name: '合津' },
  'hirakawa': { pw: 'yanagawa', role: '営業',   name: '平川' },
  'esaki':    { pw: 'yanagawa', role: '営業',   name: '江崎' },
  'matsuo':   { pw: 'yanagaw',  role: '内務',   name: '松尾' }
};

// --- Global State ---
var currentUser = null;
var editingProjectId = null;
var chartInstance = null;
var STEPS_LABELS = ['見積依頼', '見積作成', '見積提出(商談)', '受注', '発注', '受注票作成'];

// ==========================================
// AUTH & INITIALIZATION
// ==========================================

async function handleLogin(e) {
  e.preventDefault();
  var errorBox = document.getElementById('login-error');

  if (!supabase) {
    errorBox.textContent = '【システムエラー】app.js に Supabase の URL と KEY を設定してください。';
    errorBox.style.display = 'block';
    return false;
  }

  var idInput = document.getElementById('login-id').value.trim().toLowerCase();
  var pwInput = document.getElementById('password').value;
  var userConfig = USERS[idInput];

  if (!userConfig || userConfig.pw !== pwInput) {
    errorBox.textContent = 'IDまたはパスワードが間違っています。';
    errorBox.style.display = 'block';
    return false;
  }

  errorBox.style.display = 'none';
  var btn = e.target.querySelector('button');
  var originalText = btn.textContent;
  btn.textContent = '通信中...';
  btn.disabled = true;

  var dummyEmail = idInput + '@salesflow.local';

  try {
    // 1. サインイン試行
    var { data, error } = await supabase.auth.signInWithPassword({
      email: dummyEmail,
      password: pwInput
    });

    if (error) {
      // 2. ユーザーが見つからない場合は、初回とみなして自動サインアップ
      if (error.message.includes('Invalid login') || error.message.includes('not found')) {
        var { data: regData, error: regError } = await supabase.auth.signUp({
          email: dummyEmail,
          password: pwInput
        });

        if (regError) {
          throw new Error('初期登録失敗: Supabaseの「Confirm email」がOFFになっているか確認してください。詳細: ' + regError.message);
        }

        // プロフィールをCustom Tableに保存
        await supabase.from('profiles').insert([{
          id: regData.user.id,
          user_id: idInput,
          name: userConfig.name,
          role: userConfig.role
        }]);
      } else {
        throw error;
      }
    }

    // 3. プロフィール情報を取得
    var { data: profile, error: profError } = await supabase.from('profiles').select('*').eq('user_id', idInput).single();
    if (profError || !profile) {
      throw new Error('プロフィール情報の取得に失敗しました。');
    }

    currentUser = { id: profile.user_id, name: profile.name, role: profile.role, uuid: profile.id };
    localStorage.setItem('salesflow_user', JSON.stringify(currentUser));
    showApp();
  } catch (err) {
    console.error(err);
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
  return false;
}

async function handleLogout() {
  if (supabase) await supabase.auth.signOut();
  currentUser = null;
  localStorage.removeItem('salesflow_user');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-id').value = '';
  document.getElementById('password').value = '';
  document.getElementById('login-error').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').classList.remove('hidden');
  
  var badge = document.getElementById('user-role');
  badge.textContent = currentUser.name + ' (' + currentUser.role + ')';
  
  if (currentUser.role === '営業') badge.style.backgroundColor = '#3b82f6';
  else if (currentUser.role === '内務') badge.style.backgroundColor = '#10b981';
  else badge.style.backgroundColor = '#8b5cf6'; // 管理者 = purple

  loadDataAndRender();
}

// ==========================================
// DATA FETCHING & RENDERING
// ==========================================

async function loadDataAndRender() {
  if (!supabase) return;

  try {
    // 案件の取得 (ロールによる絞り込み)
    var query = supabase.from('projects').select('*').order('updated_at', { ascending: false });
    if (currentUser.role === '営業') {
      query = query.eq('sales_rep_id', currentUser.id);
    }
    var { data: projects } = await query;

    // 活動履歴の取得 (最新10件)
    var { data: activities } = await supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(10);

    renderDashboard(projects || [], activities || []);
    renderProjectsList(projects || []);

  } catch (err) {
    showToast('データの読み込みに失敗しました', true);
    console.error(err);
  }
}

function renderDashboard(projects, activities) {
  var activeCount = 0;
  for (var i = 0; i < projects.length; i++) {
    if (projects[i].steps.indexOf(false) !== -1) activeCount++;
  }
  document.getElementById('active-projects-count').textContent = activeCount;

  var wonCount = 0;
  for (var i = 0; i < projects.length; i++) {
    if (projects[i].steps[3] === true) wonCount++;
  }
  var winRate = projects.length ? Math.round((wonCount / projects.length) * 100) : 0;
  document.getElementById('win-rate').textContent = winRate + '%';

  var pendingCount = 0;
  for (var i = 0; i < projects.length; i++) {
    var nextStep = projects[i].steps.indexOf(false);
    if (nextStep !== -1) {
      var salesSteps = [0, 2, 3];
      var naimuSteps = [1, 4, 5];
      if (currentUser.role === '管理者') pendingCount++;
      else if (currentUser.role === '営業' && salesSteps.indexOf(nextStep) !== -1) pendingCount++;
      else if (currentUser.role === '内務' && naimuSteps.indexOf(nextStep) !== -1) pendingCount++;
    }
  }
  document.getElementById('pending-tasks-count').textContent = pendingCount;

  var actFeed = document.getElementById('activity-feed');
  if (activities.length === 0) {
    actFeed.innerHTML = '<p style="color: var(--text-secondary);">まだ活動履歴はありません</p>';
  } else {
    var html = '';
    for (var i = 0; i < activities.length; i++) {
      html += '<div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--surface-border);padding-bottom:0.5rem;">';
      html += '<span>' + activities[i].text + '</span>';
      html += '<span style="color:var(--text-secondary);font-size:0.75rem;white-space:nowrap;margin-left:0.5rem;">' + activities[i].time + '</span>';
      html += '</div>';
    }
    actFeed.innerHTML = html;
  }

  // レイアウト確定後にグラフ描画
  setTimeout(renderChart, 100);
}

// 案件リストの表示
window.projectsData = []; // To hold state for modals
function renderProjectsList(projects) {
  window.projectsData = projects;
  var container = document.getElementById('project-list-container');
  container.innerHTML = '';

  if (projects.length === 0) {
    container.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 2rem;">案件がありません。「＋ 新規案件」ボタンから作成してください。</p>';
    return;
  }

  for (var i = 0; i < projects.length; i++) {
    var proj = projects[i];
    var item = document.createElement('div');
    item.className = 'project-item fade-in';

    var stepsHtml = '';
    for (var s = 0; s < STEPS_LABELS.length; s++) {
      var isChecked = proj.steps[s];
      var isSalesStep = (s === 0 || s === 2 || s === 3);
      var canCheck = false;
      if (currentUser.role === '管理者') canCheck = true;
      else if (currentUser.role === '営業' && isSalesStep) canCheck = true;
      else if (currentUser.role === '内務' && !isSalesStep) canCheck = true;

      if (s > 0) stepsHtml += '<div class="step-connector"></div>';
      stepsHtml += '<div class="step">';
      stepsHtml += '<div class="step-checkbox ' + (isChecked ? 'checked' : '') + '" ';
      stepsHtml += 'onclick="toggleStep(\'' + proj.id + '\',' + s + ')" ';
      stepsHtml += 'style="cursor:' + (canCheck ? 'pointer' : 'not-allowed') + ';opacity:' + (canCheck ? '1' : '0.5') + '">';
      stepsHtml += isChecked ? '✓' : '';
      stepsHtml += '</div><span>' + STEPS_LABELS[s] + '</span></div>';
    }

    var repBadge = (currentUser.role !== '営業') 
      ? '<span style="background:#e2e8f0;color:#475569;padding:2px 8px;border-radius:4px;font-size:0.75rem;margin-left:6px;">担当: ' + proj.sales_rep_name + '</span>' 
      : '';

    var dateStr = new Date(proj.updated_at).toLocaleString('ja-JP');
    item.innerHTML = '' +
      '<div class="project-info">' +
        '<h4 onclick="openProject(\'' + proj.id + '\')">' +
          proj.customer + repBadge +
          '<span style="font-weight:normal;font-size:0.8rem;color:var(--text-secondary);margin-left:8px;">(' + (proj.quote_no || 'No未定') + ') 確度: ' + proj.probability + '</span>' +
        '</h4>' +
        '<div class="project-meta">顧客No: ' + (proj.customer_no || '-') + ' ｜ 最終更新: ' + dateStr + '</div>' +
      '</div>' +
      '<div class="flow-steps">' + stepsHtml + '</div>';

    container.appendChild(item);
  }
}

// ==========================================
// INTERACTIONS & SUPABASE WRITES
// ==========================================

async function toggleStep(projectId, stepIndex) {
  var isSalesStep = (stepIndex === 0 || stepIndex === 2 || stepIndex === 3);
  if (currentUser.role !== '管理者') {
    if (currentUser.role === '営業' && !isSalesStep) return showToast('このステップは内務担当が更新します', true);
    if (currentUser.role === '内務' && isSalesStep) return showToast('このステップは営業担当が更新します', true);
  }

  var proj = window.projectsData.find(function(p) { return p.id === projectId; });
  if (!proj) return;

  proj.steps[stepIndex] = !proj.steps[stepIndex];
  
  try {
    // データベース更新
    await supabase.from('projects')
      .update({ steps: proj.steps, updated_at: new Date().toISOString() })
      .eq('id', projectId);

    if (proj.steps[stepIndex]) {
      var actText = '「' + proj.customer + '」の' + STEPS_LABELS[stepIndex] + 'が完了 (' + currentUser.name + ')';
      await supabase.from('activities').insert([{
        id: 'a' + Date.now(),
        text: actText,
        time: 'たった今'
      }]);
    }
    
    // UIを再描画
    loadDataAndRender();
  } catch (err) {
    showToast('更新エラー', true);
    console.error(err);
  }
}

// --- Modal ---

function handleNewProject() {
  if (currentUser.role === '内務') return showToast('新規案件の作成は営業・管理者のみ可能です', true);
  openProject(null);
}

function openProject(id) {
  editingProjectId = id;
  var proj = id ? window.projectsData.find(function(p){ return p.id === id; }) : null;
  if (!proj) proj = { customer: '', customer_no: '', quote_no: '', probability: 'C', chats: [], files: [] };

  document.getElementById('modal-title').textContent = id ? '案件詳細・編集' : '新規案件作成';
  document.getElementById('proj-customer').value = proj.customer || '';
  document.getElementById('proj-customer-no').value = proj.customer_no || '';
  document.getElementById('proj-quote-no').value = proj.quote_no || '';
  document.getElementById('proj-probability').value = proj.probability || 'C';

  renderChats(proj.chats || []);
  renderFiles(proj.files || []);

  document.getElementById('project-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('project-modal').classList.add('hidden');
}

async function saveProject() {
  var customer = document.getElementById('proj-customer').value.trim();
  if (!customer) return showToast('顧客名を入力してください', true);

  var newData = {
    customer: customer,
    customer_no: document.getElementById('proj-customer-no').value.trim(),
    quote_no: document.getElementById('proj-quote-no').value.trim(),
    probability: document.getElementById('proj-probability').value,
    updated_at: new Date().toISOString()
  };

  try {
    if (editingProjectId) {
      await supabase.from('projects').update(newData).eq('id', editingProjectId);
    } else {
      var newId = 'p' + Date.now();
      newData.id = newId;
      newData.sales_rep_id = currentUser.id;
      newData.sales_rep_name = currentUser.name;
      newData.steps = [false, false, false, false, false, false];
      newData.chats = [];
      newData.files = [];
      
      await supabase.from('projects').insert([newData]);
      await supabase.from('activities').insert([{
        id: 'a' + Date.now(),
        text: '新規案件「' + newData.customer + '」が作成されました (' + currentUser.name + ')',
        time: 'たった今'
      }]);
    }
    
    closeModal();
    showToast('保存しました ✓');
    loadDataAndRender();
  } catch(err) {
    showToast('保存に失敗しました', true);
    console.error(err);
  }
}

// --- Chat & Files ---

async function sendChat() {
  var input = document.getElementById('chat-input');
  var text = input.value.trim();
  if (!text || !editingProjectId) return;

  var proj = window.projectsData.find(function(p) { return p.id === editingProjectId; });
  if (!proj) return;

  var newChat = {
    user: currentUser.name + ' (' + currentUser.role + ')',
    text: text,
    time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  };
  var updatedChats = proj.chats ? proj.chats.concat([newChat]) : [newChat];

  try {
    await supabase.from('projects').update({ chats: updatedChats }).eq('id', editingProjectId);
    proj.chats = updatedChats;
    renderChats(updatedChats);
    input.value = '';
  } catch(err) {
    showToast('チャットの送信に失敗しました', true);
  }
}

function renderChats(chats) {
  var container = document.getElementById('chat-messages');
  if (!chats || chats.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary);">メモはまだありません</p>';
    return;
  }
  var html = '';
  for (var i = 0; i < chats.length; i++) {
    var c = chats[i];
    html += '<div>';
    html += '<span style="font-weight:600;color:var(--accent-color);">' + c.user + '</span>';
    html += '<span style="font-size:0.75rem;color:var(--text-secondary);margin-left:0.5rem;">' + c.time + '</span>';
    html += '<p style="margin-top:0.15rem;">' + c.text + '</p>';
    html += '</div>';
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

// File logic (Mocking the storage part for simplicity without Storage Buckets)
async function handleFiles(files) {
  if (!files || !files.length || !editingProjectId) return;
  var file = files[0];
  if (file.type !== 'application/pdf') return showToast('PDFファイルのみ対応しています', true);

  var proj = window.projectsData.find(function(p) { return p.id === editingProjectId; });
  if (!proj) return;

  var newFile = { name: file.name, size: (file.size / 1024 / 1024).toFixed(2) + 'MB' };
  var updatedFiles = proj.files ? proj.files.concat([newFile]) : [newFile];

  try {
    await supabase.from('projects').update({ files: updatedFiles }).eq('id', editingProjectId);
    proj.files = updatedFiles;
    renderFiles(updatedFiles);
    showToast(file.name + ' をアップロードしました');
  } catch(err) {
    showToast('ファイルのアップロードに失敗しました', true);
  }
}

// (The rest of file DOM setup and mail generation remains exactly the same)
(function setupDropzone() {
  document.addEventListener('DOMContentLoaded', function() {
    var dz = document.getElementById('dropzone');
    var fi = document.getElementById('file-input');
    if (!dz || !fi) return;
    dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', function() { dz.classList.remove('dragover'); });
    dz.addEventListener('drop', function(e) { e.preventDefault(); dz.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    dz.addEventListener('click', function() { fi.click(); });
    fi.addEventListener('change', function(e) { handleFiles(e.target.files); });
  });
})();

function renderFiles(files) {
  var container = document.getElementById('file-list');
  if (!files || files.length === 0) {
    container.innerHTML = '';
    return;
  }
  var html = '';
  for (var i = 0; i < files.length; i++) {
    html += '<div style="display:flex;align-items:center;gap:0.5rem;background:rgba(0,0,0,0.04);padding:0.5rem 0.75rem;border-radius:6px;">';
    html += '📄 <span>' + files[i].name + ' (' + files[i].size + ')</span></div>';
  }
  container.innerHTML = html;
}

function generateFollowMail() {
  var customer = document.getElementById('proj-customer').value || 'お客様';
  var prob = document.getElementById('proj-probability').value;
  var text = customer + ' ご担当者様\n\nお世話になっております。\n先日は貴重なお時間をいただき、誠にありがとうございました。\n\n';
  if (prob === 'A') text += 'ご提示いたしましたお見積り内容につきまして、前向きにご検討いただいているとのこと、大変嬉しく存じます。\nご不明点や追加のご要望がございましたら、いつでもお気軽にお申し付けください。\n引き続き、何卒よろしくお願い申し上げます。';
  else if (prob === 'B') text += 'お打ち合わせにて頂戴しましたご質問事項について、追って詳細資料をお送りいたします。\nご検討の材料としてお役立ていただけますと幸いです。\n引き続き、よろしくお願いいたします。';
  else text += 'サービスに関する資料を添付いたしますので、社内でのご検討にお役立てください。\nまた情報交換などでお役に立てる機会がございましたら、お声がけくださいませ。\nよろしくお願い申し上げます。';

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() { showToast('メール文面をコピーしました ✓'); }).catch(function() { fallbackCopy(text); });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  showToast('メール文面をコピーしました ✓');
}

function showToast(msg, isError) {
  var toast = document.getElementById('toast');
  toast.textContent = msg; toast.style.background = isError ? '#ef4444' : '#10b981'; toast.classList.remove('hidden');
  clearTimeout(window._toastTimer); window._toastTimer = setTimeout(function() { toast.classList.add('hidden'); }, 3000);
}

// Chart Render (Kept simple, not tied to real data yet to save complexity, but size is fixed)
function renderChart() {
  var canvas = document.getElementById('performanceChart');
  if (!canvas || canvas.offsetParent === null) return;
  var ctx = canvas.getContext('2d');
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var textColor = isDark ? '#f1f5f9' : '#1e293b';
  
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  canvas.style.width = '100%'; canvas.style.height = '160px';

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['1月', '2月', '3月', '4月', '5月', '6月'],
      datasets: [
        { label: '商談数', data: [12, 19, 15, 22, 20, 14], backgroundColor: '#3b82f6', borderRadius: 6 },
        { label: '受注数', data: [8, 10, 9, 15, 12, 7], backgroundColor: '#10b981', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor, font: { family: 'Inter' } } } },
      scales: {
        x: { ticks: { color: textColor }, grid: { display: false } },
        y: { ticks: { color: textColor }, grid: { color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' } }
      }
    }
  });
}

// ==========================================
// THEME & INITIALIZATION
// ==========================================
function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme');
  var next = (current === 'light') ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('salesflow_theme', next);
  document.getElementById('theme-toggle').textContent = (next === 'light') ? '🌙' : '☀️';
  if (chartInstance) renderChart();
}

(function init() {
  var savedTheme = localStorage.getItem('salesflow_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.textContent = (savedTheme === 'light') ? '🌙' : '☀️';

  try {
    var savedUser = localStorage.getItem('salesflow_user');
    if (savedUser) {
      var parsed = JSON.parse(savedUser);
      if (parsed.id && USERS[parsed.id]) {
        currentUser = parsed;
        showApp();
      } else {
        localStorage.removeItem('salesflow_user');
      }
    }
  } catch (e) {
    localStorage.removeItem('salesflow_user');
  }
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js').catch(function() {});
  });
}
