// query fonksiyonunu import et


// Eğer import çalışmazsa, require kullan
// const { query } = require('../db/connection');

// Modal değişkenlerini en üstte tanımla
const modal = document.getElementById('recommendationModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const simulateAssetBtn = document.getElementById('simulateAssetBtn');

class PortfolioOptimizer {
    constructor(portfolioData) {
        // Veri kontrolü
        if (!portfolioData || !portfolioData.portfolio_details) {
            throw new Error('Geçersiz portföy verisi');
        }

        // Market verisi kontrolü
        if (!portfolioData.market || !portfolioData.market.prices) {
            throw new Error('Piyasa verisi eksik');
        }

        this.marketData = portfolioData.market;
        this.riskFreeRate = 0.0475; // %4.75 FED faizi

        // Varlık verilerini düzenle ve fiyat verisi kontrolü yap
        this.assets = portfolioData.portfolio_details.map(asset => {
            if (!asset.prices || asset.prices.length === 0) {
                console.warn(`${asset.asset_symbol} için fiyat verisi eksik`);
                return null;
            }

            return {
                symbol: asset.asset_symbol,
                weight: asset.weight / 100,
                returns: this.calculateReturns(asset.prices),
                prices: asset.prices,
                sector: asset.sector
            };
        }).filter(asset => asset !== null); // Geçersiz varlıkları filtrele

        if (this.assets.length === 0) {
            throw new Error('Geçerli varlık verisi bulunamadı');
        }

        // Kovaryans matrisini ve beklenen getirileri hesapla
        this.covariance = this.calculateCovarianceMatrix();
        this.expectedReturns = this.calculateExpectedReturns();
    }

    // Toplam portföy değerini hesapla
    calculateTotalValue() {
        return this.assets.reduce((total, asset) => {
            const currentPrice = asset.prices[asset.prices.length - 1];
            return total + (currentPrice * asset.weight * 100); // weight'i yüzde olarak çevir
        }, 0);
    }

    // Günlük getiriyi hesapla
    calculateDailyReturn() {
        return this.assets.reduce((total, asset) => {
            const prices = asset.prices;
            if (prices.length < 2) return total;
            
            const lastPrice = prices[prices.length - 1];
            const prevPrice = prices[prices.length - 2];
            const dailyReturn = (lastPrice - prevPrice) / prevPrice;
            
            return total + (dailyReturn * asset.weight);
        }, 0);
    }

    // Sektör yoğunlaşmasını hesapla
    calculateSectorConcentration() {
        // Sektör bazında ağırlıkları topla
        const sectorWeights = {};
        this.assets.forEach(asset => {
            if (!asset.sector) return;
            sectorWeights[asset.sector] = (sectorWeights[asset.sector] || 0) + asset.weight;
        });

        // Herfindahl-Hirschman Index hesapla
        return Object.values(sectorWeights).reduce((sum, weight) => {
            return sum + Math.pow(weight, 2);
        }, 0);
    }

    // Sharpe oranını hesapla
    calculateSharpeRatio() {
        const portfolioReturn = this.calculatePortfolioReturn(
            this.assets.map(a => a.weight),
            this.expectedReturns
        );
        const portfolioRisk = Math.sqrt(this.calculatePortfolioRisk(
            this.assets.map(a => a.weight)
        ));

        return (portfolioReturn - this.riskFreeRate) / portfolioRisk;
    }

    // Fiyatlardan getiri hesaplama yardımcı fonksiyonu
    calculateReturns(prices) {
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        return returns;
    }

    // Kovaryans matrisi hesaplama
    calculateCovarianceMatrix() {
        if (!this.assets || this.assets.length === 0) {
            throw new Error('Varlık verisi bulunamadı');
        }

        const n = this.assets.length;
        const matrix = Array(n).fill().map(() => Array(n).fill(0));

        // Debug için
        console.log('Calculating covariance matrix for:', {
            assetCount: n,
            firstAsset: this.assets[0]
        });

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                matrix[i][j] = this.calculateCovariance(
                    this.assets[i].returns,
                    this.assets[j].returns
                );
            }
        }
        return matrix;
    }

    // Beklenen getirileri hesapla
    calculateExpectedReturns() {
        return this.assets.map(asset => {
            // Basit ortalama getiri
            if (!asset.returns || asset.returns.length === 0) {
                console.warn(`${asset.symbol} için getiri verisi yok`);
                return 0;
            }
            return asset.returns.reduce((a, b) => a + b, 0) / asset.returns.length;
        });
    }

    // Markowitz Optimizasyonu
    async optimizePortfolio(targetReturn, riskTolerance) {
        // Kovaryans ve beklenen getirileri sınıf değişkenlerinden al
        const optimalWeights = this.findOptimalWeights(
            this.covariance,
            this.expectedReturns,
            targetReturn,
            riskTolerance
        );

        const efficientFrontier = this.calculateEfficientFrontier(
            this.covariance,
            this.expectedReturns
        );

        return {
            weights: optimalWeights,
            efficientFrontier: efficientFrontier,
            metrics: this.calculatePortfolioMetrics(optimalWeights)
        };
    }

    // Etkin sınır hesaplama
    calculateEfficientFrontier(covariance, expectedReturns) {
        const points = [];
        const returns = [];
        const risks = [];

        // Minimum risk noktasından maksimum getiri noktasına
        for (let i = 0; i <= 100; i++) {
            const targetReturn = (i / 100) * Math.max(...expectedReturns);
            const weights = this.findOptimalWeights(
                covariance,
                expectedReturns,
                targetReturn,
                'medium'
            );

            const risk = this.calculatePortfolioRisk(weights);
            const return_ = this.calculatePortfolioReturn(weights, expectedReturns);

            points.push({ risk, return_ });
            returns.push(return_);
            risks.push(risk);
        }

        return { points, returns, risks };
    }

    // Optimal ağırlıkları bulma
    findOptimalWeights(covariance, expectedReturns, targetReturn, riskTolerance) {
        // Quadratic Programming çözümü
        // minimize w'Σw (risk)
        // subject to:
        // w'μ = targetReturn (getiri hedefi)
        // Σw = 1 (ağırlıklar toplamı 1)
        // w ≥ 0 (short satış yok)

        // Not: Gerçek uygulamada bir QP çözücü kullanılmalı
        // Örnek basit çözüm:
        return this.simplifiedOptimization(
            covariance,
            expectedReturns,
            targetReturn,
            riskTolerance
        );
    }

    // Basitleştirilmiş optimizasyon
    simplifiedOptimization(covariance, expectedReturns, targetReturn, riskTolerance) {
        const n = expectedReturns.length;
        let weights = Array(n).fill(1/n); // Eşit ağırlıkla başla

        // Risk toleransına göre ayarla
        const riskMultiplier = {
            'low': 0.5,
            'medium': 1.0,
            'high': 1.5
        }[riskTolerance];

        // Gradient descent benzeri basit optimizasyon
        const iterations = 1000;
        const learningRate = 0.001;

        for (let i = 0; i < iterations; i++) {
            // Gradyanları hesapla
            const gradients = this.calculateGradients(
                weights,
                covariance,
                expectedReturns,
                targetReturn,
                riskMultiplier
            );

            // Ağırlıkları güncelle
            weights = weights.map((w, j) => {
                let newWeight = w - learningRate * gradients[j];
                return Math.max(0, Math.min(1, newWeight)); // [0,1] aralığında tut
            });

            // Ağırlıkları normalize et
            const sum = weights.reduce((a, b) => a + b, 0);
            weights = weights.map(w => w / sum);
        }

        return weights;
    }

    // Kovaryans hesaplama fonksiyonu
    calculateCovariance(returns1, returns2) {
        if (!returns1 || !returns2 || returns1.length === 0 || returns2.length === 0) {
            console.warn('Getiri verisi eksik');
            return 0;
        }

        // Ortalama getirileri hesapla
        const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
        const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

        // Kovaryans hesapla
        let covariance = 0;
        const n = Math.min(returns1.length, returns2.length);

        for (let i = 0; i < n; i++) {
            covariance += (returns1[i] - mean1) * (returns2[i] - mean2);
        }

        // n-1 ile böl (örneklem kovaryansı)
        return covariance / (n - 1);
    }

    // Gradyanları hesapla (sınıf içine taşındı)
    calculateGradients(weights, covariance, expectedReturns, targetReturn, riskMultiplier) {
        const n = weights.length;
        const gradients = Array(n).fill(0);

        // Risk gradyanı
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                gradients[i] += 2 * covariance[i][j] * weights[j] * riskMultiplier;
            }
        }

        // Getiri kısıtı gradyanı
        const currentReturn = weights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);
        const returnGradient = (currentReturn - targetReturn) * 2;
        
        for (let i = 0; i < n; i++) {
            gradients[i] += returnGradient * expectedReturns[i];
        }

        return gradients;
    }

    // Portföy metriklerini hesapla
    calculatePortfolioMetrics(weights) {
        // Debug için
        console.log('Calculating metrics with:', {
            weights,
            expectedReturns: this.expectedReturns,
            covariance: this.covariance
        });

        const expectedReturn = this.calculatePortfolioReturn(weights, this.expectedReturns);
        const risk = this.calculatePortfolioRisk(weights);
        const sharpeRatio = (expectedReturn - this.riskFreeRate) / risk;

        return {
            expectedReturn,
            risk,
            sharpeRatio
        };
    }

    // Portföy riskini hesapla
    calculatePortfolioRisk(weights) {
        try {
            // Veri kontrolü
            if (!weights || !this.covariance) {
                console.warn('Risk hesaplaması için gerekli veriler eksik:', {
                    hasWeights: !!weights,
                    hasCovariance: !!this.covariance
                });
                return 0;
            }

            let risk = 0;
            const n = weights.length;

            // Debug için
            console.log('Risk hesaplama parametreleri:', {
                weightsLength: weights.length,
                covarianceSize: this.covariance.length,
                weights: weights,
                covariance: this.covariance
            });

            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    if (!this.covariance[i] || !this.covariance[i][j]) {
                        console.warn(`Kovaryans matrisi eksik: [${i}][${j}]`);
                        continue;
                    }
                    risk += weights[i] * weights[j] * this.covariance[i][j];
                }
            }

            return Math.sqrt(Math.max(0, risk));  // Negatif değer olmaması için
        } catch (err) {
            console.error('Risk hesaplama hatası:', err);
            return 0;
        }
    }

    // Portföy getirisini hesapla (sınıf içine taşındı)
    calculatePortfolioReturn(weights, expectedReturns) {
        return weights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);
    }

    // CVaR (Conditional Value at Risk) hesaplama
    calculateCVaR(returns, confidence = 0.95) {
        const sortedReturns = returns.sort((a, b) => a - b);
        const cutoffIndex = Math.floor((1 - confidence) * returns.length);
        const tailReturns = sortedReturns.slice(0, cutoffIndex);
        return tailReturns.reduce((a, b) => a + b, 0) / cutoffIndex;
    }

    // Risk Parity hesaplama
    calculateRiskParity() {
        const n = this.assets.length;
        const targetRisk = 1 / n; // Eşit risk dağılımı hedefi
        
        // Her varlığın risk katkısını hesapla
        const riskContributions = this.assets.map((asset, i) => {
            let contribution = 0;
            for (let j = 0; j < n; j++) {
                contribution += this.covariance[i][j] * this.assets[j].weight;
            }
            return contribution * this.assets[i].weight;
        });

        // Risk paritesi skoru (0'a yakın olması daha iyi)
        const totalRisk = riskContributions.reduce((a, b) => a + b, 0);
        const riskParityScore = riskContributions.reduce((score, risk) => {
            return score + Math.pow(risk / totalRisk - targetRisk, 2);
        }, 0);

        return riskParityScore;
    }

    // Varlık önerileri
    async recommendAssets() {
        // Düşük korelasyonlu varlıkları bul
        const correlations = this.calculateCorrelationMatrix();
        const recommendations = [];

        // SP500 varlıklarını tara
        const availableAssets = await this.fetchAvailableAssets();
        
        for (const asset of availableAssets) {
            if (this.isGoodFit(asset, correlations)) {
                recommendations.push({
                    symbol: asset.symbol,
                    reason: 'Düşük korelasyon',
                    expectedImpact: this.simulateAddition(asset)
                });
            }
        }

        return recommendations;
    }

    // Portföy simülasyonu
    simulatePortfolio(weights) {
        return {
            expectedReturn: this.calculatePortfolioReturn(weights),
            risk: this.calculatePortfolioRisk(weights),
            cvar: this.calculatePortfolioCVaR(weights),
            sharpe: this.calculateSharpeRatio(weights),
            sectorExposure: this.calculateSectorExposure(weights)
        };
    }

    // Beta hesaplama
    calculateBeta() {
        const marketReturns = this.marketData.prices.map((price, i, arr) => {
            if (i === 0) return 0;
            return (price - arr[i-1]) / arr[i-1];
        }).slice(1);

        const portfolioReturns = this.calculatePortfolioReturns();
        
        // Kovaryans hesapla
        const covariance = this.calculateCovariance(portfolioReturns, marketReturns);
        const marketVariance = this.calculateVariance(marketReturns);
        
        return covariance / marketVariance;
    }

    // Alpha (Jensen's Alpha) hesaplama
    calculateAlpha() {
        const beta = this.calculateBeta();
        const portfolioReturn = this.calculateAnnualizedReturn();
        const marketReturn = this.calculateMarketReturn();
        
        return portfolioReturn - (this.riskFreeRate + beta * (marketReturn - this.riskFreeRate));
    }

    // Tracking Error hesaplama
    calculateTrackingError() {
        const portfolioReturns = this.calculatePortfolioReturns();
        const marketReturns = this.marketData.prices.map((price, i, arr) => {
            if (i === 0) return 0;
            return (price - arr[i-1]) / arr[i-1];
        }).slice(1);

        const differences = portfolioReturns.map((r, i) => r - marketReturns[i]);
        return Math.sqrt(this.calculateVariance(differences));
    }

    // Yardımcı fonksiyonlar
    calculateVariance(returns) {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / (returns.length - 1);
    }

    calculateAnnualizedReturn() {
        const portfolioReturns = this.calculatePortfolioReturns();
        const totalReturn = portfolioReturns.reduce((a, b) => (1 + a) * (1 + b) - 1, 0);
        const years = portfolioReturns.length / 252; // 252 trading days per year
        return Math.pow(1 + totalReturn, 1/years) - 1;
    }

    calculateMarketReturn() {
        const marketReturns = this.marketData.prices.map((price, i, arr) => {
            if (i === 0) return 0;
            return (price - arr[i-1]) / arr[i-1];
        }).slice(1);

        const totalReturn = marketReturns.reduce((a, b) => (1 + a) * (1 + b) - 1, 0);
        const years = marketReturns.length / 252;
        return Math.pow(1 + totalReturn, 1/years) - 1;
    }

    // Portföy getirilerini hesapla
    calculatePortfolioReturns() {
        const dailyReturns = [];
        const prices = this.assets.map(asset => asset.prices);
        const weights = this.assets.map(asset => asset.weight);

        for (let i = 1; i < prices[0].length; i++) {
            let dailyReturn = 0;
            for (let j = 0; j < prices.length; j++) {
                const assetReturn = (prices[j][i] - prices[j][i-1]) / prices[j][i-1];
                dailyReturn += weights[j] * assetReturn;
            }
            dailyReturns.push(dailyReturn);
        }

        return dailyReturns;
    }

    // Portföy metriklerini güncelle
    async updatePortfolioMetrics(portfolioId) {
        try {
            const weights = this.assets.map(a => a.weight);
            const metrics = {
                total_value: this.calculateTotalValue(),
                daily_return: this.calculateDailyReturn(),
                volatility: this.calculatePortfolioRisk(weights),
                sharpe_ratio: this.calculateSharpeRatio(),
                beta: this.calculateBeta(),
                alpha: this.calculateAlpha(),
                cvar: this.calculateCVaR(this.calculatePortfolioReturns()),
                sector_concentration: this.calculateSectorConcentration(),
                risk_parity_score: this.calculateRiskParity(),
                tracking_error: this.calculateTrackingError()
            };

            // Metrikleri API'ye gönder
            const response = await fetch(`/api/portfolios/${portfolioId}/metrics`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(metrics)
            });

            if (!response.ok) {
                throw new Error('Metrikler kaydedilemedi');
            }

            const result = await response.json();
            console.log('Metrikler kaydedildi:', result);

            return metrics;
        } catch (err) {
            console.error('Metrik güncelleme hatası:', err);
            throw err;
        }
    }
}

