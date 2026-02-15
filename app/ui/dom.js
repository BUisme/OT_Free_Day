export function el(tag, attrs={}, ...children) {
  const node = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, String(v));
  }
  for (const ch of children.flat()) {
    if (ch == null) continue;
    if (typeof ch === 'string' || typeof ch === 'number') node.appendChild(document.createTextNode(String(ch)));
    else node.appendChild(ch);
  }
  return node;
}

export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

export function toast(msg, kind='ok', ms=1800){
  const t = el('div', { class:`toast ${kind}` }, msg);
  document.body.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{
    t.classList.remove('show');
    setTimeout(()=>t.remove(), 250);
  }, ms);
}

export function fmtMoney(n, hide=false){
  if (hide) return '***';
  const x = Number(n);
  if (!Number.isFinite(x)) return '0.00';
  return x.toFixed(2);
}
