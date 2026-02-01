import { nanoid } from 'nanoid';
import browser from 'webextension-polyfill';
import { debounce } from '@/utils/helper';
import { recordPressedKey } from '@/utils/recordKeys';
import findSelector, { finder } from '@/lib/findSelector';
import addBlockToFlow from './addBlock';

let isMainFrame = true;
let lastUrl = '';
let urlCheckInterval = null;
let userNavigatedToUrl = false; // Track if user manually navigated
let activeTabAdded = false; // Track if active tab block was added

// Parameter detection variables
let parameterMode = false;
let parameterStartIndex = -1;
let parameterFieldSelector = null;
let parameterAlreadyRecorded = false; // Only allow one parameter per recording
let parameterOriginalValue = ''; // Store original value to restore

const isAutomaInstance = (target) =>
  target.id === 'automa-recording' ||
  document.body.hasAttribute('automa-selecting');
const isTextFieldEl = (el) => ['INPUT', 'TEXTAREA'].includes(el.tagName);

// URL change detection - only for manual navigation
function checkUrlChange() {
  if (window.location.href !== lastUrl) {
    const newUrl = window.location.href;
    const oldUrl = lastUrl;
    lastUrl = newUrl;
    
    // Only record if:
    // 1. User manually navigated (flag is set)
    // 2. This is not the initial page load
    // 3. This is not from form submission or link click
    if (userNavigatedToUrl && oldUrl && !isFormSubmissionNavigation()) {
      addBlock({
        id: 'javascript-code',
        description: `Navigate to ${newUrl}`,
        data: {
          code: `window.location.href = "${newUrl}";
automaNextBlock();`,
          everyNewTab: false,
          timeout: 10000
        }
      });
      
      // Add Active Tab block only after manual URL navigation
      if (!activeTabAdded) {
        setTimeout(() => {
          addActiveTabBlock();
        }, 100);
      }
    }
    
    // Reset the flag after checking
    userNavigatedToUrl = false;
  }
}

// Check if navigation is from form submission
function isFormSubmissionNavigation() {
  // Check if there was a recent form submission or enter key press
  const now = Date.now();
  return window.lastFormSubmission && (now - window.lastFormSubmission) < 2000;
}

// Listen for address bar changes (manual navigation)
function setupAddressBarDetection() {
  // Track when user focuses on address bar
  let addressBarFocused = false;
  
  // Detect when user types in address bar
  window.addEventListener('beforeunload', () => {
    // This fires when user navigates away
    userNavigatedToUrl = true;
  });
  
  // Alternative method: detect when user presses Enter in address bar
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      // Check if focus is on address bar (not in page content)
      const activeElement = document.activeElement;
      if (!activeElement || activeElement === document.body || activeElement === document.documentElement) {
        // Likely address bar navigation
        userNavigatedToUrl = true;
      }
    }
  }, true);
}

async function addBlock(detail) {
  try {
    const data = await addBlockToFlow(detail, isMainFrame);

    if (!isMainFrame || !data || !data.addedBlock) {
      let frameSelector = null;

      if (window.frameElement) {
        frameSelector = finder(window.frameElement, {
          root: window.frameElement.ownerDocument,
        });
      }

      window.top.postMessage(
        {
          frameSelector,
          recording: data.recording,
          type: 'automa:record-events',
        },
        '*'
      );
    }
  } catch (error) {
    console.error(error);
  }
}

