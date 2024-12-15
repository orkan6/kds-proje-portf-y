// Sayfa yüklendiğinde portföyleri getir
document.addEventListener('DOMContentLoaded', async function() {
    await loadPortfolios();
});

// Portföyleri yükle ve select'e ekle
async function loadPortfolios() {
    try {
        const response = await fetch('/api/portfolios');
        const portfolios = await response.json();
        
        const portfolioSelect = document.getElementById('portfolioSelect');
        if (!portfolioSelect) {
            console.error('Portföy seçim elementi bulunamadı');
            return;
        }

        // Önceki event listener'ları temizle
        const newSelect = portfolioSelect.cloneNode(true);
        portfolioSelect.parentNode.replaceChild(newSelect, portfolioSelect);
        
        // Select'i doldur
        newSelect.innerHTML = '<option value="">Portföy seçiniz...</option>';
        portfolios.forEach(portfolio => {
            const option = document.createElement('option');
            option.value = portfolio.portfolio_id;
            option.textContent = portfolio.portfolio_name;
            newSelect.appendChild(option);
        });

        // Yeni event listener ekle
        newSelect.addEventListener('change', async function() {
            const portfolioId = this.value;
            if (!portfolioId) {
                resetAnalysis();
                return;
            }

            try {
                // Loading durumunu göster
                document.querySelectorAll('.metric-value').forEach(el => {
                    el.textContent = '';
                });

                const response = await fetch(`/api/portfolios/${portfolioId}/analysis`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.details || data.error || 'Analiz verileri alınamadı');
                }
                
                if (!data.assets || data.assets.length === 0) {
                    throw new Error('Portföyde varlık bulunamadı');
                }
                
                updateAnalysisDisplay(data);
                
            } catch (err) {
                console.error('Analiz hatası:', err);
                alert(`Portföy analizi yapılırken bir hata oluştu: ${err.message}`);
                resetAnalysis();
            }
        });

    } catch (error) {
        console.error('Portföy listesi yükleme hatası:', error);
        alert('Portföyler yüklenirken bir hata oluştu');
    }
}

// Analiz verilerini göster
function updateAnalysisDisplay(analysis) {
    try {
        if (!analysis) {
            console.error('Analiz verisi boş');
            return;
        }

        // Beklenen getirileri ve volatiliteleri formatla
        const expectedReturns = {
            '1M': (analysis.expected_portfolio_returns['1M'] * 100).toFixed(2),
            '3M': (analysis.expected_portfolio_returns['3M'] * 100).toFixed(2),
            '6M': (analysis.expected_portfolio_returns['6M'] * 100).toFixed(2),
            '1Y': (analysis.expected_portfolio_returns['1Y'] * 100).toFixed(2)
        };

        const volatilities = {
            '1M': (analysis.portfolio_volatilities['1M'] * 100).toFixed(2),
            '3M': (analysis.portfolio_volatilities['3M'] * 100).toFixed(2),
            '6M': (analysis.portfolio_volatilities['6M'] * 100).toFixed(2),
            '1Y': (analysis.portfolio_volatilities['1Y'] * 100).toFixed(2)
        };

        // Risk metriklerini güncelle
        const riskElements = {
            'betaValue': analysis.risk_metrics?.beta?.toFixed(2) || '-',
            'beta6M': analysis.risk_metrics?.beta_6m?.toFixed(2) || '-',
            'beta3M': analysis.risk_metrics?.beta_3m?.toFixed(2) || '-',
            'alphaValue': (analysis.risk_metrics?.alpha['1Y'] * 100).toFixed(2) + '%' || '-',
            'alpha6M': (analysis.risk_metrics?.alpha['6M'] * 100).toFixed(2) + '%' || '-',
            'alpha3M': (analysis.risk_metrics?.alpha['3M'] * 100).toFixed(2) + '%' || '-'
        };

        // Sharpe ve Treynor oranlarını güncelle
        Object.entries(analysis.performance_ratios.sharpe).forEach(([period, value]) => {
            const element = document.getElementById(`sharpeRatio${period}`);
            if (element) {
                element.textContent = value.toFixed(2);
            }
        });

        Object.entries(analysis.performance_ratios.treynor).forEach(([period, value]) => {
            const element = document.getElementById(`treynorRatio${period}`);
            if (element) {
                element.textContent = value.toFixed(2);
            }
        });

        // Varsayılan değerleri güncelle (1Y)
        document.getElementById('sharpeRatioCurrent').textContent = 
            analysis.performance_ratios.sharpe['1Y'].toFixed(2);
        document.getElementById('treynorRatioCurrent').textContent = 
            analysis.performance_ratios.treynor['1Y'].toFixed(2);

        // DOM elementlerini güncelle
        const elements = {
            'expectedReturn1M': expectedReturns['1M'] + '%',
            'expectedReturn3M': expectedReturns['3M'] + '%',
            'expectedReturn6M': expectedReturns['6M'] + '%',
            'expectedReturn1Y': expectedReturns['1Y'] + '%',
            'volatility1M': volatilities['1M'] + '%',
            'volatility3M': volatilities['3M'] + '%',
            'volatility6M': volatilities['6M'] + '%',
            'volatility1Y': volatilities['1Y'] + '%',
            ...riskElements
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });

        // Korelasyon matrisini güncelle
        updateCorrelationMatrix(analysis.correlation_matrix);

        // Performans grafiğini güncelle
        updatePerformanceChart(analysis);

    } catch (err) {
        console.error('Metrik güncelleme hatası:', err);
    }
}

