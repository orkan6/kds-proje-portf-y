class PortfolioOptimizer {
    constructor(portfolioData) {
        this.calculator = window.PortfolioCalculator;
        this.riskMetrics = window.RiskMetrics;
        
        this.validateData(portfolioData);
        this.initializeData(portfolioData);
    }

    validateData(data) {
        if (!data) {
            throw new Error('Portföy verisi eksik');
        }

        // Portfolio details veya assets varsa onları kontrol et
        if (data.portfolio_details || data.assets) {
            const portfolioData = data.portfolio_details || data.assets;
            if (!Array.isArray(portfolioData)) {
                throw new Error('Geçersiz portföy verisi formatı');
            }
            this.portfolioData = portfolioData;
        }
        // Metrics varsa onu kullan
        else if (data.metrics) {
            this.metrics = data.metrics;
            this.portfolioData = data.metrics.portfolio_details || [];
        }
        // Hiçbiri yoksa hata ver
        else {
            throw new Error('Geçersiz portföy verisi formatı');
        }
    }

    initializeData(data) {
        this.marketData = data.market || { prices: [] };
        this.riskFreeRate = 0.0475;
        
        this.assets = this.processAssets(this.portfolioData);
        
        if (this.assets.length > 0) {
            this.covariance = this.calculateCovarianceMatrix();
            this.expectedReturns = this.calculateExpectedReturns();
        } else {
            console.warn('İşlenebilir varlık bulunamadı');
            this.covariance = [];
            this.expectedReturns = [];
        }
    }

    processAssets(assets) {
        return assets
            .map(asset => {
                const prices = asset.prices || asset.historical_prices || [];
                const symbol = asset.asset_symbol || asset.symbol;
                const weight = (asset.weight || 0) / 100;

                if (!prices.length) {
                    console.warn(`${symbol} için fiyat verisi eksik`);
                    return null;
                }

                return {
                    symbol: symbol,
                    weight: weight,
                    returns: this.calculator.calculateReturns(prices),
                    prices: prices,
                    sector: asset.sector
                };
            })
            .filter(asset => asset !== null);
    }

    calculateCovarianceMatrix() {
        if (!this.assets || this.assets.length === 0) {
            return [];
        }

        const n = this.assets.length;
        const matrix = Array(n).fill().map(() => Array(n).fill(0));

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                matrix[i][j] = this.calculator.calculateCovariance(
                    this.assets[i].returns,
                    this.assets[j].returns
                );
            }
        }

        return matrix;
    }

    calculateExpectedReturns() {
        return this.assets.map(asset => {
            if (!asset.returns || asset.returns.length === 0) {
                console.warn(`${asset.symbol} için getiri verisi yok`);
                return 0;
            }

            // Günlük getirilerden yıllık beklenen getiriyi hesapla
            const avgDailyReturn = asset.returns.reduce((a, b) => a + b, 0) / asset.returns.length;
            const annualizedReturn = Math.pow(1 + avgDailyReturn, 252) - 1;

            console.log(`${asset.symbol} yıllık beklenen getiri:`, annualizedReturn);
            return annualizedReturn;
        });
    }

    async optimizePortfolio(targetReturn, riskTolerance) {
        try {
            const weights = this.findOptimalWeights(
                this.covariance,
                this.expectedReturns,
                targetReturn,
                riskTolerance
            );

            return {
                portfolio_details: this.generatePortfolioDetails(weights),
                metrics: this.calculateMetrics(weights),
                efficientFrontier: this.calculateEfficientFrontier()
            };
        } catch (err) {
            console.error('Optimizasyon hatası:', err);
            throw err;
        }
    }

    calculateInitialMetrics() {
        if (!this.assets || this.assets.length === 0) {
            return this.getDefaultMetrics();
        }

        try {
            const currentWeights = this.assets.map(a => a.weight);
            
            // Portföy getirisi hesapla
            const portfolioReturn = this.calculator.calculatePortfolioReturn(
                currentWeights, 
                this.expectedReturns
            );
            
            console.log('Portföy ağırlıkları:', currentWeights);
            console.log('Beklenen getiriler:', this.expectedReturns);
            console.log('Hesaplanan portföy getirisi:', portfolioReturn);
            
            const portfolioRisk = this.calculator.calculatePortfolioRisk(
                currentWeights, 
                this.covariance
            );

            // Portföy getirilerini hesapla
            const portfolioReturns = this.assets.reduce((acc, asset) => {
                if (asset.returns && asset.returns.length > 0) {
                    acc.push(...asset.returns);
                }
                return acc;
            }, []);

            // Market getirilerini hesapla
            const marketReturns = this.marketData.prices ? 
                this.calculator.calculateReturns(this.marketData.prices) : 
                [];

            return {
                expectedReturn: portfolioReturn,
                estimatedRisk: portfolioRisk,
                optimizedSharpe: this.riskMetrics.calculateSharpeRatio(
                    portfolioReturn, 
                    portfolioRisk, 
                    this.riskFreeRate
                ),
                cvarValue: this.riskMetrics.calculateCVaR(portfolioReturns),
                betaValue: this.riskMetrics.calculateBeta(portfolioReturns, marketReturns),
                sectorConcentration: this.calculateSectorConcentration()
            };
        } catch (err) {
            console.error('Metrik hesaplama hatası:', err);
            return this.getDefaultMetrics();
        }
    }

    calculateSectorConcentration() {
        const sectorWeights = {};
        this.assets.forEach(asset => {
            if (asset.sector) {
                sectorWeights[asset.sector] = (sectorWeights[asset.sector] || 0) + asset.weight;
            }
        });

        return Math.max(...Object.values(sectorWeights), 0);
    }

    findOptimalWeights(covariance, expectedReturns, targetReturn, riskTolerance) {
        if (!covariance || !expectedReturns || covariance.length === 0) {
            console.warn('Optimizasyon için yeterli veri yok');
            return this.assets.map(a => a.weight);
        }

        try {
            const n = this.assets.length;
            let bestWeights = this.assets.map(a => a.weight);
            let bestScore = Infinity;
            
            const iterations = 10000;
            const constraints = {
                minWeight: 0.05,
                maxWeight: 0.40
            };

            for (let i = 0; i < iterations; i++) {
                let weights = this.generateRandomWeights(n, constraints);
                
                const portfolioReturn = this.calculator.calculatePortfolioReturn(
                    weights, 
                    expectedReturns
                );
                const portfolioRisk = this.calculator.calculatePortfolioRisk(
                    weights, 
                    covariance
                );
                
                const score = Math.abs(portfolioReturn - targetReturn) + 
                             (portfolioRisk * (1 - riskTolerance)) +
                             this.calculateDiversificationPenalty(weights);

                if (score < bestScore) {
                    bestScore = score;
                    bestWeights = weights;
                }
            }

            return bestWeights;

        } catch (err) {
            console.error('Optimizasyon hesaplama hatası:', err);
            return this.assets.map(a => a.weight);
        }
    }

    generateRandomWeights(n, constraints) {
        const { minWeight, maxWeight } = constraints;
        let weights = new Array(n).fill(0);
        let remainingWeight = 1;
        
        // Her varlık için minimum ağırlığı ayır
        weights = weights.map(() => minWeight);
        remainingWeight -= minWeight * n;
        
        // Kalan ağırlığı rastgele dağıt
        for (let i = 0; i < n - 1; i++) {
            const maxAllocation = Math.min(maxWeight - weights[i], remainingWeight);
            const allocation = Math.random() * maxAllocation;
            weights[i] += allocation;
            remainingWeight -= allocation;
        }
        
        // Son varlığa kalan ağırlığı ver
        weights[n - 1] += remainingWeight;
        
        return weights;
    }

    calculateDiversificationPenalty(weights) {
        // Herfindahl-Hirschman Index kullanarak çeşitlendirme cezası hesapla
        return weights.reduce((sum, w) => sum + Math.pow(w, 2), 0);
    }

    calculateCurrentReturn() {
        return this.assets.reduce((sum, asset, i) => 
            sum + (asset.weight * this.expectedReturns[i]), 0);
    }

    generatePortfolioDetails(weights) {
        return this.assets.map((asset, i) => ({
            asset_symbol: asset.symbol,
            weight: weights[i],
            sector: asset.sector,
            current_price: asset.prices[asset.prices.length - 1],
            expected_return: this.expectedReturns[i]
        }));
    }

    calculateMetrics(weights) {
        const portfolioReturn = this.calculator.calculatePortfolioReturn(
            weights, 
            this.expectedReturns
        );
        const portfolioRisk = this.calculator.calculatePortfolioRisk(
            weights, 
            this.covariance
        );

        return {
            expectedReturn: portfolioReturn,
            estimatedRisk: portfolioRisk,
            optimizedSharpe: this.riskMetrics.calculateSharpeRatio(
                portfolioReturn,
                portfolioRisk,
                this.riskFreeRate
            ),
            cvarValue: this.riskMetrics.calculateCVaR(
                this.calculatePortfolioReturns(weights)
            ),
            betaValue: this.riskMetrics.calculateBeta(
                this.calculatePortfolioReturns(weights),
                this.marketData.prices ? 
                    this.calculator.calculateReturns(this.marketData.prices) : []
            ),
            sectorConcentration: this.calculateSectorConcentration(),
            performance: this.calculatePortfolioPerformance(weights)
        };
    }

    calculateEfficientFrontier() {
        const points = [];
        const returnRange = {
            min: Math.min(...this.expectedReturns),
            max: Math.max(...this.expectedReturns)
        };

        for (let i = 0; i <= 20; i++) {
            const targetReturn = returnRange.min + 
                (i / 20) * (returnRange.max - returnRange.min);
            
            const weights = this.findOptimalWeights(
                this.covariance,
                this.expectedReturns,
                targetReturn,
                3
            );

            const risk = this.calculator.calculatePortfolioRisk(
                weights, 
                this.covariance
            );
            
            points.push({
                return_: targetReturn,
                risk: risk,
                weights: weights
            });
        }

        return {
            points,
            current: {
                return_: this.calculateCurrentReturn(),
                risk: this.calculator.calculatePortfolioRisk(
                    this.assets.map(a => a.weight),
                    this.covariance
                )
            }
        };
    }

    calculatePortfolioReturns(weights) {
        // Her tarih için portföy değerini hesapla
        const returns = [];
        const dates = this.assets[0].prices.map((_, i) => i); // Tüm tarihler

        for (let t = 1; t < dates.length; t++) {
            let previousValue = 0;
            let currentValue = 0;

            // Her varlık için o tarihteki değeri hesapla
            for (let i = 0; i < this.assets.length; i++) {
                const asset = this.assets[i];
                const previousPrice = asset.prices[t - 1];
                const currentPrice = asset.prices[t];
                
                previousValue += weights[i] * previousPrice;
                currentValue += weights[i] * currentPrice;
            }

            // Günlük getiriyi hesapla
            const dailyReturn = (currentValue - previousValue) / previousValue;
            returns.push(dailyReturn);
        }

        return returns;
    }

    calculatePortfolioPerformance(weights) {
        // Her tarih için portföy değerini hesapla
        const values = [];
        const dates = this.assets[0].prices.map((_, i) => i);

        // İlk değeri hesapla
        let initialValue = 0;
        for (let i = 0; i < this.assets.length; i++) {
            initialValue += weights[i] * this.assets[i].prices[0];
        }
        values.push(100); // Baz 100 ile başla

        // Her tarih için değeri hesapla
        for (let t = 1; t < dates.length; t++) {
            let currentValue = 0;
            for (let i = 0; i < this.assets.length; i++) {
                const asset = this.assets[i];
                currentValue += weights[i] * asset.prices[t];
            }
            // Baz 100'e göre normalize et
            values.push((currentValue / initialValue) * 100);
        }

        return values;
    }

    getDefaultMetrics() {
        return {
            expectedReturn: 0,
            estimatedRisk: 0,
            optimizedSharpe: 0,
            cvarValue: 0,
            betaValue: 1,
            sectorConcentration: 0,
            performance: [100], // Baz 100 ile başlayan tek noktalı performans
            marketPerformance: [100] // Market için de aynı
        };
    }
}

window.PortfolioOptimizer = PortfolioOptimizer; 