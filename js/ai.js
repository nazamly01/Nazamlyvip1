// js/ai.js — AI Chat with Groq API + Gemini Vision (من Google AI Studio)

// ======================== API CONFIGURATION ========================
// Groq API Keys for text conversations (Primary, Secondary, Third)
const GROQ_API_KEYS = [
    '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',  // Primary Groq key
    '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',  // Secondary Groq key
    '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'                        // Third key (Hugging Face)
];

// Gemini API Key من Google AI Studio
// استخدم أي مفتاح من اللي عندك في الصورة
const GEMINI_API_KEY = 'AIzaSyBuxIwKPXwWCZNdbwS3J4OynTzvQ8FxHQw'; // المفتاح اللي عندك

// Gemini API للصور
const GEMINI_VISION_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Models for Groq (text only)
const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it',
    'mixtral-8x7b-32768'
];

// ======================== DOM Elements ========================
const messagesArea = document.getElementById('messagesArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
const chatContainer = document.getElementById('chatMessagesContainer');
const imageUploadBtn = document.getElementById('imageUploadBtn');
const fileUploadBtn = document.getElementById('fileUploadBtn');
const imageInput = document.getElementById('imageInput');
const fileInput = document.getElementById('fileInput');

// ======================== State Management ========================
let conversationHistory = [];
let isWaitingForResponse = false;

// ======================== Helper Functions ========================

function autoResizeTextarea() {
    if (!userInput) return;
    userInput.style.height = 'auto';
    const newHeight = Math.min(userInput.scrollHeight, 130);
    userInput.style.height = newHeight + 'px';
}

function scrollToBottom() {
    if (chatContainer) {
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
}

function updateScrollButtonVisibility() {
    if (!chatContainer) return;
    const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 100;
    if (isNearBottom) {
        scrollToBottomBtn?.classList.remove('visible');
    } else {
        scrollToBottomBtn?.classList.add('visible');
    }
}

if (chatContainer) {
    chatContainer.addEventListener('scroll', updateScrollButtonVisibility);
}

if (scrollToBottomBtn) {
    scrollToBottomBtn.addEventListener('click', () => {
        scrollToBottom();
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderMessages() {
    if (!messagesArea) return;
    
    messagesArea.innerHTML = '';
    
    if (conversationHistory.length === 0) {
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        
        welcomeDiv.innerHTML = `
            <div class="ai-message-bubble">
                <span class="message-avatar">✨</span>
                <div class="message-content">
                    🤖 Welcome to Nazamly AI!<br><br>
                    📸 <strong>Gemini Vision is ACTIVE!</strong> Upload any image and Gemini will analyze it for you!<br>
                    💬 For text conversations, I use Groq AI with multi-key fallback.<br>
                    📁 You can also upload files (TXT, JS, HTML, CSS, JSON, PY, etc.).<br><br>
                    <span style="font-size: 0.85rem; color: #10b981;">✅ Try uploading an image now!</span>
                </div>
            </div>
        `;
        messagesArea.appendChild(welcomeDiv);
        return;
    }
    
    conversationHistory.forEach(msg => {
        const isUser = msg.role === 'user';
        const messageDiv = document.createElement('div');
        messageDiv.className = isUser ? 'user-message-wrapper' : 'ai-message-wrapper';
        
        let attachmentHtml = '';
        if (msg.attachment) {
            if (msg.attachment.type === 'image') {
                attachmentHtml = `<div class="preview-container"><img src="${msg.attachment.data}" class="message-image" alt="Uploaded image" onclick="window.open(this.src)"></div>`;
            } else if (msg.attachment.type === 'file') {
                attachmentHtml = `<div class="message-file">📎 ${escapeHtml(msg.attachment.name)} (${msg.attachment.size})</div>`;
            }
        }
        
        if (isUser) {
            messageDiv.innerHTML = `
                <div class="user-message-bubble">
                    <span class="message-avatar">👤</span>
                    <div class="message-content">
                        ${attachmentHtml}
                        ${msg.content ? escapeHtml(msg.content) : ''}
                    </div>
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="ai-message-bubble">
                    <span class="message-avatar">✦</span>
                    <div class="message-content">${escapeHtml(msg.content)}</div>
                </div>
            `;
        }
        messagesArea.appendChild(messageDiv);
    });
    
    setTimeout(() => scrollToBottom(), 30);
}

function saveChatToLocalStorage() {
    try {
        const historyToStore = conversationHistory.map(msg => {
            if (msg.attachment && msg.attachment.type === 'image' && msg.attachment.data && msg.attachment.data.length > 5000) {
                return { ...msg, attachment: { ...msg.attachment, data: '[IMAGE_DATA_OMITTED]' } };
            }
            return msg;
        });
        localStorage.setItem('ai_chat_history', JSON.stringify(historyToStore));
    } catch (e) {
        console.warn('localStorage save failed:', e);
    }
}

function loadChatHistory() {
    const saved = localStorage.getItem('ai_chat_history');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                conversationHistory = parsed;
            }
        } catch (e) {
            console.error('Failed to parse localStorage chat', e);
            conversationHistory = [];
        }
    }
    renderMessages();
}

function clearConversation() {
    if (isWaitingForResponse) return;
    conversationHistory = [];
    saveChatToLocalStorage();
    renderMessages();
    removeTypingIndicator();
}

let typingIndicatorElement = null;

function showTypingIndicator() {
    removeTypingIndicator();
    
    const loadingWrapper = document.createElement('div');
    loadingWrapper.className = 'ai-message-wrapper';
    loadingWrapper.id = 'typingIndicatorWrapper';
    loadingWrapper.innerHTML = `
        <div class="ai-message-bubble">
            <span class="message-avatar">✦</span>
            <div class="message-content typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    messagesArea.appendChild(loadingWrapper);
    typingIndicatorElement = loadingWrapper;
    scrollToBottom();
}

function removeTypingIndicator() {
    if (typingIndicatorElement && typingIndicatorElement.parentNode) {
        typingIndicatorElement.remove();
        typingIndicatorElement = null;
    }
}

function addMessageToChat(role, content, attachment = null) {
    conversationHistory.push({ role, content, attachment });
    saveChatToLocalStorage();
    renderMessages();
}

// ======================== GROQ API with Multi-Key Fallback ========================
async function sendToGroqWithFallback(messages, modelIndex = 0, keyIndex = 0) {
    if (keyIndex >= GROQ_API_KEYS.length) {
        throw new Error('All Groq API keys exhausted');
    }
    
    if (modelIndex >= GROQ_MODELS.length) {
        return sendToGroqWithFallback(messages, 0, keyIndex + 1);
    }
    
    const apiKey = GROQ_API_KEYS[keyIndex];
    const model = GROQ_MODELS[modelIndex];
    
    try {
        console.log(`🟢 Trying Groq API Key ${keyIndex + 1} with model: ${model}...`);
        
        const requestBody = {
            model: model,
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000,
            top_p: 1
        };
        
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            let errorMessage = `Error: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorMessage;
            } catch (e) {}
            
            if (response.status === 401 || response.status === 403 || response.status === 429) {
                console.warn(`⚠️ API Key ${keyIndex + 1} failed, trying next key`);
                return sendToGroqWithFallback(messages, 0, keyIndex + 1);
            } else {
                console.warn(`⚠️ Model ${model} failed, trying next model`);
                return sendToGroqWithFallback(messages, modelIndex + 1, keyIndex);
            }
        }
        
        const data = await response.json();
        const aiResponse = data.choices[0]?.message?.content;
        
        if (aiResponse) {
            console.log(`✅ Groq success with API Key ${keyIndex + 1}, model: ${model}`);
            return aiResponse;
        } else {
            throw new Error('No response content');
        }
        
    } catch (error) {
        console.error(`❌ Attempt failed:`, error.message);
        return sendToGroqWithFallback(messages, modelIndex + 1, keyIndex);
    }
}

