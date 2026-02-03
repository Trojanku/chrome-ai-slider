// Side panel logic for ai-slider chat interface

const messageInput = document.getElementById("message-input");
const btnPage = document.getElementById("btn-page");
const btnSend = document.getElementById("btn-send");
const contextIndicator = document.getElementById("context-indicator");
const chatMessages = document.getElementById("chat-messages");

// State
let currentContext = null;
let currentUrl = null;
let currentTitle = null;
let messageHistory = [];
let isProcessing = false;

function setInputEnabled(enabled) {
  messageInput.disabled = !enabled;
  btnSend.disabled = !enabled;
  btnPage.disabled = !enabled;
  isProcessing = !enabled;
}

function updateContextDisplay(charCount) {
  if (charCount > 0) {
    contextIndicator.textContent = `${charCount.toLocaleString()} chars`;
    contextIndicator.classList.remove("hidden");
    btnPage.classList.add("loaded");
  } else {
    contextIndicator.classList.add("hidden");
    btnPage.classList.remove("loaded");
  }
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function clearWelcomeMessage() {
  const welcome = chatMessages.querySelector(".welcome-message");
  if (welcome) {
    welcome.remove();
  }
}

function addMessage(role, content) {
  clearWelcomeMessage();

  const messageEl = document.createElement("div");
  messageEl.className = `message ${role}`;
  // SECURITY: Always use textContent to prevent XSS
  messageEl.textContent = content;

  chatMessages.appendChild(messageEl);
  scrollToBottom();

  messageHistory.push({ role, content });
}

function addErrorMessage(content) {
  clearWelcomeMessage();

  const messageEl = document.createElement("div");
  messageEl.className = "message error";
  messageEl.textContent = content;

  chatMessages.appendChild(messageEl);
  scrollToBottom();
}

function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.id = "typing-indicator";
  indicator.innerHTML = "<span></span><span></span><span></span>";

  chatMessages.appendChild(indicator);
  scrollToBottom();
}

function hideTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) {
    indicator.remove();
  }
}

async function extractContent() {
  setInputEnabled(false);

  try {
    const result = await chrome.runtime.sendMessage({
      type: "extract",
      mode: "page",
    });

    if (result.error) {
      throw new Error(result.error);
    }

    currentContext = result.context;
    currentUrl = result.url;
    currentTitle = result.title;

    updateContextDisplay(result.charCount);
  } catch (err) {
    addErrorMessage(`Failed to extract: ${err.message}`);
    currentContext = null;
    updateContextDisplay(0);
  } finally {
    setInputEnabled(true);
    messageInput.focus();
  }
}

async function sendMessage() {
  const question = messageInput.value.trim();

  if (!question) {
    return;
  }

  // Auto-extract context if not loaded
  if (!currentContext) {
    setInputEnabled(false);
    try {
      const result = await chrome.runtime.sendMessage({
        type: "extract",
        mode: "page",
      });

      if (result.error) {
        throw new Error(result.error);
      }

      currentContext = result.context;
      currentUrl = result.url;
      currentTitle = result.title;
      updateContextDisplay(result.charCount);
    } catch (err) {
      addErrorMessage(`Failed to extract page: ${err.message}`);
      setInputEnabled(true);
      return;
    }
  }

  // Add user message
  addMessage("user", question);
  messageInput.value = "";

  setInputEnabled(false);
  showTypingIndicator();

  try {
    // Build conversation history for context (exclude current question)
    const history = messageHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const result = await chrome.runtime.sendMessage({
      type: "ask",
      question: question,
      context: currentContext,
      url: currentUrl,
      title: currentTitle,
      history: history,
    });

    hideTypingIndicator();

    if (result.error) {
      throw new Error(result.error);
    }

    addMessage("assistant", result.answer);
  } catch (err) {
    hideTypingIndicator();

    let errorMessage = err.message;

    // Friendly error for connection issues
    if (
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("NetworkError")
    ) {
      errorMessage =
        "Cannot connect to backend. Is it running at localhost:8787?";
    }

    addErrorMessage(errorMessage);
  } finally {
    setInputEnabled(true);
    messageInput.focus();
  }
}

// Event listeners
btnPage.addEventListener("click", extractContent);
btnSend.addEventListener("click", sendMessage);

// Enter to send
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !isProcessing) {
    e.preventDefault();
    sendMessage();
  }
});

// Handle incoming selection from context menu
async function handlePendingSelection(pending) {
  if (!pending || !pending.selectedText) return;

  // Clear the pending selection from storage
  await chrome.storage.local.remove("pendingSelection");

  // Clear all previous messages and history (fresh start with new selection)
  chatMessages.innerHTML = "";
  messageHistory = [];

  // Build context that includes both selection and page
  const selectionContext = `SELECTED TEXT:\n${pending.selectedText}\n\nFULL PAGE CONTEXT:\n${pending.pageContext}`;
  currentContext = selectionContext;
  currentUrl = pending.url;
  currentTitle = pending.title;

  // Update display
  updateContextDisplay(currentContext.length);

  // Show the selection as a message in the chat
  const selectionText =
    pending.selectedText.length > 500
      ? pending.selectedText.substring(0, 500) + "..."
      : pending.selectedText;

  const selectionMsg = document.createElement("div");
  selectionMsg.className = "message selection";
  selectionMsg.textContent = `📋 Selected text:\n"${selectionText}"`;
  chatMessages.appendChild(selectionMsg);

  // Update placeholder and focus
  messageInput.placeholder = "Ask about this selection...";
  messageInput.focus();
}

// Check for pending selection from context menu
async function checkPendingSelection() {
  try {
    const result = await chrome.storage.local.get("pendingSelection");
    const pending = result.pendingSelection;

    if (pending && pending.timestamp) {
      // Only use if recent (within last 10 seconds)
      const age = Date.now() - pending.timestamp;
      if (age < 10000) {
        await handlePendingSelection(pending);
      } else {
        // Clear stale pending selection
        await chrome.storage.local.remove("pendingSelection");
      }
    }
  } catch (err) {
    console.error("Error checking pending selection:", err);
  }
}

// Listen for storage changes (when selection comes in while panel is open)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.pendingSelection?.newValue) {
    const pending = changes.pendingSelection.newValue;
    // Only handle recent selections
    const age = Date.now() - pending.timestamp;
    if (age < 10000) {
      handlePendingSelection(pending);
    }
  }
});

// Initial state
updateContextDisplay(0);
messageInput.placeholder = "Ask a question about this page...";
messageInput.focus();
checkPendingSelection();
