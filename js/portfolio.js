document.addEventListener('DOMContentLoaded', function() {
    // Form submit olayını dinle
    const form = document.getElementById('portfolioForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Varlık ekleme butonunu dinle
    const addAssetBtn = document.getElementById('addAssetBtn');
    if (addAssetBtn) {
        addAssetBtn.addEventListener('click', addNewAsset);
    }

    // İlk varlık arama dinleyicisini ekle
    const initialSearchInput = document.querySelector('.asset-search-input');
    if (initialSearchInput) {
        setupAssetSearchListeners(initialSearchInput);
    }

    // Portföyleri yükle
    loadPortfolios();
});

// Varlık arama dinleyicilerini kurma
function setupAssetSearchListeners(input) {
    if (!input) return;

    input.addEventListener('input', function() {
        searchAssets(this.value, this);
    });

    // Tıklama dışında arama sonuçlarını gizle
    document.addEventListener('click', function(e) {
        if (!input.contains(e.target)) {
            const suggestions = input.nextElementSibling;
            if (suggestions) {
                suggestions.style.display = 'none';
            }
        }
    });
}

// Yeni varlık satırı ekleme
function addNewAsset() {
    const assetList = document.getElementById('assetList');
    const newAssetItem = document.createElement('div');
    newAssetItem.className = 'asset-item';
    newAssetItem.innerHTML = `
        <div class="asset-search">
            <input type="text" 
                   class="asset-search-input" 
                   placeholder="Hisse senedi/emtia ara..." 
                   autocomplete="off">
            <div class="asset-suggestions"></div>
        </div>
        <div class="asset-quantity">
            <input type="number" class="quantity-input" placeholder="Miktar" min="0">
        </div>
        <div class="asset-details">
            <div class="asset-weight">Ağırlık: <span class="weight-value">0</span>%</div>
            <div class="asset-total">Toplam: $<span class="total-value">0</span></div>
        </div>
        <button type="button" class="btn btn-delete" onclick="removeAsset(this)">Sil</button>
    `;
    assetList.appendChild(newAssetItem);
    
    // Yeni eklenen input için arama dinleyicisini ekle
    setupAssetSearchListeners(newAssetItem.querySelector('.asset-search-input'));
    
    // Miktar değişikliği dinleyicisini ekle
    const quantityInput = newAssetItem.querySelector('.quantity-input');
    quantityInput.addEventListener('input', () => calculateAssetValues(newAssetItem));
}

// Varlık satırını silme
function removeAsset(button) {
    button.closest('.asset-item').remove();
    calculatePortfolioTotals();
}

// Varlık arama fonksiyonu
async function searchAssets(searchTerm, inputElement) {
    if (!searchTerm || searchTerm.length < 2) {
        const suggestions = inputElement.nextElementSibling;
        if (suggestions) {
            suggestions.style.display = 'none';
        }
        return;
    }

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) {
            throw new Error('Arama hatası');
        }
        
        const results = await response.json();
        displaySearchResults(results, inputElement);
    } catch (err) {
        console.error('Arama hatası:', err);
    }
}

// Arama sonuçlarını görüntüleme
function displaySearchResults(results, inputElement) {
    const suggestions = inputElement.nextElementSibling;
    if (!suggestions) return;

    suggestions.innerHTML = '';
    const div = document.createElement('div');

    // Hisse senetleri
    if (results.stocks && results.stocks.length > 0) {
        results.stocks.forEach(result => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.innerHTML = `
                <div class="suggestion-details">
                    <div class="suggestion-name">${result.symbol} - ${result.name || 'N/A'}</div>
                    <div class="suggestion-sector">${result.sector || 'N/A'}</div>
                </div>
                <div class="suggestion-price">$${result.price ? result.price.toFixed(2) : '0.00'}</div>
            `;

            item.addEventListener('click', () => {
                inputElement.value = result.symbol;
                inputElement.dataset.symbol = result.symbol;
                inputElement.dataset.type = 'STOCK';
                inputElement.dataset.price = result.price || 0;
                suggestions.style.display = 'none';
                calculateAssetValues(inputElement.closest('.asset-item'));
            });

            div.appendChild(item);
        });
    }

    // Emtialar
    if (results.commodities && results.commodities.length > 0) {
        results.commodities.forEach(result => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.innerHTML = `
                <div class="suggestion-details">
                    <div class="suggestion-name">${result.name}</div>
                    <div class="suggestion-sector">Emtia</div>
                </div>
                <div class="suggestion-price">$${result.price ? result.price.toFixed(2) : '0.00'}</div>
            `;

            item.addEventListener('click', () => {
                inputElement.value = result.name;
                inputElement.dataset.symbol = result.name;
                inputElement.dataset.type = 'COMMODITY';
                inputElement.dataset.price = result.price || 0;
                suggestions.style.display = 'none';
                calculateAssetValues(inputElement.closest('.asset-item'));
            });

            div.appendChild(item);
        });
    }

    // Sonuç yoksa
    if ((!results.stocks || results.stocks.length === 0) && 
        (!results.commodities || results.commodities.length === 0)) {
        div.innerHTML = '<div class="suggestion-item">Sonuç bulunamadı</div>';
    }

    suggestions.appendChild(div);
    suggestions.style.display = 'block';
}