// ======================== GEMINI VISION API (لتحليل الصور) ========================
async function analyzeImageWithGemini(imageBase64, userQuestion) {
    try {
        console.log('🟢 Sending image to Gemini Vision for analysis...');
        
        // Remove data URL prefix if present
        let base64Data = imageBase64;
        if (imageBase64.includes(',')) {
            base64Data = imageBase64.split(',')[1];
        }
        
        // Detect MIME type
        let mimeType = 'image/jpeg';
        if (imageBase64.startsWith('data:image/png')) {
            mimeType = 'image/png';
        } else if (imageBase64.startsWith('data:image/gif')) {
            mimeType = 'image/gif';
        } else if (imageBase64.startsWith('data:image/webp')) {
            mimeType = 'image/webp';
        }
        
        const requestBody = {
            contents: [{
                parts: [
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Data
                        }
                    },
                    {
                        text: userQuestion || "Please analyze this image in detail. Describe what you see, including any objects, people, text, colors, or notable details. Be thorough and specific."
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2000,
                topP: 0.95,
                topK: 40
            }
        };
        
        const apiUrl = `${GEMINI_VISION_URL}?key=${GEMINI_API_KEY}`;
        console.log('🟢 Calling Gemini API...');
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', errorText);
            throw new Error(`Gemini API error: ${response.status}`);
        }
        
        const data = await response.json();
        const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (analysis) {
            console.log('✅ Gemini Vision analysis complete!');
            return `🔍 **Gemini Vision Analysis:**\n\n${analysis}`;
        } else {
            throw new Error('No analysis returned');
        }
        
    } catch (error) {
        console.error('❌ Gemini Vision failed:', error);
        return await fallbackImageAnalysis(userQuestion);
    }
}