function onChange({ target }) {
  if (isAutomaInstance(target)) return;

  const isInputEl = target.tagName === 'INPUT';
  const inputType = target.getAttribute('type');
  const excludeInput = isInputEl && ['checkbox', 'radio'].includes(inputType);

  if (excludeInput) return;

  let block = null;
  const selector = findSelector(target);
  const isSelectEl = target.tagName === 'SELECT';
  const elementName = target.ariaLabel || target.name;

  if (isInputEl && inputType === 'file') {
    block = {
      id: 'upload-file',
      description: elementName,
      data: {
        selector,
        waitForSelector: true,
        description: elementName,
        filePaths: [target.value],
      },
    };
  } else if (isSelectEl) {
    block = {
      id: 'forms',
      data: {
        selector,
        delay: 100,
        type: 'select',
        clearValue: true,
        value: target.value,
        waitForSelector: true,
        description: `Element Name (${elementName})`,
      },
    };
  } else {
    block = {
      id: 'trigger-event',
      data: {
        selector,
        eventName: 'change',
        eventType: 'event',
        waitForSelector: true,
        eventParams: { bubbles: true },
      },
    };
  }

  addBlock((recording) => {
    const lastFlow = recording.flows.at(-1);
    if (
      block.id === 'upload-file' &&
      lastFlow &&
      lastFlow.id === 'event-click'
    ) {
      recording.flows.pop();
    }

    if (
      block.data.type === 'text-field' &&
      block.data.selector === lastFlow?.data?.selector
    )
      return null;

    recording.flows.push(block);

    return block;
  });
}

async function onKeydown(event) {
  if (isAutomaInstance(event.target) || event.repeat) return;

  const isTextField = isTextFieldEl(event.target);
  
  // Ctrl+Alt+P key detection for parameters
  if (event.key === 'p' && event.ctrlKey && event.altKey && isTextField && !event.metaKey && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    
    // Check if parameter was already recorded
    if (parameterAlreadyRecorded && !parameterMode) {
      console.log('Parameter already recorded in this session. Only one parameter allowed.');
      // Show visual feedback that parameter is not allowed
      event.target.style.outline = '3px solid #ef4444'; // Red outline
      event.target.style.outlineOffset = '2px';
      setTimeout(() => {
        event.target.style.outline = '';
        event.target.style.outlineOffset = '';
      }, 1000);
      return;
    }
    
    if (!parameterMode) {
      // Start parameter mode
      parameterMode = true;
      parameterStartIndex = event.target.selectionStart;
      parameterFieldSelector = findSelector(event.target);
      parameterOriginalValue = event.target.value; // Store original value
      
      // Visual feedback - green outline
      event.target.style.outline = '3px solid #10b981';
      event.target.style.outlineOffset = '2px';
      
      console.log('Parameter mode started at position:', parameterStartIndex);
      
      return;
    } else {
      // End parameter mode
      parameterMode = false;
      const paramEnd = event.target.selectionStart;
      const currentValue = event.target.value;
      const paramName = currentValue.substring(parameterStartIndex, paramEnd);
      
      // Create the value with parameter for saving to workflow
      const valueForWorkflow = 
        parameterOriginalValue.substring(0, parameterStartIndex) + 
        `{{parameter}}` + 
        parameterOriginalValue.substring(paramEnd);
      
      // Keep the original user-entered value in the input field (don't change what user sees)
      // event.target.value remains unchanged
      
      // Remove visual feedback
      event.target.style.outline = '';
      event.target.style.outlineOffset = '';
      
      // Mark parameter as recorded
      parameterAlreadyRecorded = true;
      
      console.log('Parameter created for workflow: {{parameter}}');
      console.log('User sees in field:', currentValue);
      console.log('Workflow will save:', valueForWorkflow);
      
      // Update the recorded value in workflow
      addBlock((recording) => {
        // Find the last forms block for this field
        let foundBlock = false;
        for (let i = recording.flows.length - 1; i >= 0; i--) {
          const flow = recording.flows[i];
          if (flow.id === 'forms' && flow.data.selector === parameterFieldSelector) {
            flow.data.value = valueForWorkflow; // Save {{parameter}} version
            foundBlock = true;
            break;
          }
        }
        
        // If no existing Forms block found, create a new one
        if (!foundBlock) {
          const elementName = (event.target.ariaLabel || event.target.name || '').slice(0, 12);
          const newBlock = {
            id: 'forms',
            data: {
              selector: parameterFieldSelector,
              delay: 100,
              clearValue: true,
              type: 'text-field',
              value: valueForWorkflow, // Save {{parameter}} version
              waitForSelector: true,
              description: `Text field (${elementName})`,
            },
          };
          recording.flows.push(newBlock);
          return newBlock;
        }
        
        return null;
      });
      
      return;
    }
  }

  // Original Enter key handling
  const enterKey = event.key === 'Enter';
  let isSubmitting = false;

  if (isTextField) {
    const inputInForm = event.target.form && event.target.tagName === 'INPUT';
    if (enterKey && inputInForm) {
      event.preventDefault();

      // Mark form submission time to avoid recording URL change
      window.lastFormSubmission = Date.now();

      await addBlock({
        id: 'forms',
        data: {
          delay: 100,
          clearValue: true,
          type: 'text-field',
          waitForSelector: true,
          value: event.target.value,
          selector: findSelector(event.target),
        },
      });

      isSubmitting = true;
    } else if (enterKey) {
      // For non-form inputs, still record the enter key
      // Also mark as form submission to prevent URL recording
      window.lastFormSubmission = Date.now();
      
      recordPressedKey(event, (keysArr) => {
        const keys = keysArr.join('+');

        addBlock((recording) => {
          const block = {
            id: 'press-key',
            description: `Press: ${keys}`,
            data: {
              keys,
              selector: findSelector(event.target),
            },
          };

          recording.flows.push(block);
          return block;
        });
      });
      return;
    } else {
      return;
    }
  }

  recordPressedKey(event, (keysArr) => {
    const selector = isTextField && enterKey ? findSelector(event.target) : '';
    const keys = keysArr.join('+');

    addBlock((recording) => {
      const block = {
        id: 'press-key',
        description: `Press: ${keys}`,
        data: {
          keys,
          selector,
        },
      };

      const lastFlow = recording.flows.at(-1);
      if (lastFlow && lastFlow.id === 'press-key') {
        if (!lastFlow.groupId) lastFlow.groupId = nanoid();
        block.groupId = lastFlow.groupId;
      }

      recording.flows.push(block);

      if (isSubmitting) {
        setTimeout(() => {
          event.target.form.submit();
        }, 500);
      }

      return block;
    });
  });
}

