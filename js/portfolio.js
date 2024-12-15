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
}

// Varlık satırını silme
function removeAsset(button) {
    button.closest('.asset-item').remove();
    calculatePortfolioTotals();
}

// Varlık arama fonksiyonu
async function searchAssets(searchTerm, inputElement) {
    if (!searchTerm || searchTerm.length < 2) {
        inputElement.nextElementSibling.style.display = 'none';
        return;
    }

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`);
        if (!response.ok) throw new Error('Arama hatası');
        
        const results = await response.json();
        displayResults(results, inputElement.nextElementSibling);
    } catch (err) {
        console.error('Arama hatası:', err);
    }
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

        // Varlık listesini oluştur
        let assetsHtml = '<div class="portfolio-assets">';
        assetsHtml += '<div class="asset-list-title">Varlıklar:</div>';
        
        if (portfolio.portfolio_details && portfolio.portfolio_details.length > 0) {
            assetsHtml += portfolio.portfolio_details.map(asset => `
                <div class="asset-list-item">
                    <div class="asset-info">
                        <span class="asset-symbol">${escapeHtml(asset.asset_symbol)}</span>
                        <span class="asset-type">${asset.asset_type === 'STOCK' ? 'Hisse' : 'Emtia'}</span>
                    </div>
                    <div class="asset-values">
                        <div class="asset-quantity-value">
                            ${asset.asset_type === 'STOCK' 
                                ? `${Number(asset.quantity).toLocaleString()} adet`
                                : `$${Number(asset.quantity).toLocaleString('tr-TR', {minimumFractionDigits: 2})}`
                            }
                        </div>
                        <div class="asset-weight-value">
                            %${Number(asset.weight).toFixed(2)}
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            assetsHtml += '<div class="empty-assets">Varlık bulunamadı</div>';
        }
        assetsHtml += '</div>';

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
                    <span>Toplam Değer:</span>
                    <span>$${Number(portfolio.initial_value).toLocaleString('tr-TR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}</span>
                </div>
                <div class="portfolio-detail-item">
                    <span>Varlık Sayısı:</span>
                    <span>${portfolio.portfolio_details?.length || 0}</span>
                </div>
                <div class="portfolio-detail-item">
                    <span>Oluşturma Tarihi:</span>
                    <span>${new Date(portfolio.creation_date).toLocaleDateString('tr-TR')}</span>
                </div>
                ${assetsHtml}
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

// Portföyleri yükleme fonksiyonu
async function loadPortfolios() {
    try {
        const response = await fetch('/api/portfolios');
        if (!response.ok) throw new Error('Portföyler getirilemedi');
        
        const portfolios = await response.json();
        console.log('Loaded portfolios:', portfolios); // Debug için
        displayPortfolios(portfolios);
    } catch (error) {
        console.error('Portföyleri yükleme hatası:', error);
    }
}

// Arama sonuçlarını görüntüleme
function displayResults(results, suggestionsDiv) {
    suggestionsDiv.innerHTML = '';
    let hasResults = false;

    // Hisse senetlerini göster
    if (results.stocks && results.stocks.length > 0) {
        hasResults = true;
        results.stocks.forEach(stock => {
            const div = document.createElement('div');
            div.className = 'asset-suggestion-item';
            div.innerHTML = `
                <div class="asset-info">
                    <span class="symbol">${stock.Symbol}</span>
                    <span class="name">${stock.Shortname}</span>
                </div>
                <span class="price">$${Number(stock.Currentprice).toFixed(2)}</span>
            `;
            div.onclick = () => selectAsset(stock, 'STOCK', suggestionsDiv.closest('.asset-search').querySelector('input'));
            suggestionsDiv.appendChild(div);
        });
    }

    // Emtiaları göster
    if (results.commodities) {
        const commodityData = results.commodities;
        const searchTerm = suggestionsDiv.closest('.asset-search').querySelector('input').value.toLowerCase();
        
        // Date dışındaki tüm emtiaları döngüye al
        Object.entries(commodityData).forEach(([key, value]) => {
            if (key !== 'Date' && value !== 0 && value !== null && 
                key.toLowerCase().includes(searchTerm)) {
                hasResults = true;
                const div = document.createElement('div');
                div.className = 'asset-suggestion-item';
                div.innerHTML = `
                    <div class="asset-info">
                        <span class="symbol">${key}</span>
                        <span class="type">Emtia</span>
                    </div>
                    <span class="price">$${Number(value).toFixed(2)}</span>
                `;
                div.onclick = () => selectAsset(
                    { name: key, price: value }, 
                    'COMMODITY', 
                    suggestionsDiv.closest('.asset-search').querySelector('input')
                );
                suggestionsDiv.appendChild(div);
            }
        });
    }

    suggestionsDiv.style.display = hasResults ? 'block' : 'none';
}

// Varlık seçildiğinde
function selectAsset(asset, type, inputElement) {
    const assetItem = inputElement.closest('.asset-item');
    
    // Veri kontrolü
    console.log('Seçilen varlık bilgileri:', {
        asset: asset,
        type: type,
        price: type === 'STOCK' ? asset.Currentprice : asset.price
    });

    // Dataset'i temizle ve yeniden ata
    inputElement.dataset.type = type;
    inputElement.dataset.symbol = type === 'STOCK' ? asset.Symbol : asset.name;
    inputElement.dataset.price = type === 'STOCK' ? asset.Currentprice : asset.price;

    if (!inputElement.dataset.type || !inputElement.dataset.symbol || !inputElement.dataset.price) {
        console.error('Eksik varlık verisi:', {
            type: inputElement.dataset.type,
            symbol: inputElement.dataset.symbol,
            price: inputElement.dataset.price
        });
        alert('Varlık bilgileri eksik. Lütfen tekrar seçin.');
        return;
    }

    // Input değerini ayarla
    inputElement.value = type === 'STOCK' ? 
        `${asset.Shortname} (${asset.Symbol})` : 
        asset.name;

    // Quantity input'u bul ve ayarla
    const quantityInput = assetItem.querySelector('.quantity-input');
    if (quantityInput) {
        quantityInput.value = '';
        // Emtia için placeholder'ı değiştir
        if (type === 'COMMODITY') {
            quantityInput.placeholder = 'Tutar ($)';
            quantityInput.dataset.inputType = 'amount';
        } else {
            quantityInput.placeholder = 'Adet';
            quantityInput.dataset.inputType = 'quantity';
        }
        quantityInput.addEventListener('input', () => calculateAssetValues(assetItem));
    }

    // Öneri kutusunu gizle
    const suggestions = inputElement.nextElementSibling;
    if (suggestions) {
        suggestions.style.display = 'none';
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
    
    const price = parseFloat(searchInput.dataset.price) || 0;
    const inputValue = parseFloat(quantityInput.value) || 0;
    let quantity, totalValue;

    // Emtia için tutar girildiyse miktarı hesapla
    if (searchInput.dataset.type === 'COMMODITY' && quantityInput.dataset.inputType === 'amount') {
        totalValue = inputValue; // Girilen değer direkt total value
        quantity = inputValue; // Artık miktarı çevirmiyoruz
    } else {
        quantity = inputValue;
        totalValue = price * quantity;
    }
    
    // Portföy toplam değerini al
    const portfolioSize = parseFloat(document.getElementById('portfolio-size').value) || 0;
    
    // Ağırlığı hesapla
    const weight = portfolioSize > 0 ? (totalValue / portfolioSize) * 100 : 0;
    
    // Değerleri güncelle
    weightSpan.textContent = weight.toFixed(2);
    totalSpan.textContent = totalValue.toFixed(2);

    // Emtia için birim göster
    if (searchInput.dataset.type === 'COMMODITY' && quantity > 0) {
        const commodityUnit = COMMODITY_UNITS[searchInput.dataset.symbol] || 'birim';
        const quantityInfo = assetItem.querySelector('.quantity-info') || 
            createQuantityInfoElement(assetItem);
        quantityInfo.textContent = `${quantity.toFixed(2)} $`;
    }
    
    // Tüm portföyü yeniden hesapla
    calculatePortfolioTotals();
}

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
                const inputValue = parseFloat(quantityInput.value);
                const price = parseFloat(searchInput.dataset.price);

                // Validasyon kontrolleri
                if (!searchInput.dataset.type || !searchInput.dataset.symbol || 
                    !inputValue || !price) {
                    console.log('Eksik veri:', {
                        type: searchInput.dataset.type,
                        symbol: searchInput.dataset.symbol,
                        quantity: inputValue,
                        price: price
                    });
                    throw new Error('Tüm varlık bilgilerinin eksiksiz girildiğinden emin olun');
                }

                portfolioData.assets.push({
                    type: searchInput.dataset.type,
                    symbol: searchInput.dataset.symbol,
                    quantity: inputValue,
                    price: price,
                    weight: parseFloat(weightSpan.textContent) || 0
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

        // Veri kontrolü için log
        console.log('Gönderilecek veri:', portfolioData);

        const response = await fetch('/api/portfolios', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(portfolioData)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.details || result.error || 'Portföy kaydedilemedi');
        }
        
        alert('Portföy başarıyla oluşturuldu!');
        window.location.href = '/portfoy_olustur.html';
        
    } catch (err) {
        console.error('Hata:', err);
        alert(err.message);
    }
}

// Portföy düzenleme fonksiyonu
async function editPortfolio(portfolioId) {
    try {
        const response = await fetch(`/api/portfolios/${portfolioId}`);
        if (!response.ok) throw new Error('Portföy yüklenemedi');
        
        const portfolio = await response.json();
        
        // Form alanlarını doldur
        document.getElementById('portfolio-name').value = portfolio.portfolio_name;
        document.getElementById('description').value = portfolio.description || '';
        document.getElementById('portfolio-size').value = portfolio.initial_value;
        
        // Mevcut varlıkları temizle
        document.getElementById('assetList').innerHTML = '';
        
        // Portföy varlıklarını ekle
        portfolio.portfolio_details.forEach(asset => {
            addNewAsset();
            const lastAssetItem = document.querySelector('.asset-item:last-child');
            const searchInput = lastAssetItem.querySelector('.asset-search-input');
            const quantityInput = lastAssetItem.querySelector('.quantity-input');
            
            // Varlık bilgilerini doldur
            searchInput.value = asset.asset_symbol;
            searchInput.dataset.type = asset.asset_type;
            searchInput.dataset.symbol = asset.asset_symbol;
            searchInput.dataset.price = asset.purchase_price;
            
            quantityInput.value = asset.quantity;
            
            // Değerleri hesapla
            calculateAssetValues(lastAssetItem);
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