class PortfolioSimulator {
    constructor(portfolio) {
        this.portfolio = portfolio;
        this.riskFreeRate = 0.0475; // %4.75 FED faizi
    }

    // Yeni varlık ekleme simülasyonu
    async simulateNewAsset(newAsset, weight = 0.05) { // Varsayılan %5 ağırlık
        try {
            // Mevcut portföy ağırlıklarını yeniden hesapla
            const adjustedWeights = this.portfolio.assets.map(asset => ({
                ...asset,
                weight: asset.weight * (1 - weight)
            }));

            // Yeni varlığı ekle
            const simulatedPortfolio = {
                ...this.portfolio,
                assets: [
                    ...adjustedWeights,
                    { ...newAsset, weight }
                ]
            };

            // Yeni portföy metriklerini hesapla
            return {
                expectedReturn: this.calculateExpectedReturn(simulatedPortfolio),
                risk: this.calculatePortfolioRisk(simulatedPortfolio),
                sharpeRatio: this.calculateSharpeRatio(simulatedPortfolio),
                diversificationEffect: this.calculateDiversificationEffect(
                    this.portfolio,
                    simulatedPortfolio
                )
            };
        } catch (err) {
            console.error('Simülasyon hatası:', err);
            throw err;
        }
    }

    // Ağırlık değişimi simülasyonu
    simulateWeightChange(assetIndex, newWeight) {
        // Mevcut ağırlıkları koru
        const originalWeights = this.portfolio.assets.map(a => a.weight);
        
        // Yeni ağırlıkları hesapla
        const weightDiff = newWeight - originalWeights[assetIndex];
        const adjustmentFactor = (1 - weightDiff) / (1 - originalWeights[assetIndex]);
        
        const newWeights = originalWeights.map((w, i) => 
            i === assetIndex ? newWeight : w * adjustmentFactor
        );

        // Simülasyon sonuçlarını hesapla
        return {
            weights: newWeights,
            metrics: this.calculatePortfolioMetrics(newWeights),
            comparison: this.compareMetrics(
                this.calculatePortfolioMetrics(originalWeights),
                this.calculatePortfolioMetrics(newWeights)
            )
        };
    }

