// Discord Webhook URL
const webhookURL = "https://discord.com/api/webhooks/1481735132850163724/z6r-Nw7uQNfUnGjuxMUJ016oRDUPEfXPJ9Nk5NZpBeNoEqZV7sGL_msAuyKWevZm-UnZ";

// ========== Helper Functions ==========
function generateSuggestionID() {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `SUG-${timestamp}-${random}`;
}

function getFormattedTimestamp() {
  const now = new Date();
  return now.toLocaleString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ========== SEND SUGGESTION TO DISCORD ==========
async function sendSuggestionToDiscord(data) {
  const suggestionID = generateSuggestionID();
  const timestamp = getFormattedTimestamp();
  
  const categoryEmojis = {
    'New Feature': '✨',
    'Improvement': '⚡',
    'Design': '🎨',
    'Content': '📝',
    'Other': '💡'
  };
  
  const emoji = categoryEmojis[data.category] || '💭';
  
  const discordMessage = {
    embeds: [
      {
        title: `${emoji} New Suggestion: ${data.title}`,
        color: 0xc084fc,
        timestamp: new Date().toISOString(),
        fields: [
          {
            name: "🆔 Suggestion ID",
            value: `\`${suggestionID}\``,
            inline: true
          },
          {
            name: "👤 Submitted By",
            value: data.name,
            inline: true
          },
          {
            name: "💬 Discord Username",
            value: data.discordId,
            inline: true
          },
          {
            name: "📂 Category",
            value: `${emoji} ${data.category}`,
            inline: true
          },
          {
            name: "⏰ Submitted At",
            value: timestamp,
            inline: true
          },
          {
            name: "💡 Suggestion Details",
            value: data.message.length > 800 ? 
                   data.message.substring(0, 797) + "..." : 
                   data.message,
            inline: false
          }
        ],
        footer: {
          text: "e3mely Suggestions • Review in Discord",
          icon_url: "https://cdn.discordapp.com/embed/avatars/0.png"
        }
      }
    ],
    username: "💡 Suggestion System",
    avatar_url: "https://cdn-icons-png.flaticon.com/512/1828/1828884.png",
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            label: "Join Discord",
            style: 5,
            url: "https://discord.gg/mDpEsfQjB3"
          }
        ]
      }
    ]
  };
  
  const response = await fetch(webhookURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(discordMessage)
  });
  
  return { response, suggestionID };
}

// ========== SUGGESTIONS FORM HANDLER ==========
document.getElementById("suggestions-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  
  // Get form values
  const name = document.getElementById("suggestion-name").value.trim();
  const discordId = document.getElementById("suggestion-discord").value.trim();
  const category = document.getElementById("suggestion-category").value;
  const title = document.getElementById("suggestion-title").value.trim();
  const message = document.getElementById("suggestion-message").value.trim();
  
  const thankYou = document.getElementById("suggestion-thanks");
  const errorMsg = document.getElementById("suggestion-error");
  
  // Hide any existing messages
  thankYou.classList.add("hidden");
  errorMsg.classList.add("hidden");
  
  // Validation
  if (!name || !discordId || !category || !title || !message) {
    errorMsg.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Please fill in all fields!';
    errorMsg.classList.remove("hidden");
    setTimeout(() => errorMsg.classList.add("hidden"), 5000);
    return;
  }
  
  if (message.length < 10) {
    errorMsg.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Please provide more details about your suggestion (minimum 10 characters)';
    errorMsg.classList.remove("hidden");
    setTimeout(() => errorMsg.classList.add("hidden"), 5000);
    return;
  }
  
  if (discordId.length < 2) {
    errorMsg.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Please enter a valid Discord username!';
    errorMsg.classList.remove("hidden");
    setTimeout(() => errorMsg.classList.add("hidden"), 5000);
    return;
  }
  
  // Disable submit button
  const submitBtn = document.querySelector(".suggestion-submit");
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Submitting...';
  
  const suggestionData = {
    name: name,
    discordId: discordId,
    category: category,
    title: title,
    message: message
  };
  
  try {
    const { response, suggestionID } = await sendSuggestionToDiscord(suggestionData);
    
    if (response.ok) {
      thankYou.innerHTML = `<i class="fas fa-check-circle"></i> Suggestion ${suggestionID} submitted successfully! We'll review it soon.`;
      thankYou.classList.remove("hidden");
      
      // Reset form
      this.reset();
      
      // Auto hide after 8 seconds
      setTimeout(() => thankYou.classList.add("hidden"), 8000);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    console.error("Submission error:", err);
    errorMsg.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed to submit. Please try again or contact us directly on Discord.';
    errorMsg.classList.remove("hidden");
    setTimeout(() => errorMsg.classList.add("hidden"), 6000);
  } finally {
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
});

// Auto-format Discord ID input (remove spaces)
document.getElementById("suggestion-discord").addEventListener("input", function(e) {
  this.value = this.value.replace(/\s/g, '');
});

// Character counter for suggestion message
const suggestionField = document.getElementById("suggestion-message");
const charCounter = document.createElement("div");
charCounter.className = "char-counter";
charCounter.style.cssText = "text-align: right; font-size: 0.7rem; color: #a0a0a0; margin-top: 5px;";
suggestionField.parentNode.appendChild(charCounter);

suggestionField.addEventListener("input", function() {
  const remaining = 1000 - this.value.length;
  if (remaining >= 0) {
    charCounter.textContent = `${remaining} characters remaining`;
    charCounter.style.color = "#a0a0a0";
  } else {
    charCounter.textContent = `Exceeded by ${Math.abs(remaining)} characters`;
    charCounter.style.color = "#ff6b6b";
  }
});

charCounter.textContent = "1000 characters remaining";