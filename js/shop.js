// script.js - Nazamy Shop - يدعم الكميات وصفحة نجاح الطلب

// ========== GLOBAL VARIABLES ==========
let cartItems = [];
let appliedCoupon = null;
let finalPrice = 0;

// ========== PAYMENT DETAILS ==========
const paymentDetails = {
    Instapay: "💸 Send to Instapay: omarnashar1",
    Telda: "💳 Telda: @omarnashar0",
    PayPal: "🌐 PayPal: @pmracwasdl7v3vd"
};

// ========== DISCORD WEBHOOK ==========
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1490594490099171389/3trWfl7lo6kLUKmHnGwYgjSxT6YWPeBa3AeYUDs6tiSM2AFdrDNXjcZwLR0OdNMiXW1S";

async function sendDiscordNotification(orderData) {
    try {
        // Build product list for embed
        const productList = orderData.products.map(p => `• **${p.name}** x${p.quantity} — $${(p.price * p.quantity).toFixed(2)}`).join('\n');
        
        // Create embed
        const embed = {
            title: " NEW ORDER RECEIVED!",
            description: `**@everyone** - A new order has been placed!`,
            color: 0x9b59b6, // Purple color
            thumbnail: {
                url: "https://cdn-icons-png.flaticon.com/512/3144/3144456.png"
            },
            fields: [
                {
                    name: "📦 ORDER ID",
                    value: `\`${orderData.orderNumber}\``,
                    inline: false
                },
                 {
                    name: "👤 CUSTOMER DETAILS",
                    value: `**Name:** ${orderData.name}\n**Mobile:** ${orderData.mobile}\n**Email:** ${orderData.email}`,
                    inline: false
                },

                {
                    name: "📅 ORDER TIME",
                    value: new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }),
                    inline: true
                }
            ],
            footer: {
                text: "Nazamy Shop • Order Management System",
                icon_url: "https://cdn-icons-png.flaticon.com/512/3144/3144456.png"
            },
            timestamp: new Date().toISOString()
        };
        
        // Send to Discord
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: "@everyone 🚨 **NEW ORDER ALERT!** 🚨",
                embeds: [embed],
                username: "Nazamy Shop Bot",
                avatar_url: "https://cdn-icons-png.flaticon.com/512/3144/3144456.png"
            })
        });
        
        if (!response.ok) {
            console.error("Discord webhook error:", await response.text());
        } else {
            console.log("Discord notification sent successfully!");
        }
    } catch (error) {
        console.error("Failed to send Discord notification:", error);
    }
}

// ========== WAIT FOR SUPABASE ==========
function waitForSupabase() {
    return new Promise((resolve) => {
        if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
            resolve(window.supabaseClient);
            return;
        }
        if (window.supabase && typeof window.supabase.from === 'function') {
            resolve(window.supabase);
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 50;
        const interval = setInterval(() => {
            attempts++;
            if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
                clearInterval(interval);
                resolve(window.supabaseClient);
            } else if (window.supabase && typeof window.supabase.from === 'function') {
                clearInterval(interval);
                resolve(window.supabase);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                resolve(null);
            }
        }, 100);
    });
}