    // Çeşitlendirme etkisini hesapla
    calculateDiversificationEffect(oldPortfolio, newPortfolio) {
        const oldRisk = this.calculatePortfolioRisk(oldPortfolio);
        const newRisk = this.calculatePortfolioRisk(newPortfolio);
        
        return {
            riskReduction: (oldRisk - newRisk) / oldRisk,
            correlationImpact: this.calculateCorrelationImpact(oldPortfolio, newPortfolio)
        };
    }

    // Korelasyon etkisini hesapla
    calculateCorrelationImpact(oldPortfolio, newPortfolio) {
        const oldCorrelations = this.calculateAverageCorrelation(oldPortfolio);
        const newCorrelations = this.calculateAverageCorrelation(newPortfolio);
        
        return {
            before: oldCorrelations,
            after: newCorrelations,
            improvement: oldCorrelations - newCorrelations
        };
    }

    // Portföy metriklerini hesapla
    calculatePortfolioMetrics(weights) {
        const expectedReturn = this.calculateExpectedReturn(weights);
        const risk = this.calculatePortfolioRisk(weights);
        const sharpeRatio = (expectedReturn - this.riskFreeRate) / risk;

        return {
            expectedReturn,
            risk,
            sharpeRatio,
            beta: this.calculateBeta(weights),
            alpha: this.calculateAlpha(weights, expectedReturn),
            sectorConcentration: this.calculateSectorConcentration(weights)
        };
    }

