(() => {
  const PT = document.documentElement.lang.startsWith('pt');
  const t = (pt, en) => (PT ? pt : en);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ITEMS = Object.fromEntries((window.ITEMS || []).map((i) => [i.id, i]));
  const BIZ = window.BIZ;
  const KEY = 'oliveiras-cesta-v1';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* sem armazenamento: segue só na página */ } },
  };
  const state = Object.assign({ lines: [], extra: '', mode: 'pickup', name: '', when: '', zip: '' }, store.get());
  const save = () => store.set(state);

  const unitLabel = (u, n) => ({
    lb: 'lb',
    un: t('un.', n === 1 ? 'pc' : 'pcs'),
    pc: t(n === 1 ? 'porção' : 'porções', n === 1 ? 'portion' : 'portions'),
    pk: t(n === 1 ? 'pct.' : 'pcts.', n === 1 ? 'pack' : 'packs'),
  }[u]);
  const cutLabel = (c) => ({ whole: t('peça inteira', 'whole'), steaks: t('em bifes', 'steaks'), thin: t('fatiada fina', 'thin sliced') }[c] || '');
  const num = (n) => (PT ? String(n).replace('.', ',') : String(n));
  const step = (u) => (u === 'lb' ? 0.5 : 1);
  const nameOf = (id) => (PT ? ITEMS[id].pt : ITEMS[id].en);

  /* ---------- Horário ao vivo (fuso de Orlando) ---------- */
  function orlandoNow() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
    const get = (k) => parts.find((p) => p.type === k).value;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return { day, h: +get('hour'), m: +get('minute') };
  }
  const hFmt = (h) => (PT ? `${h}h` : `${h > 12 ? h - 12 : h}${h >= 12 ? 'pm' : 'am'}`);
  function status() {
    const { day, h, m } = orlandoNow();
    const [o, c] = BIZ.hours[day];
    const now = h + m / 60;
    if (now >= o && now < c) {
      const left = c - now;
      return { open: true, now, day, short: t(`Aberto · até ${hFmt(c)}`, `Open · until ${hFmt(c)}`), long: left <= 1 ? t(`<b>Aberto</b>, fecha às ${hFmt(c)}. Corre que ainda dá!`, `<b>Open</b>, closes at ${hFmt(c)}. Still time!`) : t(`<b>Aberto agora</b> até as ${hFmt(c)}.`, `<b>Open now</b> until ${hFmt(c)}.`) };
    }
    const nextDay = now < o ? day : (day + 1) % 7;
    const when = nextDay === day ? t('hoje', 'today') : t('amanhã', 'tomorrow');
    const no = BIZ.hours[nextDay][0];
    return { open: false, now, day, short: t(`Fechado · abre ${when} ${hFmt(no)}`, `Closed · opens ${when} ${hFmt(no)}`), long: t(`<b class="c">Fechado</b>. Abre ${when} às ${hFmt(no)}. Deixe a cesta pronta e envie no WhatsApp.`, `<b class="c">Closed</b>. Opens ${when} at ${hFmt(no)}. Get your basket ready and send it on WhatsApp.`) };
  }
  function paintStatus() {
    const s = status();
    $$('[data-status]').forEach((el) => { el.classList.toggle('open', s.open); el.classList.toggle('closed', !s.open); el.querySelector('span').textContent = s.short; });
    const { h, m, day } = orlandoNow();
    const clock = PT ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` : `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
    $$('[data-clock]').forEach((el) => (el.textContent = clock));
    $$('[data-state]').forEach((el) => (el.innerHTML = s.long));
    $$('.week li').forEach((li) => {
      const today = +li.dataset.day === day;
      li.classList.toggle('today', today);
      const mark = li.querySelector('.now');
      mark.hidden = !today || s.now < 6 || s.now > 22;
      if (today) mark.style.left = `${((s.now - 6) / 16) * 100}%`;
    });
  }
  paintStatus();
  setInterval(paintStatus, 30000);

  /* ---------- Cesta ---------- */
  const keyOf = (id, cut) => `${id}:${cut || ''}`;
  function add(id, qty, cut) {
    const k = keyOf(id, cut);
    const line = state.lines.find((l) => l.key === k);
    if (line) line.qty = +(line.qty + qty).toFixed(1);
    else state.lines.push({ key: k, id, qty, cut: cut || '' });
    save();
    render();
    feedback(nameOf(id));
  }
  function addCustom(text) {
    const v = text.trim();
    if (!v) return false;
    state.lines.push({ key: `x:${Date.now()}`, custom: v.slice(0, 120), qty: 1 });
    save();
    render();
    feedback(v.slice(0, 28));
    return true;
  }

  function message() {
    const L = [];
    L.push(t('Olá, Oliveira’s! Quero fazer um pedido pelo site:', 'Hi, Oliveira’s! I’d like to place an order from your website:'));
    L.push('');
    if (!state.lines.length && !state.extra.trim()) L.push(t('(cesta vazia)', '(empty basket)'));
    state.lines.forEach((l) => {
      if (l.custom) { L.push(`• ${l.custom}`); return; }
      const it = ITEMS[l.id];
      const cut = l.cut ? ` (${cutLabel(l.cut)})` : '';
      L.push(`• ${num(l.qty)} ${unitLabel(it.unit, l.qty)} ${nameOf(l.id)}${cut}`);
    });
    if (state.extra.trim()) L.push(`• ${t('Procuro também', 'Also looking for')}: ${state.extra.trim()}`);
    L.push('');
    const when = state.when.trim() ? ` · ${state.when.trim()}` : '';
    if (state.mode === 'delivery') {
      L.push(`${t('Entrega', 'Delivery')}${when}`);
      if (state.zip.trim()) L.push(`${t('Bairro/ZIP', 'Area/ZIP')}: ${state.zip.trim()}`);
    } else L.push(`${t('Retiro na loja', 'Store pickup')}${when}`);
    if (state.name.trim()) L.push(`${t('Nome', 'Name')}: ${state.name.trim()}`);
    L.push(t('Pode confirmar preço e disponibilidade? Obrigado!', 'Could you confirm prices and availability? Thank you!'));
    return L.join('\n');
  }

  function render() {
    const count = state.lines.length + (state.extra.trim() ? 1 : 0);
    $$('[data-count]').forEach((el) => {
      if (el.textContent !== String(count)) { el.textContent = count; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    });
    $$('[data-quick]').forEach((chip) => {
      const n = state.lines.filter((l) => l.id === chip.dataset.quick).reduce((a, l) => a + l.qty, 0);
      chip.classList.toggle('on', n > 0);
      let badge = chip.querySelector('.n');
      if (n > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'n'; chip.querySelector('span').append(badge); }
        badge.textContent = ` ×${num(n)}`;
      } else if (badge) badge.remove();
    });
    const ul = $('[data-lines]');
    if (!ul) return;
    $('[data-empty]').hidden = state.lines.length > 0;
    ul.innerHTML = state.lines.map((l, i) => {
      const title = l.custom ? l.custom : nameOf(l.id);
      const sub = l.custom ? t('Pedido especial', 'Special request') : [unitLabel(ITEMS[l.id].unit, l.qty), cutLabel(l.cut)].filter(Boolean).join(' · ');
      return `<li class="line"><div><b></b><small></small></div>
        <div class="qty"><button type="button" data-line="${i}" data-d="-1" aria-label="${t('Menos', 'Less')}"><svg viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button><output>${num(l.qty)}</output><button type="button" data-line="${i}" data-d="1" aria-label="${t('Mais', 'More')}"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button></div>
      </li>`.replace('<b></b>', `<b>${escapeHTML(title)}</b>`).replace('<small></small>', `<small>${escapeHTML(sub)}</small>`);
    }).join('');
    const msg = message();
    $('[data-preview]').textContent = msg;
    const send = $('[data-send]');
    send.href = `https://wa.me/${BIZ.wa}?text=${encodeURIComponent(msg)}`;
    const empty = !count;
    send.setAttribute('aria-disabled', String(empty));
    $('[data-zip-wrap]').hidden = state.mode !== 'delivery';
  }
  const escapeHTML = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-line]');
    if (!b) return;
    const l = state.lines[+b.dataset.line];
    const s = l.custom ? 1 : step(ITEMS[l.id].unit);
    l.qty = +(l.qty + s * +b.dataset.d).toFixed(1);
    if (l.qty <= 0) state.lines.splice(+b.dataset.line, 1);
    save();
    render();
  });

  // Campos da gaveta
  const bind = (sel, prop, ev = 'input') => { const el = $(sel); if (!el) return; el.value = state[prop]; el.addEventListener(ev, () => { state[prop] = el.value; save(); render(); }); };
  bind('[data-extra]', 'extra');
  bind('[data-name]', 'name');
  bind('[data-when]', 'when');
  bind('[data-zip]', 'zip');
  $$('input[name="mode"]').forEach((r) => { r.checked = r.value === state.mode; r.addEventListener('change', () => { state.mode = r.value; save(); render(); }); });

  /* ---------- Gaveta ---------- */
  const drawer = $('#cart');
  const scrim = $('[data-scrim]');
  let lastFocus = null;
  function openCart() {
    lastFocus = document.activeElement;
    drawer.removeAttribute('inert');
    drawer.setAttribute('aria-hidden', 'false');
    scrim.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('open'));
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('.x', drawer).focus(), 50);
  }
  function closeCart() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('inert', '');
    scrim.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  $$('[data-open-cart]').forEach((b) => b.addEventListener('click', openCart));
  $$('[data-close-cart]').forEach((b) => b.addEventListener('click', closeCart));
  scrim.addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeCart(); });

  /* ---------- Atalhos do topo ---------- */
  $$('[data-quick]').forEach((chip) => chip.addEventListener('click', () => {
    const it = ITEMS[chip.dataset.quick];
    add(it.id, it.unit === 'lb' ? 1 : 1, it.cut ? 'whole' : '');
    drop(nameOf(it.id));
  }));

  /* ---------- Cartões ---------- */
  $$('[data-item]').forEach((card) => {
    const it = ITEMS[card.dataset.item];
    const out = $('[data-amount]', card);
    let qty = 1;
    let cut = it.cut ? 'whole' : '';
    $$('[data-step]', card).forEach((b) => b.addEventListener('click', () => {
      qty = Math.max(step(it.unit), +(qty + step(it.unit) * +b.dataset.step).toFixed(1));
      out.textContent = num(qty);
    }));
    $$('[data-cut]', card).forEach((b) => b.addEventListener('click', () => {
      cut = b.dataset.cut;
      $$('[data-cut]', card).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    }));
    const btn = $('[data-add]', card);
    const label = $('[data-add-label]', card);
    const original = label.textContent;
    btn.addEventListener('click', () => {
      add(it.id, qty, cut);
      btn.classList.add('done');
      label.textContent = t('Na cesta ✓', 'In your basket ✓');
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.classList.remove('done'); label.textContent = original; }, 1600);
    });
  });

  const ask = $('[data-ask]');
  if (ask) {
    const go = () => { if (addCustom(ask.value)) { ask.value = ''; } };
    $('[data-ask-add]').addEventListener('click', go);
    ask.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  }

  /* ---------- Filtros ---------- */
  const tabs = $$('[data-filter]');
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const f = tab.dataset.filter;
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === tab)));
    $$('[data-grid] .item').forEach((card) => { card.hidden = !(f === 'all' || card.dataset.dept === f || card.dataset.dept === 'all'); });
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }));

  /* ---------- Etiqueta que cai na cesta ---------- */
  const zone = $('[data-drop]');
  function drop(text) {
    if (!zone) return;
    const tag = document.createElement('span');
    tag.className = 'drop';
    tag.textContent = text;
    const tilt = Math.round(Math.random() * 24 - 12);
    const shift = Math.round(Math.random() * 40 - 20);
    zone.append(tag);
    if (reduce) { setTimeout(() => tag.remove(), 900); return; }
    tag.animate([
      { transform: `translate(calc(-50% + ${shift}px), -160px) rotate(${tilt * 2}deg)`, opacity: 0 },
      { transform: `translate(calc(-50% + ${shift}px), -20px) rotate(${tilt}deg)`, opacity: 1, offset: .55 },
      { transform: `translate(calc(-50% + ${shift}px), 0) rotate(${tilt}deg)`, opacity: 1, offset: .75 },
      { transform: `translate(calc(-50% + ${shift}px), 60px) rotate(${tilt}deg)`, opacity: 0 },
    ], { duration: 1300, easing: 'cubic-bezier(.3,.7,.3,1)' }).onfinish = () => tag.remove();
    const b = $('.hero-basket .basket-svg');
    b && b.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(8px) scaleY(.97)' }, { transform: 'translateY(0)' }], { duration: 420, delay: 600, easing: 'ease-out' });
  }
  function feedback() { /* o contador pulsa via render() */ }

  render();

  /* ---------- Movimento com GSAP ---------- */
  window.addEventListener('load', () => {
    if (reduce || !window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    gsap.from('.hero h1', { y: 40, opacity: 0, duration: .9, ease: 'power3.out' });
    gsap.from('.hero-basket', { y: -80, rotate: -8, opacity: 0, duration: 1.1, ease: 'bounce.out', delay: .15 });
    gsap.from('.shelf', { y: 30, opacity: 0, duration: .8, delay: .25, ease: 'power3.out' });
    $$('.butcher-grid .item').forEach((el, i) => gsap.from(el, { y: 60, rotate: i % 2 ? 2 : -2, opacity: 0, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' } }));
    if ($('.twine-tag')) gsap.fromTo('.twine-tag', { rotate: -18 }, { rotate: 14, ease: 'none', scrollTrigger: { trigger: '.butcher', start: 'top bottom', end: 'bottom top', scrub: true } });
    if ($('.board')) gsap.from('.board', { y: 50, opacity: 0, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: '.board', start: 'top 85%' } });
    if ($('.phone-svg')) {
      gsap.fromTo('.phone-svg .cord', { strokeDashoffset: 520 }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '.alo', start: 'top 80%', end: 'center 50%', scrub: true } });
      gsap.fromTo('.phone-svg .handset', { y: 0, rotate: 0, transformOrigin: '50% 100%' }, { y: -26, rotate: -10, ease: 'none', scrollTrigger: { trigger: '.alo', start: 'top 70%', end: 'center 40%', scrub: true } });
      gsap.fromTo('.phone-svg .dial', { rotate: 0, svgOrigin: '160 226' }, { rotate: 160, ease: 'none', scrollTrigger: { trigger: '.alo', start: 'top 80%', end: 'bottom 30%', scrub: true } });
    }
    if ($('.road-line')) {
      const tl = gsap.timeline({ scrollTrigger: { trigger: '.road', start: 'top 85%' } });
      tl.fromTo('.road-line', { strokeDasharray: 1400, strokeDashoffset: 1400 }, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' })
        .from('.road-dash', { opacity: 0, duration: .4 })
        .from('.road-pin', { y: -120, opacity: 0, duration: .8, ease: 'bounce.out' }, '-=.2');
    }
    $$('.q').forEach((el, i) => gsap.from(el, { y: 40, opacity: 0, duration: .7, delay: i * .08, scrollTrigger: { trigger: '.quotes', start: 'top 85%' } }));
  });
})();
