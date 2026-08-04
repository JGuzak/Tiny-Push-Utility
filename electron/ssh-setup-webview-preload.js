const { ipcRenderer } = require('electron');

const PAGE_STATES = [
  {
    id: 'stateVerify',
    state: 'confirming',
    expectedText: 'Press the Shift, Select and Settings button on Push to confirm.'
  },
  {
    state: 'confirming',
    expectedText: 'Press the Shift, Select and Settings button on Push to confirm.'
  },
  {
    id: 'stateSuccess',
    state: 'success',
    expectedText: 'SSH key added successfully.'
  },
  {
    id: 'stateFailure',
    state: 'failure'
  },
  {
    id: 'stateError',
    state: 'failure'
  },
  {
    id: 'stateVerification',
    state: 'verifying'
  },
  {
    id: 'stateVerifying',
    state: 'verifying'
  }
];

let hasReportedSuccess = false;
let hasSubmittedPublicKey = false;
let pendingScanTimer = null;
let lastStateSignature = '';

function isVisibleStateElement(element) {
  return Boolean(element?.classList?.contains('text')) && !element.classList.contains('hidden');
}

function getVisiblePageState() {
  for (const pageState of PAGE_STATES) {
    const elements = pageState.id ? [document.getElementById(pageState.id)] : Array.from(document.querySelectorAll('.text'));
    const element = elements.find(isVisibleStateElement);

    if (!element) {
      continue;
    }

    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();

    if (pageState.expectedText && text !== pageState.expectedText) {
      continue;
    }

    return {
      id: pageState.id || element.id || null,
      state: pageState.state,
      text
    };
  }

  return null;
}

function report(channel, payload = {}) {
  ipcRenderer.sendToHost(channel, {
    href: location.href,
    pathname: location.pathname,
    title: document.title,
    ...payload
  });
}