// ========== GENERATE RANDOM ORDER NUMBER ==========
function generateOrderNumber() {
    const prefix = "NAZ";
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}-${timestamp}-${random}`;
}

// ========== CART FUNCTIONS ==========
function loadCart() {
    const savedCart = localStorage.getItem("shoppingCart");
    if (savedCart) {
        cartItems = JSON.parse(savedCart);
    }
    updateCartCount();
}

function saveCart() {
    localStorage.setItem("shoppingCart", JSON.stringify(cartItems));
    updateCartCount();
}

function updateCartCount() {
    const cartCountSpan = document.getElementById("cart-count");
    if (cartCountSpan) {
        const totalItems = cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
        cartCountSpan.textContent = totalItems;
    }
}

function addToCart(product) {
    const existingItem = cartItems.find(item => item.id === product.id);
    if (existingItem) {
        existingItem.quantity = (existingItem.quantity || 1) + 1;
        showToast(`✅ Added another ${product.name} (Total: ${existingItem.quantity})`, false);
    } else {
        cartItems.push({
            id: product.id,
            name: product.name,
            price: product.price,
            stock: product.stock,
            icon: product.icon || 'fa-box',
            quantity: 1
        });
        showToast(`✅ ${product.name} added to cart!`, false);
    }
    saveCart();
    updateCartCount();
    if (document.getElementById("cart-items-container")) {
        renderCart();
        updateTotals();
    }
}

function updateQuantity(productId, delta) {
    const itemIndex = cartItems.findIndex(item => item.id === productId);
    if (itemIndex !== -1) {
        const newQuantity = (cartItems[itemIndex].quantity || 1) + delta;
        if (newQuantity <= 0) {
            cartItems.splice(itemIndex, 1);
            showToast("🗑️ Product removed from cart", false);
        } else {
            cartItems[itemIndex].quantity = newQuantity;
        }
        saveCart();
        renderCart();
        updateTotals();
    }
}

function removeFromCart(productId) {
    cartItems = cartItems.filter(item => item.id !== productId);
    saveCart();
    renderCart();
    updateTotals();
    showToast("🗑️ Product removed from cart", false);
}

function renderCart() {
    const container = document.getElementById("cart-items-container");
    if (!container) return;
    
    if (cartItems.length === 0) {
        container.innerHTML = '<div class="empty-cart"><i class="fas fa-shopping-cart"></i> Your cart is empty. <a href="shop.html" style="color:#c084fc;">Add products</a></div>';
        return;
    }
    
    let html = '<div class="cart-items-list">';
    cartItems.forEach(item => {
        const qty = item.quantity || 1;
        const itemTotal = item.price * qty;
        html += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name"><i class="fas ${item.icon}"></i> ${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">${item.price} each</div>
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="updateQuantity('${item.id}', -1)">-</button>
                        <span class="quantity-value">${qty}</span>
                        <button class="quantity-btn" onclick="updateQuantity('${item.id}', 1)">+</button>
                        <span class="item-total">= $${itemTotal.toFixed(2)}</span>
                    </div>
                </div>
                <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    });
    html += '</div>';
    html += '<button class="add-more-btn" onclick="window.location.href=\'shop.html\'"><i class="fas fa-plus"></i> Add More Products</button>';
    container.innerHTML = html;
}

function updateTotals() {
    const subtotal = cartItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
    const discount = appliedCoupon ? appliedCoupon.discount_amount : 0;
    finalPrice = subtotal - discount;
    if (finalPrice < 0) finalPrice = 0;
    
    const subtotalEl = document.getElementById("cart-subtotal");
    const finalPriceEl = document.getElementById("final-price");
    
    if (subtotalEl) subtotalEl.textContent = `${subtotal.toFixed(2)}`;
    if (finalPriceEl) finalPriceEl.textContent = `${finalPrice.toFixed(2)}`;
    
    return subtotal;
}

// ========== LOAD PRODUCTS ==========
async function loadProducts() {
    const container = document.getElementById("products-container");
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-pulse"></i> Loading products...</div>';
    
    const supabase = await waitForSupabase();
    if (!supabase) {
        container.innerHTML = '<p style="color: #ff4d6d;">❌ Database connection error.</p>';
        return;
    }
    
    try {
        const { data: products, error } = await supabase
            .from('products')
            .select('*')
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        if (!products || products.length === 0) {
            container.innerHTML = '<p style="color: #c084fc;">No products available</p>';
            return;
        }
        
        container.innerHTML = "";
        products.forEach(product => {
            const isOutOfStock = product.stock <= 0 || product.status === 'out of stock';
            const stockClass = product.stock <= 0 ? 'stock-out' : (product.stock <= 5 ? 'stock-low' : 'stock-normal');
            const stockText = product.stock <= 0 ? 'Out of Stock' : `${product.stock} left`;
            
            const card = document.createElement("div");
            card.className = `product-card ${isOutOfStock ? 'out-of-stock' : ''}`;
            card.innerHTML = `
                ${isOutOfStock ? '<div class="out-of-stock-badge"><i class="fas fa-ban"></i> OUT</div>' : ''}
                <div class="product-icon"><i class="fas ${product.icon || 'fa-box'}"></i></div>
                <h3>${escapeHtml(product.name)}</h3>
                <div class="price">${product.price} <small>Egp</small></div>
                <div class="stock-info ${stockClass}">
                    <i class="fas ${product.stock <= 0 ? 'fa-times-circle' : 'fa-boxes'}"></i> ${stockText}
                </div>
                ${!isOutOfStock ? '<button class="add-to-cart-btn"><i class="fas fa-cart-plus"></i> Add to Cart</button>' : ''}
            `;
            
            if (!isOutOfStock) {
                const addBtn = card.querySelector('.add-to-cart-btn');
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    addToCart(product);
                });
            }
            
            container.appendChild(card);
        });
    } catch (err) {
        console.error(err);
        container.innerHTML = `<p style="color: #ff4d6d;">Error: ${err.message}</p>`;
    }
}

// ========== APPLY COUPON ==========
async function applyCoupon() {
    const couponCode = document.getElementById("coupon-code").value.trim().toUpperCase();
    if (!couponCode) {
        showFeedback("Please enter a coupon code", "error");
        return;
    }
    
    const supabase = await waitForSupabase();
    if (!supabase) {
        showFeedback("Database connection error", "error");
        return;
    }
    
    try {
        const { data: coupon, error } = await supabase
            .from('coupons')
            .select('*')
            .eq('code', couponCode)
            .eq('is_active', true)
            .single();
        
        if (error || !coupon) {
            showFeedback("❌ Invalid or expired coupon", "error");
            return;
        }
        
        const subtotal = cartItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
        
        if (subtotal < coupon.min_purchase) {
            showFeedback(`❌ Minimum purchase ${coupon.min_purchase} required`, "error");
            return;
        }
        
        let discountAmount = 0;
        if (coupon.discount_type === 'percentage') {
            discountAmount = (subtotal * coupon.discount_value) / 100;
            if (coupon.max_discount && discountAmount > coupon.max_discount) {
                discountAmount = coupon.max_discount;
            }
        } else {
            discountAmount = coupon.discount_value;
        }
        
        appliedCoupon = {
            code: coupon.code,
            discount_amount: discountAmount
        };
        
        updateTotals();
        
        document.getElementById("discount-info").innerHTML = `<i class="fas fa-tag"></i> Coupon applied! Saved ${discountAmount.toFixed(2)}`;
        document.getElementById("discount-info").style.display = "block";
        document.getElementById("apply-coupon-btn").disabled = true;
        
        showToast(`✅ Saved ${discountAmount.toFixed(2)}!`, false);
    } catch (err) {
        showFeedback("Error applying coupon", "error");
    }
}

// ========== SUBMIT ORDER (معدل - من غير products_list) ==========
async function submitOrder(event) {
    event.preventDefault();
    
    if (cartItems.length === 0) {
        showFeedback("❌ Your cart is empty! Add some products first.", "error");
        return;
    }
    
    const name = document.getElementById("name").value.trim();
    const mobile = document.getElementById("mobile").value.trim();
    const email = document.getElementById("email").value.trim();
    const paymentMethod = document.getElementById("payment-method").value;
    const screenshotFile = document.getElementById("screenshot").files[0];
    
    if (!name || !mobile || !email || !paymentMethod || !screenshotFile) {
        showFeedback("❌ All fields are required!", "error");
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showFeedback("❌ Please enter a valid email", "error");
        return;
    }
    
    const supabase = await waitForSupabase();
    if (!supabase) {
        showFeedback("Database connection error", "error");
        return;
    }
    
    const submitBtn = document.querySelector(".submit-btn");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> PROCESSING...';
    
    try {
        const subtotal = cartItems.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
        const discountAmount = appliedCoupon?.discount_amount || 0;
        const finalTotal = subtotal - discountAmount;
        const orderNumber = generateOrderNumber();
        const totalQuantity = cartItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
        
        // تجهيز اسم المنتج بشكل مرتب
        const productNames = cartItems.map(p => `${p.name} x${p.quantity || 1}`).join(', ');
        
        // رفع الصورة - مع محاولة أفضل
        let screenshotUrl = "Upload failed";
        try {
            const base64Image = await fileToBase64(screenshotFile);
            screenshotUrl = await uploadScreenshot(base64Image, name, orderNumber);
            console.log("Screenshot upload result:", screenshotUrl);
        } catch (uploadErr) {
            console.error("Upload error:", uploadErr);
            // نكمل حتى لو فشل رفع الصورة
        }
        
        // إدخال الطلب من غير products_list
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert([{
                name: name,
                mobile: mobile,
                email: email,
                product_id: cartItems[0].id,
                product_name: productNames,
                original_price: subtotal,
                final_price: finalTotal,
                coupon_code: appliedCoupon?.code || null,
                discount_amount: discountAmount,
                payment_method: paymentMethod,
                screenshot: screenshotUrl,
                order_status: 'pending',
                order_number: orderNumber,
                quantity: totalQuantity
            }])
            .select();
        
        if (orderError) throw orderError;
        
        // تحديث المخزون لكل منتج
        for (const item of cartItems) {
            const { data: stockData } = await supabase
                .from('products')
                .select('stock')
                .eq('id', item.id)
                .single();
            
            if (stockData && stockData.stock > 0) {
                const newStock = stockData.stock - (item.quantity || 1);
                await supabase
                    .from('products')
                    .update({ stock: newStock, status: newStock <= 0 ? 'out of stock' : 'active' })
                    .eq('id', item.id);
            }
        }
        
        // تحديث استخدام الكوبون
        if (appliedCoupon) {
            const { data: couponData } = await supabase
                .from('coupons')
                .select('used_count')
                .eq('code', appliedCoupon.code)
                .single();
            
            if (couponData) {
                await supabase
                    .from('coupons')
                    .update({ used_count: (couponData.used_count || 0) + 1 })
                    .eq('code', appliedCoupon.code);
            }
        }
        
        // تخزين بيانات الطلب للصفحة التالية
        const orderInfo = {
            orderNumber: orderNumber,
            name: name,
            mobile: mobile,
            email: email,
            paymentMethod: paymentMethod,
            subtotal: subtotal,
            discount: discountAmount,
            total: finalTotal,
            products: cartItems.map(item => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity || 1
            }))
        };
        localStorage.setItem("lastOrder", JSON.stringify(orderInfo));
        
        // Send Discord notification (doesn't block the order process)
        sendDiscordNotification(orderInfo).catch(err => console.error("Discord notify error:", err));
        
        localStorage.removeItem("shoppingCart");
        
        showFeedback("✅ Order submitted successfully!", "success");
        showToast(`🎉 Order #${orderNumber} placed!`, false);
        
        setTimeout(() => {
            window.location.href = "order-success.html";
        }, 1500);
        
    } catch (error) {
        console.error("Error:", error);
        showFeedback(`❌ Error: ${error.message}`, "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-database"></i> PLACE ORDER';
    }
}

