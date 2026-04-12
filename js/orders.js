// admin.js - Admin Panel with Weekly Analysis

let allProducts = [], allCoupons = [], allOrders = [], filteredOrders = [];
let dailyOrdersChart, revenueTrendChart;


function waitForSupabase() {
    return new Promise((resolve) => {
        if (window.supabaseClient && typeof window.supabaseClient.from === 'function') resolve(window.supabaseClient);
        else if (window.supabase && typeof window.supabase.from === 'function') resolve(window.supabase);
        else {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (window.supabaseClient?.from) { clearInterval(interval); resolve(window.supabaseClient); }
                else if (window.supabase?.from) { clearInterval(interval); resolve(window.supabase); }
                else if (attempts >= 50) { clearInterval(interval); resolve(null); }
            }, 100);
        }
    });
}

async function loadStats() {
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const { data: orders } = await supabase.from('orders').select('*');
    if (!orders) return;
    document.getElementById('total-orders').textContent = orders.length;
    document.getElementById('total-revenue').textContent = `$${orders.reduce((s, o) => s + (o.final_price || 0), 0).toFixed(2)}`;
    document.getElementById('total-customers').textContent = new Set(orders.map(o => o.email)).size;
    document.getElementById('total-products-sold').textContent = orders.reduce((s, o) => s + (o.quantity || 1), 0);
}

async function loadProducts() {
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const { data } = await supabase.from('products').select('*').order('created_at');
    allProducts = data || [];
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;
    if (allProducts.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="loading">No products found</td></tr>'; return; }
    tbody.innerHTML = allProducts.map(p => `
        <tr><td><i class="fas ${p.icon || 'fa-box'}"></i></td>
        <td>${escapeHtml(p.name)}</td><td>$${p.price}</td>
        <td><input type="number" class="stock-input" id="stock-${p.id}" value="${p.stock}" min="0" style="width:80px"></td>
        <td><select class="status-select" id="status-${p.id}"><option value="active" ${p.status === 'active' ? 'selected' : ''}>Active</option><option value="out of stock" ${p.status === 'out of stock' ? 'selected' : ''}>Out of Stock</option></select></td>
        <td><button class="update-btn" onclick="updateProduct('${p.id}')"><i class="fas fa-save"></i></button><button class="edit-btn" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button><button class="delete-btn" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button></td></tr>
    `).join('');
}

async function updateProduct(id) {
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const newStock = parseInt(document.getElementById(`stock-${id}`).value);
    const newStatus = document.getElementById(`status-${id}`).value;
    const { error } = await supabase.from('products').update({ stock: newStock, status: newStatus }).eq('id', id);
    if (error) showToast("Error updating", true);
    else { showToast("Updated!"); loadProducts(); loadStats(); }
}

async function editProduct(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    document.getElementById('product-id').value = p.id;
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-stock').value = p.stock;
    document.getElementById('product-icon').value = p.icon || 'fa-box';
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    document.getElementById('product-modal').style.display = 'block';
}

async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) showToast("Error", true);
    else { showToast("Deleted!"); loadProducts(); loadStats(); }
}

async function saveProduct(e) {
    e.preventDefault();
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const id = document.getElementById('product-id').value;
    const name = document.getElementById('product-name').value;
    const price = parseFloat(document.getElementById('product-price').value);
    const stock = parseInt(document.getElementById('product-stock').value);
    const icon = document.getElementById('product-icon').value;
    if (id) await supabase.from('products').update({ name, price, stock, icon }).eq('id', id);
    else await supabase.from('products').insert([{ name, price, stock, icon, status: 'active' }]);
    showToast(id ? "Updated!" : "Added!");
    closeModal('product-modal');
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    loadProducts(); loadStats();
}