// Portföy değerlerini hesapla
function calculatePortfolioTotals() {
    const portfolioSize = parseFloat(document.getElementById('portfolio-size').value) || 0;
    let totalInvested = 0;
    let totalWeight = 0;
    
    document.querySelectorAll('.asset-item').forEach(item => {
        const total = parseFloat(item.querySelector('.total-value').textContent) || 0;
        const weight = parseFloat(item.querySelector('.weight-value').textContent) || 0;
        
        totalInvested += total;
        totalWeight += weight;
    });
    
    // Toplam değerleri güncelle
    if (document.getElementById('total-invested')) {
        document.getElementById('total-invested').textContent = totalInvested.toFixed(2);
    }
    if (document.getElementById('total-weight')) {
        document.getElementById('total-weight').textContent = totalWeight.toFixed(2);
    }
    if (document.getElementById('remaining-amount')) {
        document.getElementById('remaining-amount').textContent = (portfolioSize - totalInvested).toFixed(2);
    }

    // Ağırlık kontrolü
    if (totalWeight > 100) {
        alert('Uyarı: Toplam ağırlık %100\'ü geçiyor!');
    }
}

// Portföyleri görüntüleme fonksiyonu
function displayPortfolios(portfolios) {
    const grid = document.getElementById('portfoliosGrid');
    if (!grid) return;

    grid.innerHTML = '';

    portfolios.forEach(portfolio => {
        const card = document.createElement('div');
        card.className = 'portfolio-card';

        // Kart içeriğini oluştur
        card.innerHTML = `
            <div class="portfolio-header">
                <div class="portfolio-name">${escapeHtml(portfolio.portfolio_name)}</div>
                <div class="portfolio-actions">
                    <button class="action-btn edit-btn" onclick="editPortfolio(${portfolio.portfolio_id})">
                        Düzenle
                    </button>
                    <button class="action-btn delete-btn" onclick="deletePortfolio(${portfolio.portfolio_id})">
                        Sil
                    </button>
                </div>
            </div>
            <div class="portfolio-details">
                <div class="portfolio-detail-item">
                    <span>Başlangıç Değeri:</span>
                    <span>$${Number(portfolio.initial_value).toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}</span>
                </div>
                <div class="portfolio-detail-item">
                    <span>Güncel Değer:</span>
                    <span>$${Number(portfolio.current_value).toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}</span>
                </div>
                <div class="portfolio-detail-item">
                    <span>Getiri:</span>
                    <span class="${portfolio.return >= 0 ? 'positive' : 'negative'}">
                        %${(portfolio.return * 100).toFixed(2)}
                    </span>
                </div>
                <div class="portfolio-detail-item">
                    <span>Varlık Sayısı:</span>
                    <span>${portfolio.asset_count}</span>
                </div>
                <div class="portfolio-detail-item">
                    <span>Oluşturma Tarihi:</span>
                    <span>${new Date(portfolio.creation_date).toLocaleDateString('tr-TR')}</span>
                </div>
                ${portfolio.description ? `
                    <div class="portfolio-description">
                        <span>Açıklama:</span>
                        <p>${escapeHtml(portfolio.description)}</p>
                    </div>
                ` : ''}
            </div>
        `;
        grid.appendChild(card);
    });
}

// XSS koruması için yardımcı fonksiyon
function escapeHtml(unsafe) {
    return unsafe
        ? unsafe.replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        })[char])
        : '';
}

