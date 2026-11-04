(() => {
  'use strict';

  function initPage() {
  // Keep old #research links useful after moving research to its own page.
  if (document.body.classList.contains('page-profile') && location.hash === '#research') {
    location.replace('research.html');
    return;
  }

  const email = document.getElementById('email-menu');
  if (email) {
    const trigger = email.querySelector('summary');
    const mouse = matchMedia('(hover: hover) and (pointer: fine)');
    email.addEventListener('pointerenter', event => {
      if (mouse.matches && event.pointerType !== 'touch') email.open = true;
    });
    email.addEventListener('pointerleave', event => {
      if (mouse.matches && event.pointerType !== 'touch' && !email.contains(document.activeElement)) email.open = false;
    });
    email.addEventListener('keydown', event => {
      if (event.key === 'Escape' && email.open) {
        event.preventDefault();
        email.open = false;
        trigger.focus();
      }
      if (event.key === 'Tab') requestAnimationFrame(() => {
        if (!email.contains(document.activeElement) && !(mouse.matches && email.matches(':hover'))) email.open = false;
      });
    });
    // Never close on blur: touch browsers blur the summary before clicking mailto.
  }

  const viewer = document.getElementById('artwork-viewer');
  if (!viewer || typeof viewer.showModal !== 'function') return;
  const artworks = [...document.querySelectorAll('.artwork-open')];
  const image = document.getElementById('viewer-image');
  const title = document.getElementById('viewer-title');
  const count = document.getElementById('viewer-count');
  let current = 0;
  let opener = null;

  function showArtwork(index) {
    current = (index + artworks.length) % artworks.length;
    const selected = artworks[current].querySelector('img');
    image.src = artworks[current].href;
    image.alt = selected.alt;
    title.textContent = 'Painting ' + String(current + 1).padStart(2, '0');
    count.textContent = (current + 1) + ' of ' + artworks.length;
  }

  artworks.forEach((link, index) => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.setAttribute('aria-controls', 'artwork-viewer');
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      showArtwork(index);
      viewer.showModal();
    });
  });
  document.getElementById('close-viewer').addEventListener('click', () => viewer.close());
  document.getElementById('previous-artwork').addEventListener('click', () => showArtwork(current - 1));
  document.getElementById('next-artwork').addEventListener('click', () => showArtwork(current + 1));
  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showArtwork(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  let backdropPress = false;
  viewer.addEventListener('pointerdown', event => { backdropPress = event.target === viewer; });
  viewer.addEventListener('click', event => {
    if (backdropPress && event.target === viewer) {
      const b = viewer.getBoundingClientRect();
      if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) viewer.close();
    }
    backdropPress = false;
  });
  viewer.addEventListener('close', () => {
    image.removeAttribute('src');
    if (opener) opener.focus({preventScroll: true});
  });
  }

  document.addEventListener('pointerdown', event => {
    const activeMenu = document.getElementById('email-menu');
    if (activeMenu && !activeMenu.contains(event.target)) activeMenu.open = false;
  });
  document.addEventListener('aw:pagechange', initPage);
  initPage();
})();
