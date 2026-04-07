// 投稿管理 - 認証付きAPI連携
// API_BASE: <meta name="api-base" content="..."> で上書き可能
const META_API = document.querySelector('meta[name="api-base"]');
const API_BASE = (META_API && META_API.content) || `http://${location.hostname||'localhost'}:3001`;
const API_POSTS  = `${API_BASE}/posts`;
const API_UPLOAD = `${API_BASE}/upload`;
const API_CHECK  = `${API_BASE}/auth/check`;
const FILE_BASE  = API_BASE; // /uploads/xxx を返すための基点

const CATEGORIES = {
  privacy:'個人情報保護方針', important:'重要事項説明書',
  dx:'訪問看護医療DX', info:'情報活用加算', news:'お知らせ'
};

function escapeHtml(s){return (s||'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function authHeader(){
  const t = sessionStorage.getItem('one2one_auth');
  return t ? { Authorization: 'Basic ' + t } : {};
}

// ---------- 公開API ----------
async function fetchPosts(){
  try{ const r = await fetch(API_POSTS); if(!r.ok) throw 0; return await r.json(); }
  catch(e){ console.error('API取得失敗',e); return []; }
}

// ---------- 認証API ----------
async function adminLogin(user, pass){
  const token = btoa(`${user}:${pass}`);
  const r = await fetch(API_CHECK, { headers: { Authorization: 'Basic ' + token } });
  if (!r.ok) throw new Error('ユーザー名またはパスワードが違います');
  sessionStorage.setItem('one2one_auth', token);
  return true;
}
function adminLogout(){ sessionStorage.removeItem('one2one_auth'); location.reload(); }
function isLoggedIn(){ return !!sessionStorage.getItem('one2one_auth'); }

async function createPost(p){
  return apiJson(API_POSTS, 'POST', p);
}
async function updatePost(id, p){
  return apiJson(`${API_POSTS}/${id}`, 'PUT', p);
}
async function removePost(id){
  return apiJson(`${API_POSTS}/${id}`, 'DELETE');
}
async function apiJson(url, method, body){
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: body ? JSON.stringify(body) : undefined
  });
  if (r.status === 401) { sessionStorage.removeItem('one2one_auth'); location.reload(); throw new Error('認証エラー'); }
  if (!r.ok) throw new Error('API失敗: '+r.status);
  return r.json();
}
async function uploadFile(file){
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(API_UPLOAD, { method:'POST', headers: authHeader(), body: fd });
  if (!r.ok) {
    const e = await r.json().catch(()=>({error:'失敗'}));
    throw new Error(e.error || 'アップロード失敗');
  }
  return r.json();
}

// ---------- トップページ表示 ----------
async function renderPostsTo(targetId){
  const el = document.getElementById(targetId); if (!el) return;
  el.innerHTML = '<p style="text-align:center;color:#888">読み込み中...</p>';
  const list = (await fetchPosts()).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if (!list.length) { el.innerHTML = '<p style="text-align:center;color:#888">現在お知らせはありません</p>'; return; }
  el.innerHTML = list.map(p => `
    <article class="post-card reveal" data-id="${p.id}">
      <span class="post-cat post-cat-${p.category}">${CATEGORIES[p.category]||'お知らせ'}</span>
      <time class="post-date">${p.date||''}</time>
      <h3 class="post-title">${escapeHtml(p.title)}</h3>
      <button class="post-toggle" onclick="togglePost('${p.id}')">続きを読む ▼</button>
      <div class="post-body" id="body-${p.id}">${escapeHtml(p.body).replace(/\n/g,'<br>')}${renderAttachment(p.attachment)}</div>
    </article>
  `).join('');
  if (typeof io !== 'undefined') document.querySelectorAll('#'+targetId+' .reveal').forEach(el => io.observe(el));
}
function togglePost(id){ document.getElementById('body-'+id).classList.toggle('open'); }

