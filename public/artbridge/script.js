const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = [...document.querySelectorAll('.site-nav a')];
const toast = document.querySelector('.toast');
const form = document.querySelector('#artist-form');
const saveDraftButton = document.querySelector('#save-draft');
const languageButtons = [...document.querySelectorAll('[data-lang]')];
const bilingualNodes = [...document.querySelectorAll('[data-en][data-sw]')];
const successBox = document.querySelector('#form-success');
const downloadButton = document.querySelector('#download-response');
let toastTimer;
let latestSubmission = null;

function updateHeader() {
  header.classList.toggle('scrolled', window.scrollY > 18);
}
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

menuToggle.addEventListener('click', () => {
  const isOpen = document.body.classList.toggle('menu-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
});

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    document.body.classList.remove('menu-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
  });
});

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

const sections = [...document.querySelectorAll('main section[id]')];
const observer = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navLinks.forEach(item => item.classList.remove('active'));
  const match = navLinks.find(item => item.getAttribute('href') === `#${visible.target.id}`);
  if (match) match.classList.add('active');
}, { threshold: [0.22, .42, .62], rootMargin: '-15% 0px -55% 0px' });
sections.forEach(section => observer.observe(section));

function setLanguage(mode) {
  languageButtons.forEach(button => button.classList.toggle('active', button.dataset.lang === mode));
  bilingualNodes.forEach(node => {
    const en = node.dataset.en;
    const sw = node.dataset.sw;
    node.textContent = mode === 'en' ? en : mode === 'sw' ? sw : `${en} / ${sw}`;
  });
  localStorage.setItem('vopApplicationLanguage', mode);
}

languageButtons.forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.lang)));
setLanguage(localStorage.getItem('vopApplicationLanguage') || 'both');

function serializeForm() {
  const data = Object.fromEntries(new FormData(form).entries());
  data.consent = form.elements.consent.checked;
  data.savedAt = new Date().toISOString();
  return data;
}

function restoreDraft() {
  const raw = localStorage.getItem('vopArtistApplicationDraft');
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    Object.entries(data).forEach(([key, value]) => {
      const field = form.elements[key];
      if (!field) return;
      if (field.type === 'checkbox') field.checked = Boolean(value);
      else field.value = value ?? '';
    });
    showToast('Saved application draft restored.');
  } catch (_) {}
}
restoreDraft();

saveDraftButton.addEventListener('click', () => {
  const data = serializeForm();
  localStorage.setItem('vopArtistApplicationDraft', JSON.stringify(data));
  showToast('Draft saved on this device.');
});

function validateForm() {
  let firstInvalid = null;
  [...form.elements].forEach(field => {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
    field.classList.remove('invalid');
    if (!field.checkValidity()) {
      field.classList.add('invalid');
      if (!firstInvalid) firstInvalid = field;
    }
  });
  if (firstInvalid) {
    firstInvalid.focus({ preventScroll: true });
    firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }
  return true;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!validateForm()) {
    showToast('Please complete the required fields. / Tafadhali jaza sehemu zinazohitajika.');
    return;
  }
  latestSubmission = serializeForm();
  localStorage.setItem('vopArtistApplicationSubmission', JSON.stringify(latestSubmission));
  localStorage.setItem('vopArtistApplicationDraft', JSON.stringify(latestSubmission));
  successBox.hidden = false;
  successBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Test application saved locally.');
});

[...form.querySelectorAll('input, textarea, select')].forEach(field => {
  field.addEventListener('input', () => field.classList.remove('invalid'));
  field.addEventListener('change', () => field.classList.remove('invalid'));
});

downloadButton.addEventListener('click', () => {
  latestSubmission = latestSubmission || (() => {
    const raw = localStorage.getItem('vopArtistApplicationSubmission');
    return raw ? JSON.parse(raw) : serializeForm();
  })();
  const blob = new Blob([JSON.stringify(latestSubmission, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `voice-of-piece-artist-application-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});