    // Ortalama korelasyon hesapla
    calculateAverageCorrelation(portfolio) {
        let totalCorrelation = 0;
        let count = 0;

        for (let i = 0; i < portfolio.assets.length; i++) {
            for (let j = i + 1; j < portfolio.assets.length; j++) {
                totalCorrelation += this.calculatePairwiseCorrelation(
                    portfolio.assets[i].returns,
                    portfolio.assets[j].returns
                );
                count++;
            }
        }

        return count > 0 ? totalCorrelation / count : 0;
    }

    // İki varlık arasındaki korelasyonu hesapla
    calculatePairwiseCorrelation(returns1, returns2) {
        const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
        const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

        let numerator = 0;
        let denominator1 = 0;
        let denominator2 = 0;

        for (let i = 0; i < returns1.length; i++) {
            const diff1 = returns1[i] - mean1;
            const diff2 = returns2[i] - mean2;
            numerator += diff1 * diff2;
            denominator1 += diff1 * diff1;
            denominator2 += diff2 * diff2;
        }

        if (denominator1 === 0 || denominator2 === 0) return 0;
        return numerator / Math.sqrt(denominator1 * denominator2);
    }

    // Metrikleri karşılaştır
    compareMetrics(oldMetrics, newMetrics) {
        return {
            returnChange: newMetrics.expectedReturn - oldMetrics.expectedReturn,
            riskChange: newMetrics.risk - oldMetrics.risk,
            sharpeChange: newMetrics.sharpeRatio - oldMetrics.sharpeRatio,
            betaChange: newMetrics.beta - oldMetrics.beta,
            alphaChange: newMetrics.alpha - oldMetrics.alpha,
            sectorChange: this.compareSectorConcentration(
                oldMetrics.sectorConcentration,
                newMetrics.sectorConcentration
            )
        };
    }

    // Sektör yoğunlaşmasını karşılaştır
    compareSectorConcentration(oldConc, newConc) {
        const sectors = [...new Set([...Object.keys(oldConc), ...Object.keys(newConc)])];
        const changes = {};

        sectors.forEach(sector => {
            changes[sector] = (newConc[sector] || 0) - (oldConc[sector] || 0);
        });

        return changes;
    }

