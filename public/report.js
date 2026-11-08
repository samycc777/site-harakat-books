// «إبلاغ عن خطأ» on the book pages (hand-edited). Shown only when /api/report has its token.
// Text the reader selected on the page is put at the top of the report.
(async () => {
  const box = document.querySelector('.report');
  if (!box) return;
  try {
    const r = await fetch('/api/report');
    if (!(await r.json()).ready) return;
  } catch { return; }
  box.hidden = false;
  const open = box.querySelector('#report-open'), form = box.querySelector('#report-form');
  const ok = box.querySelector('.ok'), fail = box.querySelector('.fail'), ta = form.elements.text;
  let quote = '';
  document.addEventListener('selectionchange', () => {
    const s = String(getSelection()).trim();
    if (s && document.querySelector('.text').contains(getSelection().anchorNode)) quote = s.slice(0, 500);
  });
  open.onclick = () => {
    form.hidden = false; open.hidden = true; ok.hidden = fail.hidden = true;
    if (quote && !ta.value) ta.value = '«' + quote + '»\n';
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  };
  box.querySelector('#report-cancel').onclick = () => { form.hidden = true; open.hidden = false; };
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: location.pathname.split('/').filter(Boolean)[0], title: document.querySelector('h1').textContent,
                               text: ta.value, website: form.elements.website.value }) });
      if (!r.ok) throw 0;
      ta.value = ''; quote = ''; form.hidden = true; open.hidden = false; ok.hidden = false;
    } catch { fail.hidden = false; }
    btn.disabled = false;
  };
})();