// Portföyleri yükle ve göster
async function loadPortfolios() {
    try {
        const response = await fetch('/api/portfolios');
        const portfolios = await response.json();
        
        const portfolioList = document.getElementById('portfolioList');
        if (!portfolioList) {
            console.error('portfolioList elementi bulunamadı');
            return;
        }
        
        if (!portfolios || portfolios.length === 0) {
            portfolioList.innerHTML = '<p class="no-portfolios">Henüz portföy bulunmuyor.</p>';
            return;
        }

        // Her portföy için detay bilgilerini al
        const portfolioDetails = await Promise.all(
            portfolios.map(async (portfolio) => {
                const detailResponse = await fetch(`/api/portfolios/${portfolio.portfolio_id}`);
                const detail = await detailResponse.json();
                return {
                    ...portfolio,
                    assets: detail.portfolio.assets || []
                };
            })
        );

        const portfolioCards = portfolioDetails.map(portfolio => {
            const assetsList = portfolio.assets.map(asset => `
                <div class="asset-item-summary">
                    <span>${escapeHtml(asset.asset_symbol)}</span>
                    <span>%${parseFloat(asset.weight).toFixed(0)}</span>
                </div>
            `).join('');

            return `
                <div class="portfolio-card">
                    <div class="portfolio-header">
                        <h3>${escapeHtml(portfolio.portfolio_name)}</h3>
                        <p class="portfolio-date">Oluşturma: ${new Date(portfolio.creation_date).toLocaleDateString()}</p>
                    </div>
                    <div class="portfolio-details">
                        <p>Başlangıç Değeri: $${(portfolio.initial_value || 0).toFixed(2)}</p>
                        <div class="portfolio-assets">
                            <h4>Varlıklar:</h4>
                            ${assetsList || '<p>Varlık bulunmuyor</p>'}
                        </div>
                    </div>
                    <div class="portfolio-actions">
                        <button onclick="editPortfolio(${portfolio.portfolio_id})" class="btn btn-edit">Düzenle</button>
                        <button onclick="deletePortfolio(${portfolio.portfolio_id})" class="btn btn-delete">Sil</button>
                    </div>
                </div>
            `;
        }).join('');

        portfolioList.innerHTML = portfolioCards;
        
    } catch (err) {
        console.error('Portföy listesi yüklenirken hata:', err);
        showError('Portföyler yüklenemedi');
    }
}

// Sayfa yüklendiğinde portföyleri getir
document.addEventListener('DOMContentLoaded', loadPortfolios);

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

// Emtia birimlerini tanımla
const COMMODITY_UNITS = {
    'GOLD': 'ons',
    'SILVER': 'ons',
    'PLATINUM': 'ons',
    'PALLADIUM': 'ons',
    'CRUDE OIL': 'varil',
    'NATURAL GAS': 'MMBtu',
    'COPPER': 'pound',
    'ALUMINUM': 'ton',
    // Diğer emtialar için birimleri ekleyebilirsiniz
};

// Varlık değerlerini hesapla
function calculateAssetValues(assetItem) {
    const searchInput = assetItem.querySelector('.asset-search-input');
    const quantityInput = assetItem.querySelector('.quantity-input');
    const weightSpan = assetItem.querySelector('.weight-value');
    const totalSpan = assetItem.querySelector('.total-value');
    
    if (!searchInput?.dataset?.price || !quantityInput?.value) {
        weightSpan.textContent = '0';
        totalSpan.textContent = '0';
        return;
    }

    const price = parseFloat(searchInput.dataset.price) || 0;
    const isStock = searchInput.dataset.type === 'STOCK';
    const inputValue = parseFloat(quantityInput.value) || 0;
    
    // Toplam değeri hesapla
    const totalValue = isStock ? price * inputValue : inputValue;
    
    const portfolioSize = parseFloat(document.getElementById('portfolio-size').value) || 0;
    
    // Ağırlığı hesapla (%)
    const weight = portfolioSize > 0 ? (totalValue / portfolioSize) * 100 : 0;
    
    // Değerleri güncelle
    weightSpan.textContent = weight.toFixed(2);
    totalSpan.textContent = totalValue.toFixed(2);
    
    // Birim/adet bilgisini göster
    const quantityInfo = assetItem.querySelector('.quantity-info') || createQuantityInfoElement(assetItem);
    if (isStock) {
        quantityInfo.textContent = `Birim fiyat: $${price.toFixed(2)} | Toplam: $${totalValue.toFixed(2)} | Ağırlık: %${weight.toFixed(2)}`;
    } else {
        const units = inputValue / price;
        quantityInfo.textContent = `Birim fiyat: $${price.toFixed(2)} | Miktar: ${units.toFixed(4)} birim | Ağırlık: %${weight.toFixed(2)}`;
    }
    
    // Portföy toplamlarını güncelle
    calculatePortfolioTotals();
}

