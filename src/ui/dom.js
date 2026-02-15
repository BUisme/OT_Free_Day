export function el(tag, attrs={}, ...children) {
  const node = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === false || v == null) continue;
    else node.setAttribute(k, String(v));
  }
  for (const ch of children.flat()) {
    if (ch == null) continue;
    node.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
  }
  return node;
}
export function clear(node){ while(node.firstChild) node.removeChild(node.firstChild); }
export function toast(msg, kind='ok', ms=2200) {
  const t = el('div', { class: `notice ${kind==='ok'?'ok':kind==='danger'?'danger':''}` }, msg);
  t.style.position='fixed';
  t.style.left='12px';
  t.style.right='12px';
  t.style.bottom='14px';
  t.style.zIndex='100';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), ms);
}