    // Momentum faktörünü hesapla
    calculateMomentum(asset, periods = [1, 3, 6, 12]) {
        const returns = {};
        const prices = asset.prices;
        
        periods.forEach(months => {
            const daysInPeriod = months * 21; // Yaklaşık aylık işlem günü
            if (prices.length >= daysInPeriod) {
                const currentPrice = prices[prices.length - 1];
                const pastPrice = prices[prices.length - daysInPeriod];
                returns[months] = (currentPrice - pastPrice) / pastPrice;
            }
        });

        // Momentum skoru hesapla (3-6-12 aylık getirilerin ağırlıklı ortalaması)
        const weights = { 1: 0.2, 3: 0.3, 6: 0.2, 12: 0.3 };
        let momentumScore = 0;
        let totalWeight = 0;

        Object.entries(returns).forEach(([period, return_]) => {
            momentumScore += return_ * weights[period];
            totalWeight += weights[period];
        });

        return totalWeight > 0 ? momentumScore / totalWeight : 0;
    }

    // Sektör rotasyonu analizi
    analyzeSectorRotation() {
        const sectorReturns = {};
        const sectorMomentum = {};

        // Sektör bazında getirileri hesapla
        this.portfolio.assets.forEach(asset => {
            if (!sectorReturns[asset.sector]) {
                sectorReturns[asset.sector] = [];
            }
            sectorReturns[asset.sector].push(this.calculateMomentum(asset));
        });

        // Sektör momentum skorlarını hesapla
        Object.entries(sectorReturns).forEach(([sector, returns]) => {
            sectorMomentum[sector] = {
                averageReturn: returns.reduce((a, b) => a + b, 0) / returns.length,
                momentum: this.calculateSectorMomentum(returns),
                trend: this.analyzeSectorTrend(sector)
            };
        });

        return {
            sectorMomentum,
            recommendations: this.generateSectorRecommendations(sectorMomentum)
        };
    }

    // Sektör momentum skoru
    calculateSectorMomentum(returns) {
        const shortTerm = returns.slice(-21).reduce((a, b) => a + b, 0) / 21;
        const mediumTerm = returns.slice(-63).reduce((a, b) => a + b, 0) / 63;
        const longTerm = returns.slice(-252).reduce((a, b) => a + b, 0) / 252;

        return {
            shortTerm,
            mediumTerm,
            longTerm,
            score: (shortTerm * 0.5 + mediumTerm * 0.3 + longTerm * 0.2)
        };
    }

    // Teknik analiz yardımcı fonksiyonları
    calculateSMA(data, period) {
        if (data.length < period) return null;
        return data.slice(-period).reduce((a, b) => a + b, 0) / period;
    }

    calculateRSI(data, period = 14) {
        if (data.length < period + 1) return null;

        let gains = 0;
        let losses = 0;

        for (let i = 1; i <= period; i++) {
            const change = data[data.length - i] - data[data.length - i - 1];
            if (change >= 0) gains += change;
            else losses -= change;
        }

        const rs = gains / losses;
        return 100 - (100 / (1 + rs));
    }

    generateTrendSignal(sma50, sma200, rsi) {
        if (!sma50 || !sma200 || !rsi) return 'BEKLE';
        
        if (sma50 > sma200 && rsi < 70) return 'AL';
        if (sma50 < sma200 && rsi > 30) return 'SAT';
        return 'BEKLE';
    }
}

// Sayfa yüklendiğinde portföyleri getir
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Sayfa yüklendi, portföyleri getiriyor...');
    await loadPortfolios();
    
    // Optimizasyon butonu olayını dinle
    const optimizeBtn = document.getElementById('optimizeBtn');
    if (optimizeBtn) {
        optimizeBtn.addEventListener('click', handleOptimization);
    }

    // Portföy seçimi değiştiğinde
    const portfolioSelect = document.getElementById('portfolioSelect');
    if (portfolioSelect) {
        portfolioSelect.addEventListener('change', async function() {
            const portfolioId = this.value;
            if (!portfolioId) {
                resetCharts();
                return;
            }

            try {
                // Loading göster
                document.querySelectorAll('.optimization-card').forEach(card => {
                    card.classList.add('loading');
                });

                // Portföy verilerini ve önerileri getir
                const [portfolioData, recommendations] = await Promise.all([
                    fetch(`/api/portfolios/${portfolioId}/analysis`).then(r => r.json()),
                    fetch(`/api/portfolios/${portfolioId}/recommendations`).then(r => r.json())
                ]);

                // Sonuçları göster
                updateSimulationCharts(portfolioData);
                displayRecommendations(recommendations);

            } catch (err) {
                console.error('Veri getirme hatası:', err);
                alert('Veriler alınırken bir hata oluştu');
            } finally {
                // Loading kaldır
                document.querySelectorAll('.optimization-card').forEach(card => {
                    card.classList.remove('loading');
                });
            }
        });
    }
});

// Portföyleri yükle
async function loadPortfolios() {
    try {
        // Debug için
        console.log('Portföyleri yüklemeye başlıyor...');

        const response = await fetch('/api/portfolios');
        if (!response.ok) {
            throw new Error('Portföy verisi alınamadı');
        }

        const portfolios = await response.json();
        console.log('Yüklenen portföyler:', portfolios);
        
        const portfolioSelect = document.getElementById('portfolioSelect');
        if (!portfolioSelect) {
            console.error('portfolioSelect elementi bulunamadı');
            return;
        }

        // Select'i temizle
        portfolioSelect.innerHTML = '<option value="">Portföy seçiniz...</option>';
        
        // Her portföyü select'e ekle
        if (Array.isArray(portfolios)) {
            portfolios.forEach(portfolio => {
                const option = document.createElement('option');
                option.value = portfolio.portfolio_id;
                option.textContent = portfolio.portfolio_name;
                portfolioSelect.appendChild(option);
            });
        } else {
            console.error('Portföy verisi dizi değil:', portfolios);
        }

    } catch (error) {
        console.error('Portföy listesi yükleme hatası:', error);
        alert('Portföyler yüklenirken bir hata oluştu');
    }
}

