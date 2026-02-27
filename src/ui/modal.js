import { el, clear } from './dom.js';

export function createModal() {
  const overlay = el('div', { class:'modalOverlay', role:'dialog', 'aria-modal':'true' });
  const modal = el('div', { class:'modal' });
  const mhd = el('div', { class:'mhd' });
  const titleWrap = el('div', { class:'title' });
  const title = el('h3', {}, '—');
  const sub = el('div', { class:'sub' }, '');
  titleWrap.append(title, sub);
  const closeBtn = el('button', { class:'btn', type:'button' }, 'ปิด');
  mhd.append(titleWrap, closeBtn);
  const mbd = el('div', { class:'mbd' });
  const mft = el('div', { class:'mft' });

  modal.append(mhd, mbd, mft);
  overlay.append(modal);
  document.body.appendChild(overlay);

  function open({ heading='—', subtitle='', body=null, footerButtons=[] } = {}) {
    title.textContent = heading;
    sub.textContent = subtitle;
    clear(mbd); clear(mft);
    if (body) mbd.append(body);
    for (const btn of footerButtons) mft.append(btn);
    overlay.classList.add('show');
  }
  function close(){ overlay.classList.remove('show'); }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) close(); });
  window.addEventListener('keydown', (e)=>{ if (e.key==='Escape') close(); });

  return { open, close };
}