// Miktar değiştiğinde hesaplamayı güncelle
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('input', function() {
            calculateAssetValues(this.closest('.asset-item'));
        });
    });

    // Portföy büyüklüğü değiştiğinde tüm değerleri güncelle
    document.getElementById('portfolio-size').addEventListener('input', function() {
        document.querySelectorAll('.asset-item').forEach(item => {
            calculateAssetValues(item);
        });
    });
});

// Miktar bilgisi elementi oluştur
function createQuantityInfoElement(assetItem) {
    const quantityDiv = assetItem.querySelector('.asset-quantity');
    const quantityInfo = document.createElement('div');
    quantityInfo.className = 'quantity-info';
    quantityInfo.style.fontSize = '0.8em';
    quantityInfo.style.color = '#666';
    quantityDiv.appendChild(quantityInfo);
    return quantityInfo;
}

// Form gönderme işlemi
async function handleFormSubmit(event) {
    event.preventDefault();
    
    try {
        const portfolioData = {
            portfolio_name: document.getElementById('portfolio-name').value,
            initial_value: parseFloat(document.getElementById('portfolio-size').value),
            description: document.getElementById('description')?.value || '',
            assets: []
        };

        // Varlıkları topla
        document.querySelectorAll('.asset-item').forEach(item => {
            const searchInput = item.querySelector('.asset-search-input');
            const quantityInput = item.querySelector('.quantity-input');
            const weightSpan = item.querySelector('.weight-value');
            
            if (searchInput?.dataset?.symbol && quantityInput?.value) {
                const isStock = searchInput.dataset.type === 'STOCK';
                const quantity = parseFloat(quantityInput.value);
                const price = parseFloat(searchInput.dataset.price);
                const weight = parseFloat(weightSpan.textContent);

                portfolioData.assets.push({
                    asset_type: searchInput.dataset.type,
                    asset_symbol: searchInput.dataset.symbol,
                    quantity: isStock ? quantity : quantity / price,
                    purchase_price: price,
                    weight: weight
                });
            }
        });

        // Validasyonlar
        if (!portfolioData.portfolio_name) {
            throw new Error('Portföy adı gereklidir');
        }

        if (portfolioData.assets.length === 0) {
            throw new Error('En az bir varlık eklemelisiniz');
        }

        const response = await fetch('/api/portfolios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(portfolioData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.details || error.error || 'Portföy kaydedilemedi');
        }
        
        alert('Portföy başarıyla oluşturuldu!');
        window.location.href = '/portfoy_olustur.html';
        
    } catch (err) {
        console.error('Hata:', err);
        showError(err.message);
    }
}

// Portföy düzenleme fonksiyonu
async function editPortfolio(portfolioId) {
    try {
        const response = await fetch(`/api/portfolios/${portfolioId}`);
        if (!response.ok) throw new Error('Portföy yüklenemedi');
        
        const data = await response.json();
        const portfolio = data.portfolio;
        
        // Form alanlarını doldur
        document.getElementById('portfolio-name').value = portfolio.portfolio_name;
        document.getElementById('portfolio-size').value = portfolio.initial_value;
        document.getElementById('description').value = portfolio.description || '';
        
        // Varlıkları temizle ve yeniden ekle
        const assetList = document.getElementById('assetList');
        assetList.innerHTML = '';
        
        portfolio.assets.forEach(asset => {
            addNewAsset();
            const lastItem = assetList.lastElementChild;
            
            const searchInput = lastItem.querySelector('.asset-search-input');
            const quantityInput = lastItem.querySelector('.quantity-input');
            
            searchInput.value = asset.asset_symbol;
            searchInput.dataset.type = asset.asset_type;
            searchInput.dataset.symbol = asset.asset_symbol;
            searchInput.dataset.price = asset.purchase_price;
            
            // Doğru miktarı hesapla
            const quantity = asset.asset_type === 'STOCK' ? 
                asset.quantity : 
                asset.quantity * asset.purchase_price;
            
            quantityInput.value = quantity;
            
            calculateAssetValues(lastItem);
        });
        
        // Form submit işlemini güncelleme olarak değiştir
        const form = document.getElementById('portfolioForm');
        form.onsubmit = (e) => handleUpdateSubmit(e, portfolioId);
        
        // Sayfayı form bölümüne kaydır
        form.scrollIntoView({ behavior: 'smooth' });
        
    } catch (err) {
        console.error('Portföy yükleme hatası:', err);
        alert('Portföy yüklenirken bir hata oluştu');
    }
}

