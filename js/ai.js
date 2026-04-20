// js/ai.js — Nazamly AI Chat (Groq only, text chat)

// ======================== API CONFIGURATION ========================
const GROQ_API_KEYS = [
    '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',
    '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'
];

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it',
    'mixtral-8x7b-32768'
];

// ======================== DOM Elements ========================
const messagesArea    = document.getElementById('messagesArea');
const userInput       = document.getElementById('userInput');
const sendButton      = document.getElementById('sendBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const scrollBtn       = document.getElementById('scrollToBottomBtn');
const chatContainer   = document.getElementById('chatMessagesContainer');

// ======================== State ========================
let conversationHistory  = [];
let isWaitingForResponse = false;
let typingIndicatorEl    = null;

// ======================== Scroll Helpers ========================
function scrollToBottom() {
    chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
}

function updateScrollBtn() {
    if (!chatContainer) return;
    const nearBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 100;
    scrollBtn?.classList.toggle('visible', !nearBottom);
}

chatContainer?.addEventListener('scroll', updateScrollBtn);
scrollBtn?.addEventListener('click', scrollToBottom);

// ======================== Textarea Auto-resize ========================
function autoResize() {
    if (!userInput) return;
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 130) + 'px';
}

userInput?.addEventListener('input', autoResize);

// ======================== Escape HTML ========================
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ======================== Render Messages ========================
function renderMessages() {
    if (!messagesArea) return;
    messagesArea.innerHTML = '';

    if (conversationHistory.length === 0) {
        messagesArea.innerHTML = `
            <div class="welcome-message">
                <div class="ai-message-bubble">
                    <span class="message-avatar">✨</span>
                    <div class="message-content">
                        👋 Welcome to <strong>Nazamly AI</strong>!<br><br>
                        💬 Powered by Nazamly — fast, smart, and reliable.<br>
                        Ask me anything and I'll do my best to help.
                    </div>
                </div>
            </div>`;
        return;
    }

    conversationHistory.forEach(msg => {
        const isUser = msg.role === 'user';
        const wrapper = document.createElement('div');
        wrapper.className = isUser ? 'user-message-wrapper' : 'ai-message-wrapper';

        wrapper.innerHTML = isUser
            ? `<div class="user-message-bubble">
                   <span class="message-avatar">👤</span>
                   <div class="message-content">${escapeHtml(msg.content)}</div>
               </div>`
            : `<div class="ai-message-bubble">
                   <span class="message-avatar">✦</span>
                   <div class="message-content">${escapeHtml(msg.content)}</div>
               </div>`;

        messagesArea.appendChild(wrapper);
    });

    setTimeout(scrollToBottom, 30);
}

// ======================== LocalStorage ========================
function saveHistory() {
    try {
        localStorage.setItem('ai_chat_history', JSON.stringify(conversationHistory));
    } catch (e) {
        console.warn('localStorage save failed:', e);
    }
}

function loadHistory() {
    try {
        const saved = localStorage.getItem('ai_chat_history');
        if (saved) conversationHistory = JSON.parse(saved) || [];
    } catch (e) {
        conversationHistory = [];
    }
    renderMessages();
}

// ======================== Typing Indicator ========================
function showTyping() {
    removeTyping();
    const el = document.createElement('div');
    el.className = 'ai-message-wrapper';
    el.id = 'typingIndicatorWrapper';
    el.innerHTML = `
        <div class="ai-message-bubble">
            <span class="message-avatar">✦</span>
            <div class="message-content typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>`;
    messagesArea.appendChild(el);
    typingIndicatorEl = el;
    scrollToBottom();
}

function removeTyping() {
    typingIndicatorEl?.remove();
    typingIndicatorEl = null;
}

// ======================== Add Message ========================
function addMessage(role, content) {
    conversationHistory.push({ role, content });
    saveHistory();
    renderMessages();
}

// ======================== Groq API with Fallback ========================
async function callGroq(messages, modelIdx = 0, keyIdx = 0) {
    if (keyIdx >= GROQ_API_KEYS.length) throw new Error('All API keys exhausted');
    if (modelIdx >= GROQ_MODELS.length) return callGroq(messages, 0, keyIdx + 1);

    const key   = GROQ_API_KEYS[keyIdx];
    const model = GROQ_MODELS[modelIdx];

    try {
        console.log(`🟢 Groq Key ${keyIdx + 1} / ${model}`);
        const res = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2000, top_p: 1 })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.warn(`⚠️ ${model} failed (${res.status}): ${err.error?.message || ''}`);
            if (res.status === 401 || res.status === 403 || res.status === 429) {
                return callGroq(messages, 0, keyIdx + 1);
            }
            return callGroq(messages, modelIdx + 1, keyIdx);
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty response');
        console.log(`✅ Success — Key ${keyIdx + 1} / ${model}`);
        return text;

    } catch (err) {
        console.error('❌', err.message);
        return callGroq(messages, modelIdx + 1, keyIdx);
    }
}

// ======================== Send Message ========================
async function handleSend() {
    if (isWaitingForResponse) return;
    const text = userInput.value.trim();
    if (!text) return;

    isWaitingForResponse = true;
    sendButton.disabled  = true;
    userInput.disabled   = true;

    addMessage('user', text);
    userInput.value = '';
    autoResize();
    showTyping();

    // Build messages for Groq (last 15 turns for context)
    const msgs = [
        { role: 'system', content: 'You are Nazamly, a helpful, friendly, and knowledgeable AI assistant.' },
        ...conversationHistory.slice(-15).map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
        }))
    ];

    let reply;
    try {
        reply = await callGroq(msgs);
    } catch {
        reply = "Sorry, I couldn't reach the AI right now. Please try again in a moment.";
    }

    removeTyping();
    addMessage('assistant', reply);

    isWaitingForResponse = false;
    sendButton.disabled  = false;
    userInput.disabled   = false;
    userInput.focus();
    scrollToBottom();
}

// ======================== Clear History ========================
function clearConversation() {
    if (isWaitingForResponse) return;
    conversationHistory = [];
    saveHistory();
    renderMessages();
    removeTyping();
}

// ======================== Event Listeners ========================
sendButton?.addEventListener('click', handleSend);

userInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isWaitingForResponse && userInput.value.trim()) handleSend();
    }
});

clearHistoryBtn?.addEventListener('click', () => {
    if (!isWaitingForResponse && conversationHistory.length > 0) clearConversation();
});

// ======================== Init ========================
function init() {
    loadHistory();
    autoResize();
    userInput?.focus();
    setTimeout(scrollToBottom, 100);
    console.log('🚀 Nazamly AI ready ');
}

init();
window.addEventListener('resize', () => { autoResize(); updateScrollBtn(); });
