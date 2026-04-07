// スクロール表示アニメーション
const io=new IntersectionObserver((entries)=>{
  entries.forEach(e=>{
    if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}
  });
},{threshold:.15,rootMargin:'0px 0px -50px 0px'});
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
});

// ヘッダー スクロール時の背景濃度
window.addEventListener('scroll',()=>{
  const h=document.querySelector('header');
  if(window.scrollY>50)h.classList.add('scrolled');else h.classList.remove('scrolled');
});

// モバイルメニュー
function toggleMenu(){
  document.getElementById('nav').classList.toggle('open');
}

// メールフォーム送信(mailto起動)
function sendMail(e){
  e.preventDefault();
  const f=e.target;
  const subject=encodeURIComponent('【お問い合わせ】'+f.type.value+' - '+f.name.value);
  const body=encodeURIComponent(
    'お名前: '+f.name.value+'\n'+
    '電話番号: '+f.tel.value+'\n'+
    'メール: '+f.email.value+'\n'+
    '種別: '+f.type.value+'\n\n'+
    '【お問い合わせ内容】\n'+f.message.value
  );
  window.location.href='mailto:hvns.one2one@gmail.com?subject='+subject+'&body='+body;
  return false;
}