async function loadCoupons() {
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const { data } = await supabase.from('coupons').select('*').order('created_at');
    allCoupons = data || [];
    const tbody = document.getElementById('coupons-table-body');
    if (!tbody) return;
    if (allCoupons.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="loading">No coupons found</td></tr>'; return; }
    tbody.innerHTML = allCoupons.map(c => `
        <tr><td><strong>${escapeHtml(c.code)}</strong></td>
        <td>${c.discount_type === 'percentage' ? c.discount_value + '%' : '$' + c.discount_value}</td>
        <td>$${c.min_purchase || 0}</td><td>${c.usage_limit || '∞'}</td><td>${c.used_count || 0}</td>
        <td>${c.valid_until ? new Date(c.valid_until).toLocaleDateString() : 'Never'}</td>
        <td><select class="status-select" id="coupon-status-${c.id}"><option value="true" ${c.is_active ? 'selected' : ''}>Active</option><option value="false" ${!c.is_active ? 'selected' : ''}>Inactive</option></select></td>
        <td><button class="update-btn" onclick="updateCouponStatus('${c.id}')"><i class="fas fa-save"></i></button><button class="edit-btn" onclick="editCoupon('${c.id}')"><i class="fas fa-edit"></i></button><button class="delete-btn" onclick="deleteCoupon('${c.id}')"><i class="fas fa-trash"></i></button></td></tr>
    `).join('');
}

async function updateCouponStatus(id) {
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const isActive = document.getElementById(`coupon-status-${id}`).value === 'true';
    await supabase.from('coupons').update({ is_active: isActive }).eq('id', id);
    showToast("Updated!"); loadCoupons();
}

async function editCoupon(id) {
    const c = allCoupons.find(x => x.id === id);
    if (!c) return;
    document.getElementById('coupon-id').value = c.id;
    document.getElementById('coupon-code').value = c.code;
    document.getElementById('coupon-type').value = c.discount_type;
    document.getElementById('coupon-value').value = c.discount_value;
    document.getElementById('coupon-min').value = c.min_purchase || 0;
    document.getElementById('coupon-limit').value = c.usage_limit || '';
    document.getElementById('coupon-valid').value = c.valid_until || '';
    document.getElementById('coupon-modal-title').textContent = 'Edit Coupon';
    document.getElementById('coupon-modal').style.display = 'block';
}

async function deleteCoupon(id) {
    if (!confirm('Delete this coupon?')) return;
    const supabase = await waitForSupabase();
    if (!supabase) return;
    await supabase.from('coupons').delete().eq('id', id);
    showToast("Deleted!"); loadCoupons();
}

async function saveCoupon(e) {
    e.preventDefault();
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const id = document.getElementById('coupon-id').value;
    const code = document.getElementById('coupon-code').value.toUpperCase();
    const discount_type = document.getElementById('coupon-type').value;
    const discount_value = parseFloat(document.getElementById('coupon-value').value);
    const min_purchase = parseFloat(document.getElementById('coupon-min').value) || 0;
    const usage_limit = parseInt(document.getElementById('coupon-limit').value) || null;
    const valid_until = document.getElementById('coupon-valid').value || null;
    if (id) await supabase.from('coupons').update({ code, discount_type, discount_value, min_purchase, usage_limit, valid_until }).eq('id', id);
    else await supabase.from('coupons').insert([{ code, discount_type, discount_value, min_purchase, usage_limit, valid_until, is_active: true, used_count: 0 }]);
    showToast(id ? "Updated!" : "Added!");
    closeModal('coupon-modal');
    document.getElementById('coupon-form').reset();
    document.getElementById('coupon-id').value = '';
    loadCoupons();
}

async function loadOrders() {
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    allOrders = data || [];
    filteredOrders = [...allOrders];
    renderOrdersTable();
}

function renderOrdersTable() {
    const tbody = document.getElementById('orders-table-body');
    if (!tbody) return;
    if (filteredOrders.length === 0) { tbody.innerHTML = '<tr><td colspan="10" class="loading">No orders found</td></tr>'; return; }
    tbody.innerHTML = filteredOrders.map(o => `
        <tr><td><strong>${escapeHtml(o.order_number || 'N/A')}</strong></td>
        <td>${escapeHtml(o.name)}</td><td>${escapeHtml(o.mobile)}</td><td>${escapeHtml(o.email)}</td>
        <td title="${escapeHtml(o.product_name)}">${o.product_name?.substring(0, 30)}${o.product_name?.length > 30 ? '...' : ''}</td>
        <td>$${o.final_price}</td><td>${escapeHtml(o.payment_method)}</td>
        <td><select class="status-select" id="order-status-${o.id}" onchange="updateOrderStatus('${o.id}')">
            <option value="pending" ${o.order_status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="processing" ${o.order_status === 'processing' ? 'selected' : ''}>Processing</option>
            <option value="completed" ${o.order_status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${o.order_status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        </select></td>
        <td>${new Date(o.created_at).toLocaleDateString()}</td>
        <td><button class="view-btn" onclick="viewOrderDetails('${o.id}')"><i class="fas fa-eye"></i></button>
        <button class="claim-btn" onclick="claimOrder('${o.id}')"><i class="fas fa-gavel"></i> Claim</button></td></tr>
    `).join('');
}

async function updateOrderStatus(id) {
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const newStatus = document.getElementById(`order-status-${id}`).value;
    await supabase.from('orders').update({ order_status: newStatus }).eq('id', id);
    showToast(`Status: ${newStatus}`); loadOrders(); loadStats();
}

async function claimOrder(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    const reason = prompt(`Enter claim reason for order ${order.order_number}:`);
    if (reason) {
        const supabase = await waitForSupabase();
        if (!supabase) return;
        await supabase.from('orders').update({ order_status: 'claimed', claim_note: reason, claimed_at: new Date().toISOString() }).eq('id', id);
        showToast(`Order ${order.order_number} claimed!`); loadOrders();
    }
}

async function viewOrderDetails(id) {
    const order = allOrders.find(o => o.id === id);
    if (!order) return;
    document.getElementById('order-details-content').innerHTML = `
        <div class="order-details"><div class="detail-section"><h4>Order Information</h4>
        <p><strong>Order Number:</strong> ${escapeHtml(order.order_number || 'N/A')}</p>
        <p><strong>Order ID:</strong> ${order.id}</p><p><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
        <p><strong>Status:</strong> <span class="status-badge status-${order.order_status}">${order.order_status}</span></p>
        ${order.claim_note ? `<p><strong>Claim Note:</strong> ${escapeHtml(order.claim_note)}</p>` : ''}
        ${order.claimed_at ? `<p><strong>Claimed At:</strong> ${new Date(order.claimed_at).toLocaleString()}</p>` : ''}</div>
        <div class="detail-section"><h4>Customer Information</h4>
        <p><strong>Name:</strong> ${escapeHtml(order.name)}</p><p><strong>Mobile:</strong> ${escapeHtml(order.mobile)}</p>
        <p><strong>Email:</strong> ${escapeHtml(order.email)}</p></div>
        <div class="detail-section"><h4>Products</h4><p><strong>Products:</strong> ${escapeHtml(order.product_name)}</p>
        <p><strong>Quantity:</strong> ${order.quantity || 1}</p></div>
        <div class="detail-section"><h4>Payment Information</h4>
        <p><strong>Payment Method:</strong> ${escapeHtml(order.payment_method)}</p>
        <p><strong>Original Price:</strong> $${order.original_price}</p>
        <p><strong>Discount:</strong> $${order.discount_amount || 0}</p>
        <p><strong>Final Price:</strong> <strong>$${order.final_price}</strong></p>
        ${order.coupon_code ? `<p><strong>Coupon Used:</strong> ${escapeHtml(order.coupon_code)}</p>` : ''}</div>
        ${order.screenshot && order.screenshot !== 'No screenshot uploaded' ? `<div class="detail-section"><h4>Payment Screenshot</h4><img src="${order.screenshot}" style="max-width:300px;border-radius:10px" onclick="window.open(this.src)"></div>` : ''}
    `;
    document.getElementById('order-modal').style.display = 'block';
}

function filterOrders() {
    const term = document.getElementById('order-search').value.toLowerCase();
    filteredOrders = allOrders.filter(o => o.name?.toLowerCase().includes(term) || o.email?.toLowerCase().includes(term) || o.order_number?.toLowerCase().includes(term) || o.mobile?.includes(term));
    renderOrdersTable();
}

// ========== WEEKLY ANALYSIS ==========
async function loadWeeklyAnalysis() {
    const supabase = await waitForSupabase();
    if (!supabase) return;
    const { data: orders } = await supabase.from('orders').select('*');
    if (!orders) return;

    const weekOffset = parseInt(document.getElementById('week-select').value);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() - (weekOffset * 7));
    startOfWeek.setHours(0,0,0,0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23,59,59,999);

    const prevWeekStart = new Date(startOfWeek);
    prevWeekStart.setDate(startOfWeek.getDate() - 7);
    const prevWeekEnd = new Date(prevWeekStart);
    prevWeekEnd.setDate(prevWeekStart.getDate() + 6);

    const weeklyOrders = orders.filter(o => new Date(o.created_at) >= startOfWeek && new Date(o.created_at) <= endOfWeek);
    const prevWeekOrders = orders.filter(o => new Date(o.created_at) >= prevWeekStart && new Date(o.created_at) <= prevWeekEnd);
    
    const weeklyRevenue = weeklyOrders.reduce((s,o) => s + (o.final_price || 0), 0);
    const prevRevenue = prevWeekOrders.reduce((s,o) => s + (o.final_price || 0), 0);
    const weeklyCustomers = new Set(weeklyOrders.map(o => o.email)).size;
    const prevCustomers = new Set(prevWeekOrders.map(o => o.email)).size;
    const avgOrder = weeklyOrders.length ? weeklyRevenue / weeklyOrders.length : 0;

    document.getElementById('weekly-orders').textContent = weeklyOrders.length;
    document.getElementById('weekly-revenue').innerHTML = `$${weeklyRevenue.toFixed(2)}`;
    document.getElementById('weekly-customers').textContent = weeklyCustomers;
    document.getElementById('weekly-avg-order').innerHTML = `$${avgOrder.toFixed(2)}`;

    const orderChange = weeklyOrders.length - prevWeekOrders.length;
    const revenueChange = weeklyRevenue - prevRevenue;
    const customerChange = weeklyCustomers - prevCustomers;

    document.getElementById('weekly-orders-trend').innerHTML = orderChange >= 0 ? `<span class="trend-up"><i class="fas fa-arrow-up"></i> +${orderChange}</span>` : `<span class="trend-down"><i class="fas fa-arrow-down"></i> ${orderChange}</span>`;
    document.getElementById('weekly-revenue-trend').innerHTML = revenueChange >= 0 ? `<span class="trend-up"><i class="fas fa-arrow-up"></i> +$${revenueChange.toFixed(2)}</span>` : `<span class="trend-down"><i class="fas fa-arrow-down"></i> -$${Math.abs(revenueChange).toFixed(2)}</span>`;
    document.getElementById('weekly-customers-trend').innerHTML = customerChange >= 0 ? `<span class="trend-up"><i class="fas fa-arrow-up"></i> +${customerChange}</span>` : `<span class="trend-down"><i class="fas fa-arrow-down"></i> ${customerChange}</span>`;

    // Daily Chart
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0,0,0,0);
        last7Days.push(d);
    }
    const dailyOrders = last7Days.map(day => orders.filter(o => new Date(o.created_at).toDateString() === day.toDateString()).length);
    const dailyRevenue = last7Days.map(day => orders.filter(o => new Date(o.created_at).toDateString() === day.toDateString()).reduce((s,o) => s + (o.final_price || 0), 0));
    const dayLabels = last7Days.map(d => d.toLocaleDateString('en-US', { weekday: 'short', month:'short', day:'numeric' }));

    if (dailyOrdersChart) dailyOrdersChart.destroy();
    const ctx1 = document.getElementById('daily-orders-chart').getContext('2d');
    dailyOrdersChart = new Chart(ctx1, {
        type: 'bar', data: { labels: dayLabels, datasets: [{ label: 'Orders', data: dailyOrders, backgroundColor: '#c084fc', borderRadius: 10 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#e0e0ff' } } } }
    });

    if (revenueTrendChart) revenueTrendChart.destroy();
    const ctx2 = document.getElementById('revenue-trend-chart').getContext('2d');
    revenueTrendChart = new Chart(ctx2, {
        type: 'line', data: { labels: dayLabels, datasets: [{ label: 'Revenue ($)', data: dailyRevenue, borderColor: '#4caf50', backgroundColor: 'rgba(76,175,80,0.1)', fill: true, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#e0e0ff' } } } }
    });

    // Top Products
    const productSales = {};
    orders.forEach(o => {
        const products = o.product_name?.split(',') || [];
        products.forEach(p => {
            const match = p.match(/(.+?)\s*x(\d+)/);
            if (match) {
                const name = match[1].trim();
                const qty = parseInt(match[2]) || 1;
                productSales[name] = (productSales[name] || 0) + qty;
            } else if (p.trim()) {
                productSales[p.trim()] = (productSales[p.trim()] || 0) + 1;
            }
        });
    });
    const topProducts = Object.entries(productSales).sort((a,b) => b[1] - a[1]).slice(0,5);
    const topProductsHtml = topProducts.map(([name, qty], i) => `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(168,85,247,0.2);"><span><strong>${i+1}.</strong> ${escapeHtml(name)}</span><span style="color:#c084fc;">${qty} sold</span></div>`).join('');
    document.getElementById('top-products-list').innerHTML = topProductsHtml || '<div class="loading">No data yet</div>';
}

function showAddProductModal() { document.getElementById('product-form').reset(); document.getElementById('product-id').value = ''; document.getElementById('product-modal-title').textContent = 'Add Product'; document.getElementById('product-modal').style.display = 'block'; }
function showAddCouponModal() { document.getElementById('coupon-form').reset(); document.getElementById('coupon-id').value = ''; document.getElementById('coupon-modal-title').textContent = 'Add Coupon'; document.getElementById('coupon-modal').style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function showToast(msg, isErr = false) { const t = document.getElementById('toast-msg'); if(t){ t.textContent = msg; t.style.background = isErr ? '#3b1e2a' : '#1e1a2f'; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); } }
function escapeHtml(str) { if(!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[m]); }

document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`${tab}-tab`).classList.add('active');
    if (tab === 'products') loadProducts();
    if (tab === 'coupons') loadCoupons();
    if (tab === 'orders') loadOrders();
    if (tab === 'analysis') loadWeeklyAnalysis();
}));

document.getElementById('product-form')?.addEventListener('submit', saveProduct);
document.getElementById('coupon-form')?.addEventListener('submit', saveCoupon);
window.onclick = e => { if(e.target.classList.contains('modal')) e.target.style.display = 'none'; };

loadStats(); loadProducts(); loadCoupons(); loadOrders(); loadWeeklyAnalysis();