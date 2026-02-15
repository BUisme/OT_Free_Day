import { el, qs } from './dom.js';

export function openModal({ title='แก้ไข', content, actions=[] }) {
  const overlay = el('div', { class:'modalOverlay', onclick:(e)=>{ if(e.target===overlay) close(); } });
  const box = el('div', { class:'modalBox' });
  const hd = el('div', { class:'modalHd' },
    el('div', { class:'modalTitle' }, title),
    el('button', { class:'btn ghost', onclick:()=>close(), type:'button' }, '✕')
  );
  const bd = el('div', { class:'modalBd' });
  if (content) bd.appendChild(content);
  const ft = el('div', { class:'modalFt' }, actions);

  box.appendChild(hd);
  box.appendChild(bd);
  box.appendChild(ft);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  function close(){
    overlay.classList.add('out');
    setTimeout(()=>overlay.remove(), 180);
  }

  // Escape key
  const onKey = (e)=>{ if(e.key==='Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, { once:true });

  return { close, overlay, box, bd };
}

export function confirmModal({ title='ยืนยัน', message='แน่ใจไหม?', okText='ตกลง', cancelText='ยกเลิก', danger=false }) {
  return new Promise((resolve)=>{
    const content = el('div', {},
      el('div', { class:'small' }, message)
    );
    const { close } = openModal({
      title,
      content,
      actions: [
        el('button', { class:'btn ghost', type:'button', onclick:()=>{ close(); resolve(false); } }, cancelText),
        el('button', { class:`btn ${danger?'danger':'primary'}`, type:'button', onclick:()=>{ close(); resolve(true); } }, okText),
      ]
    });
  });
}