async function fallbackImageAnalysis(userQuestion) {
    return `📸 I received your image!

**Gemini Vision Status:** 
${!GEMINI_API_KEY ? '❌ API key not configured.' : '⚠️ Could not analyze image'}

The image has been uploaded successfully. You can see it in the chat.

${userQuestion ? `Your question: "${userQuestion}"` : 'What would you like to know about this image?'}

💡 Tip: Try describing the image to me and I'll help based on your description!`;
}

// ======================== FILE PROCESSING ========================
async function processFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const content = e.target.result;
            const fileName = file.name;
            const fileSize = formatFileSize(file.size);
            
            if (file.type.includes('text') || fileName.match(/\.(txt|js|html|css|json|py|md|cpp|c|java|rb|go|rs)$/)) {
                resolve({
                    type: 'text',
                    content: content,
                    name: fileName,
                    size: fileSize
                });
            } else {
                resolve({
                    type: 'binary',
                    name: fileName,
                    size: fileSize,
                    mimeType: file.type
                });
            }
        };
        reader.onerror = reject;
        
        if (file.type.includes('text') || file.name.match(/\.(txt|js|html|css|json|py|md|cpp|c|java|rb|go|rs)$/)) {
            reader.readAsText(file);
        } else {
            reader.readAsDataURL(file);
        }
    });
}

async function analyzeFileWithGroq(fileData, userQuestion) {
    let fileContentPrompt = '';
    if (fileData.type === 'text') {
        fileContentPrompt = `\n\n--- FILE CONTENT (${fileData.name}) ---\n${fileData.content.substring(0, 8000)}\n--- END OF FILE CONTENT ---\n\n`;
    } else {
        fileContentPrompt = `\n\n📁 File: ${fileData.name} (${fileData.size})\nThis file has been uploaded.\n\n`;
    }
    
    const userContent = userQuestion 
        ? `${fileContentPrompt}User question: ${userQuestion}`
        : `${fileContentPrompt}Please analyze this file.`;
    
    const messages = [
        { role: 'system', content: 'You are a helpful AI assistant that analyzes uploaded files.' },
        { role: 'user', content: userContent }
    ];
    
    try {
        const response = await sendToGroqWithFallback(messages);
        return response;
    } catch (error) {
        return `📁 I received your file "${fileData.name}" (${fileData.size}).\n\nWhat would you like to know about it?`;
    }
}