// ========== LOAD ORDER SUCCESS PAGE ==========
function loadOrderSuccess() {
    const orderInfo = localStorage.getItem("lastOrder");
    if (!orderInfo) {
        window.location.href = "shop.html";
        return;
    }
    
    const order = JSON.parse(orderInfo);
    
    document.getElementById("order-number").textContent = order.orderNumber;
    document.getElementById("customer-name").textContent = order.name;
    document.getElementById("customer-mobile").textContent = order.mobile;
    document.getElementById("customer-email").textContent = order.email;
    document.getElementById("payment-method-display").textContent = order.paymentMethod;
    document.getElementById("order-subtotal").textContent = `${order.subtotal.toFixed(2)}`;
    document.getElementById("order-discount").textContent = `-${order.discount.toFixed(2)}`;
    document.getElementById("order-total").textContent = `${order.total.toFixed(2)}`;
    
    const productsContainer = document.getElementById("order-products-list");
    if (productsContainer) {
        let productsHtml = '';
        order.products.forEach(product => {
            productsHtml += `
                <div class="product-item">
                    <span class="product-name">${escapeHtml(product.name)} x${product.quantity}</span>
                    <span class="product-price">${(product.price * product.quantity).toFixed(2)}</span>
                </div>
            `;
        });
        productsContainer.innerHTML = productsHtml;
    }
}