// Optimizasyon işlemini handle et
async function handleOptimization() {
    try {
        const portfolioId = document.getElementById('portfolioSelect').value;
        if (!portfolioId) {
            alert('AMINA KOYAYIM PORTFÖY SEÇ ÖNCE');
            return;
        }

        // Loading göster
        document.querySelectorAll('.optimization-card').forEach(card => {
            card.classList.add('loading');
        });

        // Veriyi getir
        const [portfolioResponse, marketResponse] = await Promise.all([
            fetch(`/api/portfolios/${portfolioId}/analysis`),
            fetch('/api/market/sp500')
        ]);

        const [portfolioData, marketData] = await Promise.all([
            portfolioResponse.json(),
            marketResponse.json()
        ]);

        // Debug - gelen veriyi gör
        console.log('GELEN VERİLER:', { portfolioData, marketData });

        // Veriyi PortfolioOptimizer'ın istediği formata çevir
        const formattedData = {
            portfolio_details: portfolioData.assets.map(asset => ({
                asset_symbol: asset.symbol,
                weight: asset.weight,
                prices: asset.prices,
                sector: asset.sector
            })),
            market: {
                prices: marketData.prices,
                dates: marketData.dates
            }
        };

        // Debug - formatlanmış veriyi gör
        console.log('FORMATLANMIŞ VERİ:', formattedData);

        // Optimizasyonu başlat
        const optimizer = new PortfolioOptimizer(formattedData); // BURDA PATLIYORDU AMK
        const results = await optimizer.optimizePortfolio(
            parseFloat(document.getElementById('targetReturn').value) / 100,
            document.getElementById('riskTolerance').value
        );

        // Sonuçları göster
        updateOptimizationResults(results);

    } catch (err) {
        console.error('ANASINI SİKTİĞİMİN HATASI:', err);
        alert(`Optimizasyon yarrağı yedi: ${err.message}`);
    } finally {
        // Loading kaldır
        document.querySelectorAll('.optimization-card').forEach(card => {
            card.classList.remove('loading');
        });
    }
}

// Optimizasyon sonuçlarını UI'da göster
function updateOptimizationResults(results) {
    // Debug bakalım ne geliyor
    console.log('OPTİMİZASYON SONUÇLARI:', results);

    // Grafikleri temizle
    ['efficientFrontierChart', 'allocationChart'].forEach(chartId => {
        const existingChart = Chart.getChart(chartId);
        if (existingChart) {
            console.log(`${chartId} GRAFİĞİNİ TEMİZLEDİK`);
            existingChart.destroy();
        }
    });

    // Metrikleri güncelle
    document.getElementById('expectedReturn').textContent = 
        `${(results.metrics.expectedReturn * 100).toFixed(2)}%`;
    document.getElementById('estimatedRisk').textContent = 
        `${(results.metrics.risk * 100).toFixed(2)}%`;
    document.getElementById('optimizedSharpe').textContent = 
        results.metrics.sharpeRatio.toFixed(2);

    // Grafikleri güncelle
    updateEfficientFrontierChart(results.efficientFrontier);
    updateAllocationChart(results.weights);

    // performanceChart'ı kaldırdık çünkü o yok amk
}