function onClick(event) {
  const { target } = event;
  if (isAutomaInstance(target)) return;

  const isTextField =
    (target.tagName === 'INPUT' && target.getAttribute('type') === 'text') ||
    ['SELECT', 'TEXTAREA'].includes(target.tagName);

  if (isTextField) return;

  let isClickLink = false;
  const selector = findSelector(target);

  if (target.tagName === 'A') {
    if (event.ctrlKey || event.metaKey) return;

    const openInNewTab = target.getAttribute('target') === '_blank';
    isClickLink = true;

    if (openInNewTab) {
      event.preventDefault();

      const description = (target.innerText || target.href)?.slice(0, 24) || '';

      addBlock({
        id: 'link',
        description,
        data: {
          selector,
          description,
        },
      });

      window.open(event.target.href, '_blank');

      return;
    } else {
      // Mark link click to avoid recording URL change
      window.lastFormSubmission = Date.now();
    }
  }

  const elText =
    (target.innerText || target.ariaLabel || target.title)?.slice(0, 24) || '';

  addBlock({
    isClickLink,
    id: 'event-click',
    description: elText,
    data: {
      selector,
      description: elText,
      waitForSelector: true,
    },
  });
}

const onMessage = debounce(({ data, source }) => {
  if (data.type !== 'automa:record-events') return;

  let { frameSelector } = data;

  if (!frameSelector) {
    const frames = document.querySelectorAll('iframe, frame');

    frames.forEach((frame) => {
      if (frame.contentWindow !== source) return;

      frameSelector = finder(frame);
    });
  }

  if (!frameSelector) return;

  const lastFlow = data.recording.flows.at(-1);
  if (!lastFlow) return;

  const lastIndex = data.recording.flows.length - 1;
  data.recording.flows[
    lastIndex
  ].data.selector = `${frameSelector} |> ${lastFlow.data.selector}`;

  browser.storage.local.set({ recording: data.recording });
}, 100);