function copyOrderNumber() {
    const orderNumber = document.getElementById("order-number").textContent;
    navigator.clipboard.writeText(orderNumber);
    showToast("📋 Order number copied!", false);
}

// ========== HELPER FUNCTIONS ==========
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function uploadScreenshot(base64Image, customerName, orderNumber) {
    const supabase = await waitForSupabase();
    if (!supabase) return null;
    
    try {
        // التحقق من صحة الصورة
        if (!base64Image || !base64Image.startsWith('data:image')) {
            throw new Error("Invalid image format");
        }
        
        const matches = base64Image.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) throw new Error("Could not parse image");
        
        const fileExt = matches[1] === 'jpg' ? 'jpg' : matches[1];
        const fileName = `${customerName.replace(/\s/g, '_')}_${orderNumber}_${Date.now()}.${fileExt}`;
        
        const byteCharacters = atob(matches[2]);
        const byteArrays = [];
        for (let i = 0; i < byteCharacters.length; i++) {
            byteArrays.push(byteCharacters.charCodeAt(i));
        }
        const blob = new Blob([new Uint8Array(byteArrays)], { type: `image/${fileExt}` });
        
        // رفع الصورة
        const { error: uploadError } = await supabase.storage
            .from('order-screenshots')
            .upload(fileName, blob, {
                contentType: `image/${fileExt}`,
                upsert: false
            });
        
        if (uploadError) {
            console.error("Storage upload error:", uploadError);
            return null;
        }
        
        const { data: urlData } = supabase.storage
            .from('order-screenshots')
            .getPublicUrl(fileName);
        
        return urlData.publicUrl;
    } catch (error) {
        console.error("Upload error details:", error);
        return null;
    }
}