function isVisibleElement(element) {
  if (!element) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function getControlText(element) {
  const label = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
  return [
    element.id,
    element.name,
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder'),
    element.textContent,
    label?.textContent
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isTextInput(element) {
  if (!element) {
    return false;
  }

  if (element.tagName === 'TEXTAREA') {
    return true;
  }

  if (element.tagName !== 'INPUT') {
    return false;
  }

  const type = (element.getAttribute('type') || 'text').toLowerCase();
  return ['text', 'search', 'password', 'url', 'email', 'tel', 'number'].includes(type);
}

function findPublicKeyInput() {
  const exactInput = document.getElementById('key');
  if (isTextInput(exactInput) && isVisibleElement(exactInput)) {
    return exactInput;
  }

  const candidates = Array.from(document.querySelectorAll('textarea, input')).filter((element) => isTextInput(element) && isVisibleElement(element));
  return (
    candidates.find((element) => {
      const text = getControlText(element);
      return text.includes('ssh') || text.includes('public') || text.includes('key');
    }) ||
    candidates.find((element) => element.tagName === 'TEXTAREA') ||
    candidates[0] ||
    null
  );
}

function findSubmitButton() {
  const exactButton = document.getElementById('add');
  if (exactButton && isVisibleElement(exactButton) && !exactButton.disabled) {
    return exactButton;
  }

  const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')).filter((element) => {
    return isVisibleElement(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true';
  });

  return (
    candidates.find((element) => /add\s+ssh\s+key/i.test(getControlText(element))) ||
    candidates.find((element) => /\b(add|submit|connect|pair)\b/i.test(getControlText(element))) ||
    candidates[0] ||
    null
  );
}

function findCodeInput() {
  const exactInput = document.getElementById('codeEntry');
  if (isTextInput(exactInput) && isVisibleElement(exactInput)) {
    return exactInput;
  }

  const candidates = Array.from(document.querySelectorAll('input, textarea')).filter((element) => isTextInput(element) && isVisibleElement(element));
  return (
    candidates.find((element) => {
      const text = getControlText(element);
      return text.includes('code') || text.includes('pair') || text.includes('display') || text.includes('key');
    }) ||
    candidates.find((element) => {
      const maxLength = Number(element.getAttribute('maxlength'));
      return Number.isFinite(maxLength) && maxLength > 0 && maxLength <= 12;
    }) ||
    candidates[0] ||
    null
  );
}

function findCodeSubmitButton() {
  const exactButton = document.getElementById('codeConfirm');
  if (exactButton && isVisibleElement(exactButton) && !exactButton.disabled) {
    return exactButton;
  }

  const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')).filter((element) => {
    return isVisibleElement(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true';
  });

  return candidates.find((element) => /\b(pair|submit|continue|ok|add ssh key)\b/i.test(getControlText(element))) || candidates[0] || null;
}

function setNativeValue(element, value) {
  const prototype = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function isPairingPage() {
  return (
    location.pathname === '/pair' ||
    location.href.endsWith('/pair') ||
    Boolean(document.getElementById('codeEntry') && document.getElementById('codeConfirm'))
  );
}

function getVisibleWrongCodeText() {
  const wrongCode = document.getElementById('stateWrongCode');
  if (!wrongCode || !isVisibleElement(wrongCode)) {
    return null;
  }

  const text = (wrongCode.textContent || '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function getPairingMetadata() {
  return {
    action: window.sessionStorage.getItem('pairing-action'),
    forward: window.sessionStorage.getItem('pairing-forward'),
    title: window.sessionStorage.getItem('pairing-title'),
    hasCodeInput: Boolean(findCodeInput()),
    hasCodeSubmitButton: Boolean(findCodeSubmitButton()),
    wrongCodeText: getVisibleWrongCodeText()
  };
}

function reportAutomationReady() {
  if (isPairingPage()) {
    report('ssh-setup:code-required', getPairingMetadata());
    return;
  }

  const keyInput = findPublicKeyInput();
  const submitButton = findSubmitButton();
  report('ssh-setup:automation-ready', {
    hasKeyInput: Boolean(keyInput),
    hasSubmitButton: Boolean(submitButton)
  });
}

function attemptPublicKeyAutomation(publicKey) {
  if (hasSubmittedPublicKey) {
    report('ssh-setup:automation-skipped', { reason: 'public key was already submitted' });
    return;
  }

  if (isPairingPage()) {
    report('ssh-setup:code-required', getPairingMetadata());
    return;
  }

  if (!publicKey || typeof publicKey !== 'string') {
    report('ssh-setup:automation-failed', { reason: 'public key unavailable' });
    return;
  }

  const keyInput = findPublicKeyInput();
  if (!keyInput) {
    report('ssh-setup:automation-failed', { reason: 'key input not found' });
    return;
  }

  const submitButton = findSubmitButton();
  if (!submitButton) {
    report('ssh-setup:automation-failed', { reason: 'submit button not found' });
    return;
  }

  report('ssh-setup:automation-started');
  setNativeValue(keyInput, publicKey.trim());
  hasSubmittedPublicKey = true;
  submitButton.click();
  report('ssh-setup:public-key-submitted');
  scheduleScan();
}

function attemptCodeSubmission(code) {
  if (!code || typeof code !== 'string') {
    report('ssh-setup:automation-failed', { reason: 'pairing code unavailable' });
    return;
  }

  const codeInput = findCodeInput();
  if (!codeInput) {
    report('ssh-setup:automation-failed', { reason: 'code input not found' });
    return;
  }

  setNativeValue(codeInput, code.trim());
  const submitButton = findCodeSubmitButton();

  if (submitButton) {
    submitButton.click();
  } else {
    codeInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
    codeInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter' }));
  }

  report('ssh-setup:code-submitted');
  setTimeout(scheduleScan, 250);
}

function scanPageState() {
  pendingScanTimer = null;

  if (isPairingPage()) {
    report('ssh-setup:code-required', getPairingMetadata());
    return;
  }

  const visiblePageState = getVisiblePageState();
  const nextSignature = JSON.stringify(visiblePageState);

  if (nextSignature === lastStateSignature) {
    return;
  }

  lastStateSignature = nextSignature;

  if (!visiblePageState) {
    report('ssh-setup:state-changed', { state: 'ready' });
    return;
  }

  report('ssh-setup:state-changed', visiblePageState);

  if (visiblePageState.state === 'confirming') {
    report('ssh-setup:manual-confirmation-required', visiblePageState);
  }

  if (visiblePageState.state !== 'success' || hasReportedSuccess) {
    return;
  }

  hasReportedSuccess = true;
  report('ssh-setup:success-candidate', visiblePageState);
}

function scheduleScan() {
  if (pendingScanTimer) {
    clearTimeout(pendingScanTimer);
  }

  pendingScanTimer = setTimeout(scanPageState, 100);
}

window.addEventListener('DOMContentLoaded', () => {
  report('ssh-setup:dom-ready');
  reportAutomationReady();
  scheduleScan();

  const observer = new MutationObserver(() => {
    reportAutomationReady();
    scheduleScan();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'disabled'],
    characterData: true,
    childList: true,
    subtree: true
  });
});

window.addEventListener('load', () => {
  report('ssh-setup:loaded');
  reportAutomationReady();
  scheduleScan();
});

ipcRenderer.on('ssh-setup:provide-public-key', (_event, publicKey) => {
  attemptPublicKeyAutomation(publicKey);
});

ipcRenderer.on('ssh-setup:provide-code', (_event, code) => {
  attemptCodeSubmission(code);
});

ipcRenderer.on('ssh-setup:retry-automation', (_event, publicKey) => {
  hasSubmittedPublicKey = false;
  attemptPublicKeyAutomation(publicKey);
});