// Portföy güncelleme submit işlemi
async function handleUpdateSubmit(event, portfolioId) {
    event.preventDefault();
    
    try {
        const portfolioData = {
            portfolio_name: document.getElementById('portfolio-name').value,
            description: document.getElementById('description')?.value || '',
            initial_value: parseFloat(document.getElementById('portfolio-size').value) || 0,
            assets: []
        };

        // Varlıkları topla
        document.querySelectorAll('.asset-item').forEach(item => {
            const searchInput = item.querySelector('.asset-search-input');
            const quantityInput = item.querySelector('.quantity-input');
            const weightSpan = item.querySelector('.weight-value');
            
            if (searchInput?.dataset?.symbol && quantityInput?.value) {
                portfolioData.assets.push({
                    type: searchInput.dataset.type,
                    symbol: searchInput.dataset.symbol,
                    quantity: parseFloat(quantityInput.value),
                    price: parseFloat(searchInput.dataset.price),
                    weight: parseFloat(weightSpan.textContent)
                });
            }
        });

        const response = await fetch(`/api/portfolios/${portfolioId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(portfolioData)
        });

        if (!response.ok) throw new Error('Güncelleme başarısız');
        
        alert('Portföy başarıyla güncellendi');
        window.location.reload();
        
    } catch (err) {
        console.error('Güncelleme hatası:', err);
        alert('Portföy güncellenirken bir hata oluştu');
    }
}

// Portföy silme fonksiyonu
async function deletePortfolio(portfolioId) {
    if (!confirm('Bu portföyü silmek istediğinizden emin misiniz?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/portfolios/${portfolioId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Silme işlemi başarısız');
        
        alert('Portföy başarıyla silindi');
        loadPortfolios();  // Portföy listesini yenile
        
    } catch (err) {
        console.error('Portföy silme hatası:', err);
        alert('Portföy silinirken bir hata oluştu');
    }
}

// Arama sonuçlarını gösterme
function displayResults(results, suggestionsDiv) {
    suggestionsDiv.innerHTML = '';
    let hasResults = false;

    // Hisse senetleri
    if (results.stocks && results.stocks.length > 0) {
        hasResults = true;
        results.stocks.forEach(stock => {
            const div = document.createElement('div');
            div.className = 'asset-suggestion-item';
            div.innerHTML = `${stock.name} (${stock.symbol}) - $${stock.price.toFixed(2)}`;
            div.onclick = () => selectAsset(stock, 'STOCK', suggestionsDiv.closest('.asset-search').querySelector('input'));
            suggestionsDiv.appendChild(div);
        });
    }

    // Emtialar
    if (results.commodities && results.commodities.length > 0) {
        hasResults = true;
        results.commodities.forEach(commodity => {
            const div = document.createElement('div');
            div.className = 'asset-suggestion-item';
            div.innerHTML = `${commodity.name} - $${commodity.price.toFixed(2)}`;
            div.onclick = () => selectAsset(commodity, 'COMMODITY', suggestionsDiv.closest('.asset-search').querySelector('input'));
            suggestionsDiv.appendChild(div);
        });
    }

    suggestionsDiv.style.display = hasResults ? 'block' : 'none';
}

// Varlık seçildiğinde
function selectAsset(asset, type, inputElement) {
    const assetItem = inputElement.closest('.asset-item');
    const quantityInput = assetItem.querySelector('.quantity-input');
    const quantityLabel = assetItem.querySelector('.quantity-label') || createQuantityLabel(assetItem);
    
    inputElement.value = type === 'STOCK' ? 
        `${asset.name} (${asset.symbol})` : 
        asset.name;
    
    inputElement.dataset.type = type;
    inputElement.dataset.symbol = type === 'STOCK' ? asset.symbol : asset.name;
    inputElement.dataset.price = asset.price;
    
    // Input tipini güncelle
    if (type === 'STOCK') {
        quantityInput.placeholder = 'Adet';
        quantityInput.step = '1';
        quantityInput.min = '1';
        quantityLabel.textContent = 'Adet:';
    } else {
        quantityInput.placeholder = 'USD Miktar';
        quantityInput.step = '0.01';
        quantityInput.min = '0.01';
        quantityLabel.textContent = 'USD Miktar:';
    }
    
    // Değerleri hesapla
    calculateAssetValues(assetItem);
    
    // Öneri kutusunu gizle
    inputElement.nextElementSibling.style.display = 'none';
}

// Miktar etiketi oluştur
function createQuantityLabel(assetItem) {
    const quantityDiv = assetItem.querySelector('.asset-quantity');
    const label = document.createElement('div');
    label.className = 'quantity-label';
    label.style.fontSize = '0.8em';
    label.style.marginBottom = '4px';
    quantityDiv.insertBefore(label, quantityDiv.firstChild);
    return label;
}

// Portföy toplamlarını hesapla
function calculatePortfolioTotals() {
    const portfolioSize = parseFloat(document.getElementById('portfolio-size').value) || 0;
    let totalInvested = 0;
    let totalWeight = 0;
    
    document.querySelectorAll('.asset-item').forEach(item => {
        const total = parseFloat(item.querySelector('.total-value').textContent) || 0;
        const weight = parseFloat(item.querySelector('.weight-value').textContent) || 0;
        
        totalInvested += total;
        totalWeight += weight;
    });
    
    // Toplamları güncelle
    document.getElementById('total-invested').textContent = totalInvested.toFixed(2);
    document.getElementById('remaining-amount').textContent = (portfolioSize - totalInvested).toFixed(2);
    document.getElementById('total-weight').textContent = totalWeight.toFixed(2);
    
    // Ağırlık uyarısı
    if (totalWeight > 100) {
        showError('Toplam ağırlık %100\'ü geçemez!');
    }
}

// Portföy düzenleme
async function editPortfolio(portfolioId) {
    try {
        const response = await fetch(`/api/portfolios/${portfolioId}`);
        if (!response.ok) throw new Error('Portföy yüklenemedi');
        
        const data = await response.json();
        const portfolio = data.portfolio;
        
        // Form alanlarını doldur
        document.getElementById('portfolio-name').value = portfolio.portfolio_name;
        document.getElementById('portfolio-size').value = portfolio.initial_value;
        document.getElementById('description').value = portfolio.description || '';
        
        // Varlıkları temizle ve yeniden ekle
        const assetList = document.getElementById('assetList');
        assetList.innerHTML = '';
        
        portfolio.assets.forEach(asset => {
            addNewAsset();
            const lastItem = assetList.lastElementChild;
            
            const searchInput = lastItem.querySelector('.asset-search-input');
            const quantityInput = lastItem.querySelector('.quantity-input');
            
            searchInput.value = asset.asset_symbol;
            searchInput.dataset.type = asset.asset_type;
            searchInput.dataset.symbol = asset.asset_symbol;
            searchInput.dataset.price = asset.purchase_price;
            
            // Doğru miktarı hesapla
            const quantity = asset.asset_type === 'STOCK' ? 
                asset.quantity : 
                asset.quantity * asset.purchase_price;
            
            quantityInput.value = quantity;
            
            calculateAssetValues(lastItem);
        });
        
    } catch (error) {
        showError('Portföy yüklenirken hata oluştu: ' + error.message);
    }
}

// Portföy silme
async function deletePortfolio(portfolioId) {
    if (!confirm('Bu portföyü silmek istediğinizden emin misiniz?')) return;
    
    try {
        const response = await fetch(`/api/portfolios/${portfolioId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Silme işlemi başarısız');
        
        // Portföy listesini yenile
        loadPortfolios();
        showSuccess('Portföy başarıyla silindi');
        
    } catch (error) {
        showError('Portföy silinirken hata oluştu: ' + error.message);
    }
}

// Hata gösterme
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Başarı mesajı gösterme
function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}