function showFeedback(message, type) {
    const feedbackDiv = document.getElementById("form-feedback");
    if (feedbackDiv) {
        feedbackDiv.innerHTML = `<span style="color:${type === 'success' ? '#b9f5b9' : '#ff8a9f'}">${message}</span>`;
    }
}

function showToast(message, isError = false) {
    const toast = document.getElementById("toast-msg");
    if (toast) {
        toast.textContent = message;
        toast.style.background = isError ? "#3b1e2a" : "#1e1a2f";
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function updatePaymentDetails() {
    const method = document.getElementById("payment-method").value;
    const detailsDiv = document.getElementById("payment-details");
    
    if (method && paymentDetails[method]) {
        detailsDiv.innerHTML = `<p><i class="fas fa-info-circle"></i> ${paymentDetails[method]}</p>`;
        detailsDiv.style.display = "block";
    } else {
        detailsDiv.style.display = "none";
    }
}

// ========== INITIALIZATION ==========
if (document.getElementById("products-container")) {
    loadCart();
    loadProducts();
}

if (document.getElementById("checkout-form")) {
    loadCart();
    renderCart();
    updateTotals();
    
    document.getElementById("checkout-form").addEventListener("submit", submitOrder);
    document.getElementById("apply-coupon-btn")?.addEventListener("click", applyCoupon);
    document.getElementById("payment-method")?.addEventListener("change", updatePaymentDetails);
}

if (document.getElementById("order-number")) {
    loadOrderSuccess();
}

// جعل الدوال متاحة عالمياً
window.removeFromCart = removeFromCart;
window.addToCart = addToCart;
window.updateQuantity = updateQuantity;
window.copyOrderNumber = copyOrderNumber;