function renderAttachment(a){
  if (!a || !a.filename) return '';
  const url = FILE_BASE + a.url;
  if ((a.mime||'').startsWith('image/')) {
    return `<div class="post-attach"><a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${escapeHtml(a.original||'')}"></a></div>`;
  }
  if (a.mime === 'application/pdf') {
    return `<div class="post-attach"><a class="post-pdf" href="${url}" target="_blank" rel="noopener">📄 PDFを開く (${escapeHtml(a.original||'document.pdf')})</a></div>`;
  }
  return `<div class="post-attach"><a href="${url}" target="_blank" rel="noopener">添付ファイル</a></div>`;
}

// ---------- 管理画面 ----------
async function renderAdmin(){
  const tbl = document.getElementById('adminList'); if (!tbl) return;
  tbl.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888">読み込み中...</td></tr>';
  const list = (await fetchPosts()).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  tbl.innerHTML = list.length ? list.map(p => `
    <tr>
      <td><span class="post-cat post-cat-${p.category}">${CATEGORIES[p.category]}</span></td>
      <td>${escapeHtml(p.title)}</td>
      <td>${p.date}</td>
      <td>${p.attachment ? (p.attachment.mime==='application/pdf'?'📄 PDF':'🖼 画像') : '-'}</td>
      <td>
        <button onclick="editPost('${p.id}')">編集</button>
        <button onclick="deletePost('${p.id}')" class="danger">削除</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:#888">投稿がありません</td></tr>';
}

let currentAttachment = null;

async function editPost(id){
  const p = (await fetchPosts()).find(x => x.id === id); if (!p) return;
  document.getElementById('postId').value = p.id;
  document.getElementById('postCategory').value = p.category;
  document.getElementById('postTitle').value = p.title;
  document.getElementById('postDate').value = p.date;
  document.getElementById('postBody').value = p.body;
  currentAttachment = p.attachment || null;
  renderAttachPreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function deletePost(id){
  if (!confirm('この投稿を削除しますか？(添付ファイルも削除されます)')) return;
  await removePost(id);
  renderAdmin();
}
async function submitPost(e){
  e.preventDefault();
  const id = document.getElementById('postId').value;
  const data = {
    category: document.getElementById('postCategory').value,
    title:    document.getElementById('postTitle').value,
    date:     document.getElementById('postDate').value,
    body:     document.getElementById('postBody').value,
    attachment: currentAttachment
  };
  try{
    if (id) await updatePost(id, data);
    else await createPost(data);
    resetForm();
    renderAdmin();
    alert('保存しました');
  } catch(err) { alert('保存失敗: '+err.message); }
  return false;
}
function resetForm(){
  document.getElementById('postForm').reset();
  document.getElementById('postId').value = '';
  document.getElementById('postDate').value = new Date().toISOString().slice(0,10);
  currentAttachment = null;
  renderAttachPreview();
}
async function handleUpload(e){
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 10*1024*1024) { alert('ファイルサイズは10MB以下にしてください'); return; }
  const ok = ['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(file.type);
  if (!ok) { alert('画像(JPEG/PNG/WebP/GIF)またはPDFのみ対応'); return; }
  try{
    const info = await uploadFile(file);
    currentAttachment = { filename: info.filename, url: info.url, mime: info.mime, original: info.original };
    renderAttachPreview();
  } catch(err) { alert(err.message); }
  e.target.value = '';
}
function removeAttachment(){
  currentAttachment = null;
  renderAttachPreview();
}
function renderAttachPreview(){
  const el = document.getElementById('attachPreview'); if (!el) return;
  if (!currentAttachment) { el.innerHTML = '<span style="color:#888;font-size:.85rem">添付なし</span>'; return; }
  const url = FILE_BASE + currentAttachment.url;
  const isImg = (currentAttachment.mime||'').startsWith('image/');
  el.innerHTML = `
    ${isImg ? `<img src="${url}" style="max-width:200px;border-radius:12px;display:block;margin-bottom:8px">`
            : `<div style="padding:14px;background:#fff;border-radius:12px;margin-bottom:8px">📄 ${escapeHtml(currentAttachment.original||'PDF')}</div>`}
    <a href="${url}" target="_blank" rel="noopener" style="font-size:.8rem;margin-right:12px">プレビュー</a>
    <button type="button" onclick="removeAttachment()" class="danger" style="padding:6px 14px;font-size:.78rem">添付を解除</button>
  `;
}