// Korelasyon matrisini güncelle
function updateCorrelationMatrix(correlationData) {
    const table = document.getElementById('correlationMatrix');
    if (!table || !correlationData || !correlationData.assets) {
        console.warn('Korelasyon matrisi için gerekli veriler eksik');
        return;
    }

    const { assets, matrix } = correlationData;

    // Başlık satırını oluştur
    const thead = table.querySelector('thead tr');
    thead.innerHTML = '<th>Varlık</th>' + assets.map(symbol => 
        `<th>${symbol || 'N/A'}</th>`
    ).join('');

    // Matris satırlarını oluştur
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = matrix.map((row, i) => `
        <tr>
            <td><strong>${assets[i] || 'N/A'}</strong></td>
            ${row.map((value, j) => {
                const formattedValue = parseFloat(value).toFixed(2);
                const cellClass = i === j ? 'correlation-perfect' : getCorrelationClass(value);
                return `
                    <td class="${cellClass}">
                        ${formattedValue}
                    </td>
                `;
            }).join('')}
        </tr>
    `).join('');
}

// Korelasyon değerine göre renk sınıfı belirle
function getCorrelationClass(value) {
    if (value === 1) return 'correlation-perfect';
    if (value >= 0.7) return 'correlation-high-positive';
    if (value >= 0.3) return 'correlation-moderate-positive';
    if (value > -0.3) return 'correlation-neutral';
    if (value > -0.7) return 'correlation-moderate-negative';
    return 'correlation-high-negative';
}

// Performans grafiğini güncelle
function updatePerformanceChart(analysis) {
    try {
        const canvas = document.getElementById('performanceChart');
        if (!canvas) {
            console.warn('Grafik canvas elementi bulunamadı');
            return;
        }

        // Mevcut grafiği temizle
        if (window.performanceChart instanceof Chart) {
            window.performanceChart.destroy();
            window.performanceChart = null;  // Referansı temizle
        }

        const ctx = canvas.getContext('2d');

        // Veri kontrolü
        if (!analysis.assets || analysis.assets.length === 0) {
            console.warn('Grafik için veri bulunamadı');
            return;
        }

        // Tarih ve fiyat verilerini hazırla
        let allDates = new Set();
        const prices = {};
        
        // Her varlık için fiyat geçmişini işle ve tüm tarihleri topla
        analysis.assets.forEach(asset => {
            if (asset.price_history && asset.price_history.length > 0) {
                prices[asset.symbol] = {};
                asset.price_history.forEach(history => {
                    // Tarihi doğru formatta parse et
                    const date = typeof history.date === 'string' ? 
                        new Date(history.date.replace(' ', 'T')) : 
                        new Date(history.date);
                    
                    if (isNaN(date.getTime())) {
                        console.warn('Geçersiz tarih:', history.date);
                        return;
                    }

                    allDates.add(date.getTime());
                    prices[asset.symbol][date.getTime()] = history.price;
                });
            }
        });

        // Tarihleri sırala
        const sortedDates = Array.from(allDates).sort((a, b) => a - b);

        // Dataset'leri oluştur
        const datasets = Object.keys(prices).map(symbol => {
            const data = sortedDates.map(timestamp => ({
                x: new Date(timestamp),  // Timestamp'i Date objesine çevir
                y: prices[symbol][timestamp] || null
            }));

            return {
                label: symbol,
                data: data,
                borderColor: getRandomColor(),
                tension: 0.1,
                fill: false,
                pointRadius: 0  // Noktaları gizle
            };
        });

        // Yeni grafik oluştur
        window.performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Varlık Fiyat Performansı'
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'month',
                            displayFormats: {
                                month: 'MMM yyyy'  // YYYY yerine yyyy kullan
                            },
                            tooltipFormat: 'dd MMM yyyy'
                        },
                        display: true,
                        title: {
                            display: true,
                            text: 'Tarih'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Fiyat ($)'
                        },
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error('Grafik güncelleme hatası:', err);
    }
}

// Rastgele renk üret
function getRandomColor() {
    const colors = [
        '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63',
        '#00BCD4', '#FFC107', '#3F51B5', '#795548', '#607D8B'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Analiz verilerini sıfırla
function resetAnalysis() {
    const elements = [
        'totalReturn', 'volatility', 'sharpeRatio',
        'betaValue', 'alphaValue', 'rSquaredValue'
    ];

    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = '-';
        }
    });

    // Grafiği temizle
    const canvas = document.getElementById('performanceChart');
    if (canvas && window.performanceChart instanceof Chart) {
        window.performanceChart.destroy();
        window.performanceChart = null;
    }
}

// Dropdown işlevselliği için event listener'ları ekle
document.addEventListener('DOMContentLoaded', function() {
    // Dropdown kartları için click event'lerini ekle
    document.querySelectorAll('.metric-card.dropdown').forEach(card => {
        card.addEventListener('click', function() {
            this.classList.toggle('active');
        });
    });

    // Dropdown item'ları için click event'lerini ekle
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.stopPropagation(); // Kartın click event'ini engelle
            const period = this.dataset.period;
            const value = this.querySelector('span:last-child').textContent;
            
            // Ana değeri güncelle
            const card = this.closest('.metric-card');
            const mainValue = card.querySelector('.metric-value');
            mainValue.textContent = value;
            
            // Aktif dönemi işaretle
            card.querySelectorAll('.dropdown-item').forEach(di => {
                di.classList.remove('active');
            });
            this.classList.add('active');
        });
    });

    // Sayfa dışı tıklamalarda dropdown'ları kapat
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.metric-card.dropdown')) {
            document.querySelectorAll('.metric-card.dropdown').forEach(card => {
                card.classList.remove('active');
            });
        }
    });
});