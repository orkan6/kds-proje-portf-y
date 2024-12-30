class UIManager {
    constructor() {
        this.loadingStates = new Map();
    }

    startLoading(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.classList.add('loading');
        this.loadingStates.set(elementId, true);
    }

    stopLoading(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.classList.remove('loading');
        this.loadingStates.delete(elementId);
    }

    updateLoadingState() {
        const isAnyLoading = this.loadingStates.size > 0;
        document.body.classList.toggle('loading', isAnyLoading);
    }

    showMessage(message, type = 'info') {
        
    }

    static async updatePortfolioView(results) {
        if (!results) {
            console.warn('Sonuç verisi eksik');
            return;
        }

        if (results.metrics) {
            this.updateMetrics(results.metrics);
        } else if (results.portfolio?.metrics) {
            this.updateMetrics(results.portfolio.metrics);
        }

        if (results.portfolio || results.portfolio_details) {
            await this.updateCharts(results);
        }

        if (results.recommendations) {
            this.updateRecommendations(results.recommendations);
        }
    }

    static updateMetrics(metrics = {}) {
        const metricElements = {
            expectedReturn: 'expectedReturn',
            estimatedRisk: 'estimatedRisk',
            optimizedSharpe: 'optimizedSharpe',
            cvarValue: 'cvarValue',
            betaValue: 'betaValue',
            sectorConcentration: 'sectorConcentration'
        };

        Object.entries(metricElements).forEach(([metric, elementId]) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = metrics[metric] !== undefined ? 
                    this.formatMetricValue(metrics[metric], metric) : 
                    '-';
            }
        });
    }

    static formatMetricValue(value, metricType) {
        const formatters = {
            expectedReturn: v => `${(v * 100).toFixed(2)}%`,
            estimatedRisk: v => `${(v * 100).toFixed(2)}%`,
            optimizedSharpe: v => v.toFixed(2),
            cvarValue: v => `${(v * 100).toFixed(2)}%`,
            betaValue: v => v.toFixed(2),
            sectorConcentration: v => `${(v * 100).toFixed(2)}%`
        };

        if (!formatters[metricType]) {
            console.warn(`Bilinmeyen metrik tipi: ${metricType}`);
            return value?.toString() || '-';
        }

        try {
            return formatters[metricType](value);
        } catch (err) {
            console.error(`Metrik formatlanırken hata: ${metricType}`, err);
            return '-';
        }
    }

    static showLoading() {
        document.querySelectorAll('.optimization-card').forEach(card => {
            card.classList.add('loading');
        });
    }

    static hideLoading() {
        document.querySelectorAll('.optimization-card').forEach(card => {
            card.classList.remove('loading');
        });
    }

    static showError(message) {
        alert(message); 
    }

    static resetMetrics() {
        const metrics = [
            'expectedReturn',
            'estimatedRisk',
            'optimizedSharpe',
            'cvarValue',
            'betaValue',
            'sectorConcentration'
        ];

        metrics.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '-';
        });
    }

    static async updateCharts(results) {
        if (results.portfolio_details) {
            window.ChartManager.updateAllocationChart('allocationChart', {
                labels: results.portfolio_details.map(d => d.asset_symbol),
                values: results.portfolio_details.map(d => d.weight)
            });

            const sectorData = this.calculateSectorDistribution(results.portfolio_details);
            window.ChartManager.updateSectorChart('sectorChart', sectorData);

            if (results.metrics && results.metrics.performance) {
                window.ChartManager.updatePerformanceChart('performanceChart', {
                    dates: results.metrics.dates || Array(results.metrics.performance.length).fill().map((_, i) => i),
                    portfolio: results.metrics.performance,
                    market: results.metrics.marketPerformance || []
                });
            }
        }

        if (results.efficientFrontier) {
            window.ChartManager.updateEfficientFrontierChart('efficientFrontierChart', 
                results.efficientFrontier);
        }
    }

    static calculateSectorDistribution(portfolioDetails) {
        const sectorWeights = {};
        
        portfolioDetails.forEach(asset => {
            if (asset.sector) {
                sectorWeights[asset.sector] = (sectorWeights[asset.sector] || 0) + asset.weight;
            }
        });

        return {
            labels: Object.keys(sectorWeights),
            values: Object.values(sectorWeights)
        };
    }

    static updateRecommendations(recommendations) {
        const container = document.querySelector('.recommendation-container');
        if (!container || !recommendations) return;

        container.innerHTML = this.generateRecommendationsHTML(recommendations);
    }

    static generateRecommendationsHTML(recommendations) {
        
        return `
            <div class="recommendation-section">
                <h3>Düşük Korelasyonlu Varlıklar</h3>
                <div class="recommendation-grid">
                    ${this.generateAssetCards(recommendations.lowCorrelation)}
                </div>
            </div>
            <div class="recommendation-section">
                <h3>Sektör Çeşitlendirme Önerileri</h3>
                <div class="recommendation-grid">
                    ${this.generateAssetCards(recommendations.sectorDiversification)}
                </div>
            </div>
        `;
    }

    static generateAssetCards(assets) {
        if (!assets) return '';
        
        return assets.map(asset => `
            <div class="recommendation-card">
                <h4>${asset.symbol} - ${asset.name}</h4>
                <div class="recommendation-details">
                    <p>Sektör: <span>${asset.sector}</span></p>
                    ${asset.correlation ? 
                        `<p>Korelasyon: <span>${(asset.correlation * 100).toFixed(2)}%</span></p>` : 
                        ''}
                    <p>Fiyat: <span>$${asset.currentPrice.toFixed(2)}</span></p>
                </div>
                <button onclick="app.handleAssetSimulation('${asset.symbol}')">
                    Simüle Et
                </button>
            </div>
        `).join('');
    }

    static initializeSimulation() {
        
        this.searchInput = document.getElementById('assetSearchInput');
        this.searchResults = document.getElementById('searchResults');
        this.addAssetBtn = document.getElementById('addAssetBtn');
        this.simulationTable = document.getElementById('simulationTable');
        this.totalWeight = document.getElementById('totalWeight');
        
        
        this.searchInput.addEventListener('input', this.handleAssetSearch.bind(this));
        this.addAssetBtn.addEventListener('click', this.handleAssetAdd.bind(this));
        
        
        const riskInput = document.getElementById('simulationRiskTolerance');
        const riskValue = document.getElementById('simulationRiskToleranceValue');
        riskInput.addEventListener('input', (e) => {
            riskValue.textContent = `${e.target.value}%`;
        });

        
        document.getElementById('runSimulationBtn').addEventListener('click', 
            this.handleRunSimulation.bind(this));
        document.getElementById('optimizeSimulationBtn').addEventListener('click', 
            this.handleOptimizeSimulation.bind(this));
    }

    static async handleAssetSearch(event) {
        const searchTerm = event.target.value;
        if (searchTerm.length < 2) {
            this.searchResults.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`/api/search?q=${searchTerm}`);
            const data = await response.json();
            
            this.searchResults.innerHTML = '';
            this.searchResults.style.display = 'block';

            [...data.stocks, ...data.commodities].forEach(asset => {
                const div = document.createElement('div');
                div.className = 'list-group-item list-group-item-action';
                div.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-0">${asset.symbol || asset.name}</h6>
                            <small class="text-muted">${asset.sector || 'Emtia'}</small>
                        </div>
                        <span class="text-primary">${this.formatCurrency(asset.price)}</span>
                    </div>
                `;
                div.addEventListener('click', () => this.selectAsset(asset));
                this.searchResults.appendChild(div);
            });

        } catch (error) {
            console.error('Arama hatası:', error);
        }
    }

    static selectAsset(asset) {
        this.selectedAsset = {
            ...asset,
            currentPrice: asset.price 
        };
        this.searchInput.value = asset.symbol || asset.name;
        this.searchResults.style.display = 'none';
    }

    static handleAssetAdd() {
        if (!this.selectedAsset) return;

        const tbody = this.simulationTable.querySelector('tbody');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${this.selectedAsset.symbol || this.selectedAsset.name}</td>
            <td>${this.selectedAsset.symbol ? 'Hisse' : 'Emtia'}</td>
            <td>${this.selectedAsset.sector || '-'}</td>
            <td>
                <input type="number" 
                    class="form-control weight-input" 
                    value="0" 
                    min="0" 
                    max="100"
                    step="0.01">
            </td>
            <td>
                <input type="number"
                    class="form-control price-input"
                    value="${this.selectedAsset.currentPrice || 0}"
                    min="0"
                    step="0.01">
            </td>
            <td>
                <input type="number"
                    class="form-control quantity-input"
                    value="0"
                    min="0"
                    step="1">
            </td>
            <td class="asset-value">$0.00</td>
            <td>
                <button class="btn btn-danger btn-sm">Sil</button>
            </td>
        `;

        
        const weightInput = row.querySelector('.weight-input');
        const priceInput = row.querySelector('.price-input');
        const quantityInput = row.querySelector('.quantity-input');
        const valueCell = row.querySelector('.asset-value');

        
        const updateValueAndWeight = () => {
            
            const rows = tbody.querySelectorAll('tr');
            let totalPortfolioValue = 0;
            
            rows.forEach(row => {
                const price = parseFloat(row.querySelector('.price-input').value) || 0;
                const quantity = parseFloat(row.querySelector('.quantity-input').value) || 0;
                const value = price * quantity;
                row.querySelector('.asset-value').textContent = this.formatCurrency(value);
                totalPortfolioValue += value;
            });

            
            rows.forEach(row => {
                const price = parseFloat(row.querySelector('.price-input').value) || 0;
                const quantity = parseFloat(row.querySelector('.quantity-input').value) || 0;
                const value = price * quantity;
                const weight = totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0;
                row.querySelector('.weight-input').value = weight.toFixed(2);
            });

            this.updateTotalWeight();
            this.updateTotalValue();
        };

        
        weightInput.addEventListener('input', (e) => {
            
            const weight = parseFloat(e.target.value) || 0;
            const price = parseFloat(priceInput.value) || 0;
            const totalValue = parseFloat(document.getElementById('totalValue').textContent.replace(/[^0-9.-]+/g, '')) || 0;
            const targetValue = (weight / 100) * totalValue;
            const newQuantity = price > 0 ? targetValue / price : 0;
            quantityInput.value = newQuantity.toFixed(2);
            updateValueAndWeight();
        });

        priceInput.addEventListener('input', updateValueAndWeight);
        quantityInput.addEventListener('input', updateValueAndWeight);

        
        const deleteBtn = row.querySelector('.btn-danger');
        deleteBtn.addEventListener('click', () => {
            row.remove();
            this.updateTotalWeight();
            this.updateTotalValue();
        });

        tbody.appendChild(row);
        this.selectedAsset = null;
        this.searchInput.value = '';
        this.updateTotalWeight();
        this.updateTotalValue();
    }

    static updateTotalWeight() {
        const inputs = this.simulationTable.querySelectorAll('.weight-input');
        const total = Array.from(inputs).reduce((sum, input) => sum + Number(input.value), 0);
        this.totalWeight.textContent = `${total.toFixed(2)}%`;
    }

    static getSimulationPortfolio() {
        const rows = this.simulationTable.querySelectorAll('tbody tr');
        return Array.from(rows).map(row => {
            const assetType = row.cells[1].textContent.trim();
            return {
                asset_symbol: row.cells[0].textContent.split('(')[0].trim(),
                asset_type: assetType.includes('Hisse') || assetType === 'STOCK' ? 'STOCK' : 'COMMODITY',
                weight: Number(row.querySelector('.weight-input').value),
                sector: row.cells[2].textContent
            };
        });
    }

    static async handleRunSimulation() {
        try {
            this.showLoading();
            
            const portfolio = this.getSimulationPortfolio();
            if (portfolio.length === 0) {
                this.showError('Lütfen en az bir varlık ekleyin');
                return;
            }

            
            const response = await fetch('/api/simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portfolio })
            });

            if (!response.ok) throw new Error('Simülasyon hatası');
            const results = await response.json();

            
            this.updateSimulationResults(results);
            this.updateSimulationCharts(results);

        } catch (error) {
            console.error('Simülasyon hatası:', error);
            this.showError('Simülasyon sırasında bir hata oluştu');
        } finally {
            this.hideLoading();
        }
    }

    static async handleOptimizeSimulation() {
        try {
            this.showLoading();
            
            const portfolio = this.getSimulationPortfolio();
            const riskTolerance = document.getElementById('simulationRiskTolerance').value / 100;

            
            const response = await fetch('/api/simulation/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    portfolio,
                    riskTolerance 
                })
            });

            if (!response.ok) throw new Error('Optimizasyon hatası');
            const results = await response.json();

            
            this.updateSimulationResults(results);
            this.updateSimulationCharts(results);
            this.updateSimulationWeights(results.optimizedWeights);

        } catch (error) {
            console.error('Optimizasyon hatası:', error);
            this.showError('Optimizasyon sırasında bir hata oluştu');
        } finally {
            this.hideLoading();
        }
    }

    static updateSimulationResults(results) {
        console.log("Simulation results:", results);
        
        let returnValue = 0, riskValue = 0, concentrationValue = 0;  

        
        const returnElement = document.getElementById('simulatedReturn');
        if (returnElement) {
            returnValue = (results.expectedReturn || 0) * 100;
            returnElement.textContent = `${returnValue.toFixed(2)}%`;
        } else {
            console.warn('simulatedReturn elementi bulunamadı');
        }

        
        const riskElement = document.getElementById('simulatedRisk');
        if (riskElement) {
            riskValue = (results.estimatedRisk || 0) * 100;
            riskElement.textContent = `${riskValue.toFixed(2)}%`;
        }

        
        const concentrationElement = document.getElementById('sectorConcentration');
        if (concentrationElement) {
            concentrationValue = (results.sectorConcentration || 0) * 100;
            concentrationElement.textContent = `${concentrationValue.toFixed(2)}%`;
        }

        
        console.log('Güncellenecek değerler:', {
            return: returnValue,
            risk: riskValue,
            concentration: concentrationValue
        });
    }

    static updateSimulationCharts(results) {
        
        if (results.efficientFrontier) {
            window.ChartManager.updateEfficientFrontierChart(
                'simulationEfficientFrontierChart',
                results.efficientFrontier,
                { currentPoint: results }
            );
        }

        
    }

    static updateSimulationWeights(weights) {
        const inputs = this.simulationTable.querySelectorAll('.weight-input');
        weights.forEach((weight, index) => {
            if (inputs[index]) {
                inputs[index].value = (weight * 100).toFixed(2);
            }
        });
        this.updateTotalWeight();
    }

    static initializeSimulationTable(portfolioDetails, totalValue) {
        const tbody = document.querySelector('#simulationTable tbody');
        if (!tbody) return;

        
        const table = document.querySelector('#simulationTable');
        table.classList.add('simulation-table');

        tbody.innerHTML = '';

        portfolioDetails.forEach(asset => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${asset.asset_symbol} (${asset.name || ''})</td>
                <td>${asset.asset_type}</td>
                <td>${asset.sector || '-'}</td>
                <td>
                    <input type="number" 
                        class="form-control weight-input" 
                        value="${asset.weight}" 
                        min="0" 
                        max="100"
                        step="0.01">
                </td>
                <td>
                    <input type="number"
                        class="form-control price-input"
                        value="${asset.currentPrice}"
                        min="0"
                        step="0.01">
                </td>
                <td>
                    <input type="number"
                        class="form-control quantity-input"
                        value="${asset.quantity}"
                        min="0"
                        step="1">
                </td>
                <td class="asset-value">${this.formatCurrency(asset.currentValue)}</td>
                <td>
                    <button class="btn btn-danger btn-sm">Sil</button>
                </td>
            `;

            
            const weightInput = row.querySelector('.weight-input');
            const priceInput = row.querySelector('.price-input');
            const quantityInput = row.querySelector('.quantity-input');
            const valueCell = row.querySelector('.asset-value');

            
            const updateValueAndWeight = () => {
                
                const rows = tbody.querySelectorAll('tr');
                let totalPortfolioValue = 0;
                
                rows.forEach(row => {
                    const price = parseFloat(row.querySelector('.price-input').value) || 0;
                    const quantity = parseFloat(row.querySelector('.quantity-input').value) || 0;
                    const value = price * quantity;
                    row.querySelector('.asset-value').textContent = this.formatCurrency(value);
                    totalPortfolioValue += value;
                });

                
                rows.forEach(row => {
                    const price = parseFloat(row.querySelector('.price-input').value) || 0;
                    const quantity = parseFloat(row.querySelector('.quantity-input').value) || 0;
                    const value = price * quantity;
                    const weight = totalPortfolioValue > 0 ? (value / totalPortfolioValue) * 100 : 0;
                    row.querySelector('.weight-input').value = weight.toFixed(2);
                });

                this.updateTotalWeight();
                this.updateTotalValue();
            };

            
            weightInput.addEventListener('input', (e) => {
                
                const weight = parseFloat(e.target.value) || 0;
                const price = parseFloat(priceInput.value) || 0;
                const totalValue = parseFloat(document.getElementById('totalValue').textContent.replace(/[^0-9.-]+/g, '')) || 0;
                const targetValue = (weight / 100) * totalValue;
                const newQuantity = price > 0 ? targetValue / price : 0;
                quantityInput.value = newQuantity.toFixed(2);
                updateValueAndWeight();
            });

            priceInput.addEventListener('input', updateValueAndWeight);
            quantityInput.addEventListener('input', updateValueAndWeight);

            const deleteBtn = row.querySelector('.btn-danger');
            deleteBtn.addEventListener('click', () => {
                row.remove();
                this.updateTotalWeight();
                this.updateTotalValue();
            });

            tbody.appendChild(row);
        });

        
        const tfoot = document.querySelector('#simulationTable tfoot tr');
        tfoot.innerHTML = `
            <td colspan="3">Toplam</td>
            <td id="totalWeight">0%</td>
            <td></td>
            <td></td>
            <td id="totalValue">${this.formatCurrency(totalValue)}</td>
            <td></td>
        `;

        this.updateTotalWeight();
    }

    static formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    static updateTotalValue() {
        const values = Array.from(document.querySelectorAll('.asset-value'))
            .map(cell => {
                const value = cell.textContent.replace(/[^0-9.-]+/g, '');
                return parseFloat(value) || 0;
            });
        
        const total = values.reduce((sum, value) => sum + value, 0);
        const totalValueCell = document.getElementById('totalValue');
        if (totalValueCell) {
            totalValueCell.textContent = this.formatCurrency(total);
        }
    }

    static async loadPortfolios() {
        try {
            const response = await fetch('/api/portfolios');
            const portfolios = await response.json();
            
            const tbody = document.getElementById('portfolioList');
            tbody.innerHTML = portfolios.map(portfolio => `
                <tr>
                    <td>${portfolio.name}</td>
                    <td>${this.formatCurrency(portfolio.totalValue)}</td>
                    <td class="${portfolio.dailyChange >= 0 ? 'text-success' : 'text-danger'}">
                        ${portfolio.dailyChange.toFixed(2)}%
                    </td>
                    <td>${portfolio.riskLevel}</td>
                    <td>
                        <a href="analiz.html?id=${portfolio.id}" class="btn btn-sm btn-primary">Detaylar</a>
                    </td>
                </tr>
            `).join('');

        } catch (error) {
            console.error('Portföy listesi yüklenirken hata:', error);
        }
    }
}

window.UIManager = UIManager; 