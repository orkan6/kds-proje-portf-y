class OptimizationApp {
    constructor() {
        this.initializeEventListeners();
        this.optimizer = null;
        UIManager.initializeSimulation();
    }

    initializeEventListeners() {
        document.addEventListener('DOMContentLoaded', () => this.onDOMLoad());
        
        const optimizeBtn = document.getElementById('optimizeBtn');
        if (optimizeBtn) {
            optimizeBtn.addEventListener('click', () => this.handleOptimization());
        }

        const portfolioSelect = document.getElementById('portfolioSelect');
        if (portfolioSelect) {
            portfolioSelect.addEventListener('change', (e) => 
                this.handlePortfolioChange(e.target.value)
            );
        }

        this.initializeModalListeners();

        // Risk toleransı slider'ı için event listener
        const riskToleranceInput = document.getElementById('riskTolerance');
        const riskToleranceValue = document.getElementById('riskToleranceValue');
        
        if (riskToleranceInput && riskToleranceValue) {
            riskToleranceInput.addEventListener('input', (e) => {
                riskToleranceValue.textContent = `${e.target.value}%`;
            });
        }
    }

    async onDOMLoad() {
        console.log('Sayfa yüklendi, portföyleri getiriyor...');
        await this.loadPortfolios();
    }

    async loadPortfolios() {
        try {
            UIManager.showLoading();
            const portfolios = await this.fetchPortfolios();
            
            if (portfolios && portfolios.length > 0) {
                this.populatePortfolioSelect(portfolios);
                console.log('Yüklenen portföyler:', portfolios);
                
                const firstPortfolio = portfolios[0];
                const select = document.getElementById('portfolioSelect');
                if (select) {
                    select.value = firstPortfolio.portfolio_id;
                    await this.handlePortfolioChange(firstPortfolio.portfolio_id);
                }
            } else {
                UIManager.showError('Kayıtlı portföy bulunamadı');
            }
        } catch (err) {
            console.error('Portföy listesi yükleme hatası:', err);
            UIManager.showError('Portföyler yüklenirken bir hata oluştu');
        } finally {
            UIManager.hideLoading();
        }
    }

    initializeModalListeners() {
        const modal = document.getElementById('recommendationModal');
        const closeBtn = document.getElementById('closeModalBtn');
        const simulateBtn = document.getElementById('simulateAssetBtn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (modal) modal.style.display = 'none';
            });
        }

        if (simulateBtn) {
            simulateBtn.addEventListener('click', async () => {
                const symbol = simulateBtn.getAttribute('data-symbol');
                if (symbol) {
                    await this.handleAssetSimulation(symbol);
                }
            });
        }
    }

    async fetchPortfolios() {
        const response = await fetch('/api/portfolios');
        if (!response.ok) {
            throw new Error('Portföy verisi alınamadı');
        }
        return await response.json();
    }

    populatePortfolioSelect(portfolios) {
        const select = document.getElementById('portfolioSelect');
        if (!select) return;

        select.innerHTML = '<option value="">Portföy seçiniz...</option>';
        
        portfolios.forEach(portfolio => {
            const option = document.createElement('option');
            option.value = portfolio.portfolio_id;
            option.textContent = portfolio.portfolio_name;
            select.appendChild(option);
        });
    }

    async handlePortfolioChange(portfolioId) {
        try {
            UIManager.showLoading();

            const portfolioData = await this.fetchPortfolioData(portfolioId);
            console.log('API\'den gelen portföy verisi:', portfolioData);

            // Simülasyon tablosunu doldur
            UIManager.initializeSimulationTable(portfolioData.portfolio_details);

            // Veriyi direkt kullan - artık dönüştürmeye gerek yok
            this.optimizer = new PortfolioOptimizer(portfolioData);
            const initialMetrics = this.optimizer.calculateInitialMetrics();

            // Recommendations opsiyonel
            let recommendations = [];
            try {
                recommendations = await this.fetchRecommendations(portfolioId);
            } catch (err) {
                console.warn('Öneriler yüklenemedi:', err);
            }

            await UIManager.updatePortfolioView({
                portfolio: portfolioData,
                metrics: initialMetrics,
                recommendations
            });

        } catch (err) {
            console.error('Portföy değişikliği hatası:', err);
            UIManager.showError('Portföy verileri alınırken hata oluştu');
        } finally {
            UIManager.hideLoading();
        }
    }

    async handleOptimization() {
        try {
            if (!this.optimizer) {
                throw new Error('Lütfen önce bir portföy seçin');
            }

            UIManager.showLoading();

            const targetReturn = this.getTargetReturn();
            const riskTolerance = this.getRiskTolerance();

            const results = await this.optimizer.optimizePortfolio(
                targetReturn,
                riskTolerance
            );

            await UIManager.updatePortfolioView(results);

        } catch (err) {
            console.error('Optimizasyon hatası:', err);
            UIManager.showError(err.message);
        } finally {
            UIManager.hideLoading();
        }
    }

    async handleAssetSimulation(symbol) {
        try {
            UIManager.showLoading();

            const assetData = await this.fetchAssetData(symbol);
            const simulationResults = await this.optimizer.simulateNewAsset(assetData);

            await UIManager.updateSimulationResults(simulationResults);

        } catch (err) {
            console.error('Simülasyon hatası:', err);
            UIManager.showError('Simülasyon sırasında bir hata oluştu');
        } finally {
            UIManager.hideLoading();
        }
    }

    async fetchPortfolioData(portfolioId) {
        const response = await fetch(`/api/portfolios/${portfolioId}/optimization`);
        if (!response.ok) {
            throw new Error('Portföy verisi alınamadı');
        }
        return await response.json();
    }

    async fetchRecommendations(portfolioId) {
        try {
            const response = await fetch(`/api/portfolios/${portfolioId}/recommendations`);
            if (!response.ok) {
                return []; // Hata yerine boş array dönüyoruz
            }
            return await response.json();
        } catch (err) {
            console.warn('Öneriler alınamadı:', err);
            return []; // Hata durumunda boş array dön
        }
    }

    async fetchAssetData(symbol) {
        const response = await fetch(`/api/assets/${symbol}`);
        if (!response.ok) {
            throw new Error('Varlık verisi alınamadı');
        }
        return await response.json();
    }

    getTargetReturn() {
        const input = document.getElementById('targetReturn');
        return input ? parseFloat(input.value) / 100 : 0;
    }

    getRiskTolerance() {
        const input = document.getElementById('riskTolerance');
        if (!input) return 50; // Varsayılan değer

        // 0-100 aralığındaki değeri 0-1 aralığına dönüştür
        return parseFloat(input.value) / 100;
    }

    resetCharts() {
        ChartManager.resetAllCharts();
        UIManager.resetMetrics();
    }

    // Simülasyon işleyicileri
    async handleRunSimulation() {
        try {
            UIManager.showLoading();
            
            const portfolio = UIManager.getSimulationPortfolio();
            if (portfolio.length === 0) {
                UIManager.showError('Lütfen en az bir varlık ekleyin');
                return;
            }

            const response = await fetch('/simulation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portfolio })
            });

            if (!response.ok) throw new Error('Simülasyon hatası');
            const results = await response.json();

            UIManager.updateSimulationResults(results);
            UIManager.updateSimulationCharts(results);

        } catch (error) {
            console.error('Simülasyon hatası:', error);
            UIManager.showError('Simülasyon sırasında bir hata oluştu');
        } finally {
            UIManager.hideLoading();
        }
    }

    async handleOptimizeSimulation() {
        try {
            UIManager.showLoading();
            
            const portfolio = UIManager.getSimulationPortfolio();
            const riskTolerance = document.getElementById('simulationRiskTolerance').value / 100;

            const response = await fetch('/simulation/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    portfolio,
                    riskTolerance 
                })
            });

            if (!response.ok) throw new Error('Optimizasyon hatası');
            const results = await response.json();

            UIManager.updateSimulationResults(results);
            UIManager.updateSimulationCharts(results);
            UIManager.updateSimulationWeights(results.optimizedWeights);

        } catch (error) {
            console.error('Optimizasyon hatası:', error);
            UIManager.showError('Optimizasyon sırasında bir hata oluştu');
        } finally {
            UIManager.hideLoading();
        }
    }
}

// Global scope'a ekle
window.OptimizationApp = OptimizationApp;
window.app = new OptimizationApp();