// ======================== TEXT CHAT WITH GROQ ========================
async function sendTextToGroq(userMessage) {
    const messages = [
        { 
            role: 'system', 
            content: 'You are NovaMind, a helpful, friendly, and knowledgeable AI assistant.' 
        }
    ];
    
    const recentHistory = conversationHistory.slice(-15);
    for (const msg of recentHistory) {
        if (msg.role === 'assistant') {
            messages.push({ role: 'assistant', content: msg.content });
        } else if (msg.role === 'user') {
            messages.push({ role: 'user', content: msg.content });
        }
    }
    
    messages.push({ role: 'user', content: userMessage });
    
    try {
        const response = await sendToGroqWithFallback(messages);
        return response;
    } catch (error) {
        return generateSmartFallbackResponse(userMessage);
    }
}

function generateSmartFallbackResponse(userMessage) {
    return `Thanks for your message! I'm here to help.\n\n💡 Tips:\n• Click 🖼️ to upload images (Gemini Vision will analyze them!)\n• Click 📎 to upload files\n• Ask me anything!\n\nYour message: "${userMessage.substring(0, 100)}"`;
}

// ======================== EVENT HANDLERS ========================
imageUploadBtn?.addEventListener('click', () => imageInput?.click());
fileUploadBtn?.addEventListener('click', () => fileInput?.click());

imageInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        alert('Image too large (max 10MB)');
        return;
    }
    if (isWaitingForResponse) {
        alert('Please wait for current response');
        return;
    }
    
    showTypingIndicator();
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        const imageBase64 = event.target.result;
        addMessageToChat('user', '📸 [Image uploaded]', {
            type: 'image',
            data: imageBase64,
            name: file.name
        });
        
        const analysis = await analyzeImageWithGemini(imageBase64, 'Please analyze this image in detail. Describe everything you see.');
        removeTypingIndicator();
        addMessageToChat('assistant', analysis);
        imageInput.value = '';
    };
    reader.readAsDataURL(file);
});

fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
        alert('File too large (max 25MB)');
        return;
    }
    if (isWaitingForResponse) {
        alert('Please wait for current response');
        return;
    }
    
    showTypingIndicator();
    
    const fileData = await processFile(file);
    addMessageToChat('user', `📁 [File: ${file.name}]`, {
        type: 'file',
        name: file.name,
        size: fileData.size
    });
    
    const analysis = await analyzeFileWithGroq(fileData, 'Please analyze this file');
    removeTypingIndicator();
    addMessageToChat('assistant', analysis);
    fileInput.value = '';
});

sendButton?.addEventListener('click', handleUserSend);

userInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isWaitingForResponse && userInput.value.trim()) {
            handleUserSend();
        }
    }
});

userInput?.addEventListener('input', autoResizeTextarea);

clearHistoryBtn?.addEventListener('click', () => {
    if (!isWaitingForResponse && conversationHistory.length > 0) {
        clearConversation();
    }
});

async function handleUserSend() {
    if (isWaitingForResponse) return;
    
    const messageText = userInput.value.trim();
    if (!messageText) return;
    
    isWaitingForResponse = true;
    sendButton.disabled = true;
    userInput.disabled = true;
    
    addMessageToChat('user', messageText);
    userInput.value = '';
    autoResizeTextarea();
    showTypingIndicator();
    
    const aiResponse = await sendTextToGroq(messageText);
    removeTypingIndicator();
    addMessageToChat('assistant', aiResponse);
    
    isWaitingForResponse = false;
    sendButton.disabled = false;
    userInput.disabled = false;
    userInput.focus();
    scrollToBottom();
}

// ======================== INITIALIZATION ========================
function init() {
    loadChatHistory();
    if (userInput) {
        autoResizeTextarea();
        userInput.focus();
    }
    setTimeout(() => scrollToBottom(), 100);
    console.log('🚀 Nazamly AI with Gemini Vision initialized!');
    console.log(`🔑 Gemini API Key: ${GEMINI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
}

init();
window.addEventListener('resize', () => {
    autoResizeTextarea();
    updateScrollButtonVisibility();
});