// Etkin sınır grafiğini güncelle
function updateEfficientFrontierChart(efficientFrontier) {
    const ctx = document.getElementById('efficientFrontierChart')?.getContext('2d');
    if (!ctx) {
        console.error('CANVAS YOK AMK');
        return;
    }

    // Veri kontrolü
    if (!efficientFrontier || !efficientFrontier.points) {
        console.error('VERİ SİKTİR OLMUŞ');
        return;
    }

    // Veriyi hazırla
    const data = efficientFrontier.points.map(point => ({
        x: point.risk * 100,
        y: point.return_ * 100
    }));

    new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Etkin Sınır',
                data: data,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                pointRadius: 3,
                showLine: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Optimal ağırlık dağılımı grafiğini güncelle
function updateAllocationChart(weights) {
    const ctx = document.getElementById('allocationChart').getContext('2d');
    
    // Mevcut grafiği temizle
    if (window.allocationChart instanceof Chart) {
        window.allocationChart.destroy();
    }

    // Varlık sembollerini ve ağırlıkları hazırla
    const labels = weights.map((_, i) => `Varlık ${i + 1}`);
    const data = weights.map(w => w * 100); // Yüzdeye çevir

    // Renk paleti
    const colors = [
        '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
        '#db2777', '#2dd4bf', '#84cc16', '#f59e0b', '#6366f1'
    ];

    // Yeni grafiği oluştur
    window.allocationChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, weights.length),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Optimal Portföy Dağılımı'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.parsed.toFixed(2)}%`;
                        }
                    }
                },
                legend: {
                    position: 'right',
                    labels: {
                        font: {
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

// Sektör analizi fonksiyonunu güncelle
async function updateSectorAnalysis(portfolioId) {
    try {
        const response = await fetch(`/api/portfolios/${portfolioId}/sector-analysis`);
        const sectorData = await response.json();
        
        // Sektör grafiğini güncelle
        updateSectorChart(sectorData);
        
        // Sektör yoğunlaşmasını hesapla (HHI)
        const concentration = sectorData.reduce((sum, sector) => {
            const weight = sector.sector_weight / 100; // Yüzdeyi ondalığa çevir
            return sum + Math.pow(weight, 2);
        }, 0);

        document.getElementById('sectorConcentration').textContent = 
            `${(concentration * 100).toFixed(2)}%`;
            
    } catch (err) {
        console.error('Sektör analizi hatası:', err);
    }
}

// Sektör grafiğini güncelle
function updateSectorChart(sectorData) {
    const ctx = document.getElementById('sectorChart').getContext('2d');
    
    if (window.sectorChart instanceof Chart) {
        window.sectorChart.destroy();
    }

    window.sectorChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: sectorData.map(d => d.Sector),
            datasets: [{
                data: sectorData.map(d => d.sector_weight),
                backgroundColor: [
                    '#2563eb', '#dc2626', '#059669', '#d97706',
                    '#7c3aed', '#db2777', '#2dd4bf', '#84cc16',
                    '#f59e0b', '#6366f1', '#14b8a6'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { font: { size: 11 } }
                }
            }
        }
    });
}

// Öneri görüntüleme fonksiyonları
async function loadRecommendations(portfolioId) {
    try {
        const response = await fetch(`/api/portfolios/${portfolioId}/recommendations`);
        if (!response.ok) {
            throw new Error('Öneriler alınamadı');
        }

        const recommendations = await response.json();
        displayRecommendations(recommendations);

    } catch (err) {
        console.error('Öneri yükleme hatası:', err);
    }
}

function displayRecommendations(recommendations) {
    const container = document.querySelector('.recommendation-container');
    if (!container) return;

    // Düşük korelasyonlu varlık önerileri
    const lowCorrSection = document.createElement('div');
    lowCorrSection.className = 'recommendation-section';
    lowCorrSection.innerHTML = `
        <h3>Düşük Korelasyonlu Varlıklar</h3>
        <div class="recommendation-grid">
            ${recommendations?.lowCorrelation?.map(asset => `
                <div class="recommendation-card">
                    <h4>${asset.symbol} - ${asset.name}</h4>
                    <div class="recommendation-details">
                        <p>Sektör: <span>${asset.sector}</span></p>
                        <p>Korelasyon: <span>${(asset.correlation * 100).toFixed(2)}%</span></p>
                        <p>Fiyat: <span>$${asset.currentPrice.toFixed(2)}</span></p>
                    </div>
                    <button onclick="showAssetDetails('${asset.symbol}')">Detaylar</button>
                </div>
            `).join('') || ''}
        </div>
    `;

    // Sektör çeşitlendirme önerileri
    const sectorSection = document.createElement('div');
    sectorSection.className = 'recommendation-section';
    sectorSection.innerHTML = `
        <h3>Sektör Çeşitlendirme Önerileri</h3>
        <div class="recommendation-grid">
            ${recommendations?.sectorDiversification?.map(asset => `
                <div class="recommendation-card">
                    <h4>${asset.symbol} - ${asset.name}</h4>
                    <div class="recommendation-details">
                        <p>Sektör: <span>${asset.sector}</span></p>
                        <p>Büyüme: <span>${(asset.revenueGrowth * 100).toFixed(2)}%</span></p>
                        <p>Fiyat: <span>$${asset.currentPrice.toFixed(2)}</span></p>
                    </div>
                    <button onclick="showAssetDetails('${asset.symbol}')">Detaylar</button>
                </div>
            `).join('') || ''}
        </div>
    `;

    // Mevcut içeriği temizle ve yeni önerileri ekle
    container.innerHTML = '';
    container.appendChild(lowCorrSection);
    container.appendChild(sectorSection);
}

// Varlık ekleme simülasyonu
async function simulateAddition(symbol) {
    try {
        const portfolioId = document.getElementById('portfolioSelect').value;
        if (!portfolioId) return;

        // Simülasyon için yeni varlığı ekle
        const currentPortfolio = await fetch(`/api/portfolios/${portfolioId}/analysis`).then(r => r.json());
        const newAsset = await fetch(`/api/assets/${symbol}`).then(r => r.json());

        // Simülasyonu yap
        const simulator = new PortfolioSimulator(currentPortfolio);
        const results = await simulator.simulateNewAsset(newAsset);

        // Sonuçları göster
        displaySimulationResults(results);

    } catch (err) {
        console.error('Simülasyon hatası:', err);
    }
}

// Simülasyon sonuçlarını görselleştir
function displaySimulationResults(results) {
    const container = document.createElement('div');
    container.className = 'simulation-results';

    // Özet kart
    const summaryCard = createSimulationCard('Simülasyon Özeti', {
        'Beklenen Getiri': `${(results.expectedReturn * 100).toFixed(2)}%`,
        'Risk': `${(results.risk * 100).toFixed(2)}%`,
        'Sharpe Oranı': results.sharpeRatio.toFixed(2),
        'Risk Azaltma': `${(results.diversificationEffect.riskReduction * 100).toFixed(2)}%`
    });

    // Korelasyon etkisi kartı
    const correlationCard = createSimulationCard('Korelasyon Etkisi', {
        'Önceki Ortalama': results.diversificationEffect.correlationImpact.before.toFixed(2),
        'Sonraki Ortalama': results.diversificationEffect.correlationImpact.after.toFixed(2),
        'İyileştirme': `${(results.diversificationEffect.correlationImpact.improvement * 100).toFixed(2)}%`
    });

    container.appendChild(summaryCard);
    container.appendChild(correlationCard);

    // Mevcut sonuç container'ı varsa değiştir, yoksa ekle
    const existingContainer = document.querySelector('.simulation-results');
    if (existingContainer) {
        existingContainer.replaceWith(container);
    } else {
        document.querySelector('.optimization-grid').appendChild(container);
    }

    // Grafikleri güncelle
    updateSimulationCharts(results);
}

// Simülasyon kartı oluştur
function createSimulationCard(title, metrics) {
    const card = document.createElement('div');
    card.className = 'simulation-card';
    
    card.innerHTML = `
        <h3>${title}</h3>
        <div class="simulation-metrics">
            ${Object.entries(metrics).map(([key, value]) => `
                <div class="metric-item">
                    <span class="metric-label">${key}:</span>
                    <span class="metric-value ${getValueClass(value)}">${value}</span>
                </div>
            `).join('')}
        </div>
    `;
    
    return card;
}

// Değer sınıfını belirle (pozitif/negatif gösterimi için)
function getValueClass(value) {
    if (typeof value === 'string') {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return '';
        return numValue > 0 ? 'positive' : numValue < 0 ? 'negative' : '';
    }
    return value > 0 ? 'positive' : value < 0 ? 'negative' : '';
}

// Simülasyon grafiklerini interaktif hale getir
function updateSimulationCharts(results) {
    // Debug log
    console.log('Simülasyon sonuçları:', results);

    // Veri kontrolü
    if (!results) {
        console.warn('Simülasyon verisi eksik');
        return;
    }

    // Canvas kontrolü
    const canvas = document.getElementById('efficientFrontierChart');
    if (!canvas) {
        console.warn('Grafik canvas bulunamadı');
        return;
    }

    // Varlık verisi kontrolü
    if (!results.assets || !Array.isArray(results.assets)) {
        console.warn('Geçersiz varlık verisi formatı');
        return;
    }

    // Varlık sembollerini kontrol et
    const symbols = results.assets.map(asset => {
        if (!asset || !asset.symbol) {
            console.warn('Eksik varlık sembolü:', asset);
            return 'BİLİNMEYEN';
        }
        return asset.symbol;
    });

    // Grafik oluştur
    new Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Mevcut Portföy',
                data: [{
                    x: results.risk || 0,
                    y: results.expectedReturn || 0
                }],
                backgroundColor: '#4CAF50'
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { title: { display: true, text: 'Risk (%)' } },
                y: { title: { display: true, text: 'Getiri (%)' } }
            }
        }
    });

    // Ağırlık grafiği için kontrol
    if (results.currentWeights && Array.isArray(results.currentWeights)) {
        const weightCtx = document.getElementById('allocationChart');
        if (weightCtx) {
            new Chart(weightCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: symbols,
                    datasets: [{
                        label: 'Ağırlıklar',
                        data: results.currentWeights,
                        backgroundColor: '#2196F3'
                    }]
                }
            });
        }
    }
}

