(() => {
  'use strict';

  // All pages share the same stylesheet. Swap their content in-place so the
  // outgoing and incoming *pages* can crossfade, rather than flashing a solid
  // colour between two full reloads. Ordinary links still work without JS.
  const pages = new Set(['index.html', 'research.html', 'paintings.html']);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const cache = new Map();
  const root = document.documentElement;
  const arrivalKey = 'aw-fallback-arrival';
  let serial = 0;

  function eligible(url) {
    return url.origin === location.origin && pages.has(url.pathname.split('/').pop());
  }

  function fallbackArrival() {
    try {
      const record = JSON.parse(sessionStorage.getItem(arrivalKey));
      sessionStorage.removeItem(arrivalKey);
      if (record && record.path === location.pathname &&
          Date.now() - record.time < 8000 && !motion.matches) {
        root.classList.add('navigation-arriving');
      }
    } catch (_) { /* Private browsing/storage restrictions are harmless. */ }
  }
  fallbackArrival(); // head script runs before first paint on full navigations

  window.addEventListener('pageshow', () => {
    root.classList.remove('navigation-leaving');
    if (root.classList.contains('navigation-arriving')) {
      // Let the arrival animation actually finish. Removing this class after
      // two frames cancelled its 390-ms fade and caused an abrupt flash.
      const finish = () => {
        root.classList.remove('navigation-arriving');
        document.body.removeEventListener('animationend', onEnd);
      };
      const onEnd = (event) => {
        if (event.animationName === 'aw-fallback-in') finish();
      };
      document.body.addEventListener('animationend', onEnd);
      setTimeout(finish, 550); // safeguard if animations are unavailable
    }
  });

  function load(url) {
    const key = url.pathname;
    if (!cache.has(key)) {
      const request = fetch(url.href, { credentials: 'same-origin' })
        .then(response => {
          if (!response.ok) throw new Error('Page load failed: ' + response.status);
          return response.text();
        })
        .then(markup => {
          const page = new DOMParser().parseFromString(markup, 'text/html');
          if (!page.querySelector('main#main') || !page.querySelector('footer.site-footer') ||
              !/^page-(profile|research|paintings)$/.test(page.body.className.trim())) {
            throw new Error('Invalid page response');
          }
          return page;
        });
      cache.set(key, request);
      request.catch(() => { if (cache.get(key) === request) cache.delete(key); });
    }
    return cache.get(key);
  }

  function updateMeta(source, name) {
    const current = document.querySelector(`meta[name="${name}"]`);
    const next = source.querySelector(`meta[name="${name}"]`);
    if (current && next) current.content = next.content;
  }

  function applyPage(page, scrollY) {
    document.body.className = page.body.className;
    const oldMain = document.getElementById('main');
    const oldFooter = document.querySelector('footer.site-footer');
    oldMain.replaceWith(document.importNode(page.querySelector('main#main'), true));
    oldFooter.replaceWith(document.importNode(page.querySelector('footer.site-footer'), true));

    const activePath = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.site-header nav a').forEach(link => {
      if (new URL(link.href).pathname.split('/').pop() === activePath) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
    document.title = page.title;
    updateMeta(page, 'theme-color');
    updateMeta(page, 'color-scheme');
    updateMeta(page, 'description');
    scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
    document.dispatchEvent(new Event('aw:pagechange'));
    document.getElementById('main').focus({ preventScroll: true });
  }

  function animateSwap(page, scrollY) {
    if (motion.matches) { applyPage(page, scrollY); return; }
    if (typeof document.startViewTransition === 'function') {
      const transition = document.startViewTransition(() => applyPage(page, scrollY));
      transition.finished.catch(() => {});
      return;
    }
    // For older engines without the View Transitions API, animate the actual
    // content. There is no opaque overlay or sudden destination-colour flash.
    const targets = [document.querySelector('main'), document.querySelector('.site-footer')];
    Promise.all(targets.map(el => el.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 155, easing: 'ease-in', fill: 'forwards' }
    ).finished.catch(() => {}))).then(() => {
      targets.forEach(el => el.getAnimations().forEach(anim => anim.cancel()));
      applyPage(page, scrollY);
      [document.querySelector('main'), document.querySelector('.site-footer')].forEach(el => el.animate(
        [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 310, easing: 'cubic-bezier(.2,.65,.2,1)' }
      ));
    });
  }

  function rememberScroll() {
    history.replaceState({ ...(history.state || {}), awManaged: true, awScrollY: scrollY }, '');
  }

  function fullNavigate(url, replace = false) {
    if (!motion.matches) {
      try { sessionStorage.setItem(arrivalKey, JSON.stringify({ path: url.pathname, time: Date.now() })); }
      catch (_) { /* Continue without animation. */ }
      root.classList.add('navigation-leaving');
      setTimeout(() => { replace ? location.replace(url.href) : location.assign(url.href); }, 260);
    } else {
      replace ? location.replace(url.href) : location.assign(url.href);
    }
  }

  async function navigate(url, options = {}) {
    const token = ++serial;
    if (url.pathname === location.pathname && url.search === location.search && !options.pop) return;
    if (location.protocol === 'file:') { fullNavigate(url, !!options.pop); return; }

    let page;
    try { page = await load(url); }
    catch (_) { if (token === serial) fullNavigate(url, !!options.pop); return; }
    if (token !== serial) return;

    const desiredScrollY = options.pop ? (options.scrollY || 0) : 0;
    if (!options.pop) {
      rememberScroll();
      history.pushState({ awManaged: true, awScrollY: 0 }, '', url.href);
    }
    animateSwap(page, desiredScrollY);
  }

  // Save scroll positions for browser Back / Forward and restore them on return.
  if (location.protocol !== 'file:') {
    history.scrollRestoration = 'manual';
    history.replaceState({ ...(history.state || {}), awManaged: true, awScrollY: scrollY }, '');
    window.addEventListener('pagehide', rememberScroll);
    window.addEventListener('popstate', event => {
      const url = new URL(location.href);
      if (!eligible(url)) return;
      navigate(url, { pop: true, scrollY: event.state?.awScrollY || 0 });
    });
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[data-page-transition]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') ||
        (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (!eligible(url) || (url.pathname === location.pathname && !url.hash)) return;
    event.preventDefault();
    navigate(url);
  });

  // Navigation usually starts on hover/focus, making the transition feel
  // immediate even on a first visit to a page.
  const prefetch = event => {
    if (location.protocol === 'file:') return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[data-page-transition]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    if (eligible(url) && url.pathname !== location.pathname) load(url).catch(() => {});
  };
  document.addEventListener('pointerover', prefetch);
  document.addEventListener('focusin', prefetch);
})();