const onScroll = debounce(({ target }) => {
  if (isAutomaInstance(target)) return;

  const isDocument = target === document;
  const element = isDocument ? document.documentElement : target;
  const selector = isDocument ? 'html' : findSelector(target);

  addBlock((recording) => {
    const lastFlow = recording.flows[recording.flows.length - 1];
    const verticalScroll = element.scrollTop || element.scrollY || 0;
    const horizontalScroll = element.scrollLeft || element.scrollX || 0;

    if (lastFlow && lastFlow.id === 'element-scroll') {
      lastFlow.data.scrollY = verticalScroll;
      lastFlow.data.scrollX = horizontalScroll;

      return;
    }

    recording.flows.push({
      id: 'element-scroll',
      data: {
        selector,
        smooth: true,
        scrollY: verticalScroll,
        scrollX: horizontalScroll,
      },
    });
  });
}, 500);

const onInputTextField = debounce(({ target }) => {
  const selector = target.dataset.automaElSelector;
  if (!selector) return;

  // Don't update value if we're in parameter mode
  if (parameterMode) {
    console.log('Skipping input update - in parameter mode');
    return;
  }

  addBlock((recording) => {
    const lastFlow = recording.flows[recording.flows.length - 1];
    if (
      lastFlow &&
      lastFlow.id === 'forms' &&
      lastFlow.data.selector === selector
    ) {
      // Only update value if it doesn't contain parameters
      if (!lastFlow.data.value || !lastFlow.data.value.includes('{{')) {
        lastFlow.data.value = target.value;
      }
      return;
    }

    const elementName = (target.ariaLabel || target.name || '').slice(0, 12);
    recording.flows.push({
      id: 'forms',
      data: {
        selector,
        delay: 100,
        clearValue: true,
        type: 'text-field',
        value: target.value,
        waitForSelector: true,
        description: `Text field (${elementName})`,
      },
    });
  });
}, 300);

function onFocusIn({ target }) {
  if (!isTextFieldEl(target)) return;

  target.setAttribute('data-automa-el-selector', findSelector(target));
  target.addEventListener('input', onInputTextField);
}

function onFocusOut({ target }) {
  if (!isTextFieldEl(target)) return;

  target.removeEventListener('input', onInputTextField);
}

// Add active tab block after trigger (only once)
function addActiveTabBlock() {
  if (activeTabAdded) return; // Prevent multiple additions
  
  activeTabAdded = true;
  addBlock({
    id: 'active-tab',
    description: 'Active tab',
    data: {}
  });
}

export function cleanUp() {
  if (isMainFrame) {
    window.removeEventListener('message', onMessage);
    document.removeEventListener('scroll', onScroll, true);
    
    // Stop checking for URL changes
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
      urlCheckInterval = null;
    }
  }

  document.removeEventListener('click', onClick, true);
  document.removeEventListener('change', onChange, true);
  document.removeEventListener('focusin', onFocusIn, true);
  document.removeEventListener('keydown', onKeydown, true);
  document.removeEventListener('focusout', onFocusOut, true);
  
  // Reset all state variables
  parameterMode = false;
  parameterStartIndex = -1;
  parameterFieldSelector = null;
  userNavigatedToUrl = false;
  activeTabAdded = false;
  parameterAlreadyRecorded = false;
  parameterOriginalValue = '';
}

export default async function (mainFrame) {
  const { isRecording } = await browser.storage.local.get('isRecording');

  isMainFrame = mainFrame;

  if (isRecording) {
    // Add active tab block right after starting recording (only once at the beginning)
    if (isMainFrame && !activeTabAdded) {
      // Delay to ensure trigger block is added first
      setTimeout(() => {
        addActiveTabBlock();
      }, 100);
      
      window.addEventListener('message', onMessage);
      document.addEventListener('scroll', onScroll, true);
      
      // Setup address bar detection for manual navigation
      setupAddressBarDetection();
      
      // Start checking for URL changes
      lastUrl = window.location.href;
      urlCheckInterval = setInterval(checkUrlChange, 500);
    }

    if (isTextFieldEl(document.activeElement)) {
      onFocusIn({ target: document.activeElement });
    }

    document.addEventListener('click', onClick, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('focusout', onFocusOut, true);
  }

  return cleanUp;
}