// Korelasyon rengi belirle
function getCorrelationColor(value) {
    const colors = {
        positive: 'rgba(76, 175, 80, VALUE)',  // Yeşil
        negative: 'rgba(244, 67, 54, VALUE)',  // Kırmızı
        neutral: 'rgba(158, 158, 158, VALUE)'  // Gri
    };

    const alpha = Math.abs(value);
    if (value > 0.1) return colors.positive.replace('VALUE', alpha);
    if (value < -0.1) return colors.negative.replace('VALUE', alpha);
    return colors.neutral.replace('VALUE', 0.5);
}

// Modal işlevselliği - tek bir yerde tanımlayalım
if (modal && closeModalBtn && simulateAssetBtn) {
    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    simulateAssetBtn.addEventListener('click', async function() {
        const symbol = this.getAttribute('data-symbol');
        if (!symbol) return;

        try {
            modal.style.display = 'none';
            await simulateAddition(symbol);
        } catch (err) {
            console.error('Simülasyon hatası:', err);
            alert('Simülasyon sırasında bir hata oluştu');
        }
    });
}

// Varlık detaylarını göster
async function showAssetDetails(symbol) {
    try {
        // Varlık detaylarını getir
        const response = await fetch(`/api/assets/${symbol}`);
        const asset = await response.json();

        // Modal içeriğini güncelle
        const detailsContainer = modal.querySelector('.recommendation-details');
        detailsContainer.innerHTML = `
            <div class="asset-detail-item">
                <h4>Temel Bilgiler</h4>
                <p>Sembol: ${asset.symbol}</p>
                <p>Sektör: ${asset.sector}</p>
                <p>Fiyat: $${asset.currentPrice.toFixed(2)}</p>
                <p>Piyasa Değeri: $${(asset.marketCap / 1e9).toFixed(2)}B</p>
            </div>
            <div class="asset-detail-item">
                <h4>Performans Metrikleri</h4>
                <p>Büyüme: ${(asset.revenueGrowth * 100).toFixed(2)}%</p>
                <p>Beta: ${asset.beta?.toFixed(2) || '-'}</p>
                <p>Volatilite: ${(asset.volatility * 100).toFixed(2)}%</p>
            </div>
        `;

        // Simülasyon butonuna varlık sembolünü ekle
        simulateAssetBtn.setAttribute('data-symbol', symbol);
        
        // Modal'ı göster
        modal.style.display = 'block';

    } catch (err) {
        console.error('Varlık detayları getirme hatası:', err);
        alert('Varlık detayları alınamadı');
    }
}

// Grafikleri sıfırla
function resetCharts() {
    document.querySelector('.recommendation-container').innerHTML = '';
    document.querySelector('.simulation-results').innerHTML = '';
    document.querySelector('.correlation-heatmap').innerHTML = '<canvas id="correlationHeatmap"></canvas>';
    document.querySelector('.chart-container').innerHTML = '<canvas id="simulationChart"></canvas>';
}