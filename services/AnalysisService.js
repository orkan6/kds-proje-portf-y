const {
    calculateCovariance,
    calculateVariance,
    calculateCorrelation,
    calculateDailyReturns,
    calculatePortfolioVolatility,
    calculateExpectedReturn,
    calculateMaxDrawdown,
    calculateTrackingError
} = require('../utils/calculations');

const { getPeriodDays } = require('../utils/dateUtils');
const MarketDataService = require('./MarketDataService');

class AnalysisService {
    constructor(pool) {
        this.pool = pool;
        this.marketDataService = new MarketDataService(pool);
    }

    // Portföy getirisi hesaplama (6M-1Y)
    async calculateReturn(portfolioId, period = '1Y') {
        try {
            const portfolio = await this.getPortfolioWithPrices(portfolioId);
            const returns = await this.calculatePeriodReturns(portfolio, period);
            
            return {
                expectedReturn: returns.expectedReturn,
                totalReturn: returns.totalReturn,
                periodReturns: returns.periodReturns
            };
        } catch (error) {
            console.error('Getiri hesaplama hatası:', error);
            throw new Error('Getiri hesaplanamadı');
        }
    }

    // Volatilite hesaplama
    async calculateVolatility(portfolioId, period = '1Y') {
        try {
            const portfolio = await this.getPortfolioWithPrices(portfolioId);
            const returns = await this.calculatePeriodReturns(portfolio, period);
            
            return {
                volatility: this.calculateStandardDeviation(returns.periodReturns),
                annualizedVolatility: this.annualizeVolatility(returns.periodReturns)
            };
        } catch (error) {
            console.error('Volatilite hesaplama hatası:', error);
            throw new Error('Volatilite hesaplanamadı');
        }
    }

    // Risk metrikleri hesaplama - Orta vade odaklı güncelleme
    async calculateRiskMetrics(portfolioId) {
        try {
            // Portföy detaylarını al
            const portfolio = await this.getPortfolioWithPrices(portfolioId);
            if (!portfolio || !Array.isArray(portfolio) || portfolio.length === 0) {
                throw new Error('Portföy verisi bulunamadı');
            }

            // Piyasa verilerini al
            const marketData = await this.marketDataService.getSP500Data();
            if (!marketData || !marketData.prices || marketData.prices.length === 0) {
                throw new Error('Piyasa verisi bulunamadı');
            }

            // Her varlık için getiri hesapla - 1 yıllık veri kullan
            const returns = await this.calculatePeriodReturns(portfolio, '1Y');
            if (!returns || !returns.periodReturns || returns.periodReturns.length === 0) {
                throw new Error('Getiri verisi hesaplanamadı');
            }

            // Beta hesapla
            const beta = this.calculateBeta(returns.periodReturns, marketData.prices);
            const riskFreeRate = 0.02; // 2% risk-free rate

            // Orta vadeli metrikler (6M-1Y)
            return {
                beta: beta || 0,
                volatility: this.calculateStandardDeviation(returns.periodReturns),
                sharpeRatio: this.calculateSharpeRatio(returns.expectedReturn, riskFreeRate, returns.periodReturns),
                treynorRatio: this.calculateTreynorRatio(returns.expectedReturn, beta, riskFreeRate),
                expectedReturn: returns.expectedReturn || 0,
                totalReturn: returns.totalReturn || 0
            };

        } catch (error) {
            console.error('Risk metrikleri hesaplama hatası:', error);
            return {
                beta: 0,
                volatility: 0,
                sharpeRatio: 0,
                treynorRatio: 0,
                expectedReturn: 0,
                totalReturn: 0
            };
        }
    }

    // Yardımcı fonksiyonlar
    calculateStandardDeviation(returns, useLogReturns = true) {
        try {
            if (!returns || returns.length < 2) return 0;

            // Logaritmik getiriler
            const processedReturns = useLogReturns ? 
                returns.map(r => Math.log(1 + r)) : returns;

            const mean = processedReturns.reduce((a, b) => a + b, 0) / processedReturns.length;
            const squaredDiffs = processedReturns.map(r => Math.pow(r - mean, 2));
            
            // Serbestlik derecesi düzeltmesi (n-1)
            return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (processedReturns.length - 1));
        } catch (error) {
            console.error('Standart sapma hesaplama hatası:', error);
            return 0;
        }
    }

    annualizeVolatility(returns) {
        const dailyVol = this.calculateStandardDeviation(returns);
        return dailyVol * Math.sqrt(252); // 252 trading days
    }

    calculateBeta(portfolioReturns, marketReturns) {
        try {
            const covariance = this.calculateCovariance(portfolioReturns, marketReturns);
            const marketVariance = this.calculateVariance(marketReturns);
            return marketVariance !== 0 ? covariance / marketVariance : 0;
        } catch (error) {
            console.error('Beta hesaplama hatası:', error);
            return 0;
        }
    }

    calculateAlpha(portfolioReturn, beta, marketReturns) {
        try {
            const riskFreeRate = 0.02; // %2 risk-free rate
            const marketReturn = (marketReturns[marketReturns.length - 1] - marketReturns[0]) / marketReturns[0];
            return portfolioReturn - (riskFreeRate + beta * (marketReturn - riskFreeRate));
        } catch (error) {
            console.error('Alpha hesaplama hatası:', error);
            return 0;
        }
    }

    calculateCovariance(array1, array2) {
        if (!array1 || !array2 || array1.length === 0 || array2.length === 0) return 0;
        const mean1 = array1.reduce((a, b) => a + b, 0) / array1.length;
        const mean2 = array2.reduce((a, b) => a + b, 0) / array2.length;
        const products = array1.map((x, i) => (x - mean1) * (array2[i] - mean2));
        return products.reduce((a, b) => a + b, 0) / array1.length;
    }

    calculateVariance(array) {
        if (!array || array.length === 0) return 0;
        const mean = array.reduce((a, b) => a + b, 0) / array.length;
        const squaredDiffs = array.map(x => Math.pow(x - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / array.length;
    }

    // EWMA Volatilite hesaplama
    calculateEWMAVolatility(returns, lambda = 0.94) {
        try {
            if (!returns || returns.length < 2) return 0;
            
            let variance = returns[0] * returns[0];
            for (let i = 1; i < returns.length; i++) {
                variance = lambda * variance + (1 - lambda) * returns[i] * returns[i];
            }
            
            return Math.sqrt(variance);
        } catch (error) {
            console.error('EWMA volatilite hesaplama hatası:', error);
            return 0;
        }
    }

    // Rolling Beta hesaplama
    calculateRollingBeta(portfolioReturns, marketReturns, window = 60) {
        try {
            const betas = [];
            for (let i = window; i <= portfolioReturns.length; i++) {
                const windowPortfolioReturns = portfolioReturns.slice(i - window, i);
                const windowMarketReturns = marketReturns.slice(i - window, i);
                
                const covariance = this.calculateCovariance(windowPortfolioReturns, windowMarketReturns);
                const marketVariance = this.calculateVariance(windowMarketReturns);
                
                const beta = marketVariance !== 0 ? covariance / marketVariance : 0;
                betas.push(beta);
            }
            
            // Adjusted Beta = (2/3) * Beta + (1/3)
            const avgBeta = betas.reduce((a, b) => a + b, 0) / betas.length;
            const adjustedBeta = (2/3) * avgBeta + (1/3);
            
            return {
                currentBeta: betas[betas.length - 1] || 0,
                adjustedBeta,
                rollingBetas: betas
            };
        } catch (error) {
            console.error('Rolling beta hesaplama hatası:', error);
            return {
                currentBeta: 0,
                adjustedBeta: 0,
                rollingBetas: []
            };
        }
    }

    // Gelişmiş Alpha hesaplama
    calculateAdvancedAlpha(portfolioReturn, beta, marketReturn, period = '1Y') {
        try {
            // Dinamik risk-free rate (örnek)
            const riskFreeRates = {
                '1M': 0.015,  // %1.5
                '3M': 0.018,  // %1.8
                '6M': 0.020,  // %2.0
                '1Y': 0.025   // %2.5
            };
            
            const riskFreeRate = riskFreeRates[period] || 0.02;
            
            // Jensen's Alpha
            const jensenAlpha = portfolioReturn - (riskFreeRate + beta * (marketReturn - riskFreeRate));
            
            // Treynor Ratio
            const treynorRatio = beta !== 0 ? (portfolioReturn - riskFreeRate) / beta : 0;
            
            // Information Ratio
            const trackingError = this.calculateTrackingError(portfolioReturn, marketReturn);
            const informationRatio = trackingError !== 0 ? (portfolioReturn - marketReturn) / trackingError : 0;
            
            return {
                jensenAlpha,
                treynorRatio,
                informationRatio
            };
        } catch (error) {
            console.error('Gelişmiş alpha hesaplama hatası:', error);
            return {
                jensenAlpha: 0,
                treynorRatio: 0,
                informationRatio: 0
            };
        }
    }

    // Tracking Error hesaplama
    calculateTrackingError(portfolioReturns, benchmarkReturns) {
        try {
            if (!portfolioReturns || !benchmarkReturns || portfolioReturns.length !== benchmarkReturns.length) {
                return 0;
            }

            const differences = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
            const meanDiff = differences.reduce((a, b) => a + b, 0) / differences.length;
            const squaredDiffs = differences.map(d => Math.pow(d - meanDiff, 2));
            
            return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (differences.length - 1));
        } catch (error) {
            console.error('Tracking error hesaplama hatası:', error);
            return 0;
        }
    }

    // getPortfolioWithPrices fonksiyonunu ekle
    async getPortfolioWithPrices(portfolioId) {
        try {
            // Debug için log ekleyelim
            console.log('Portfolio ID:', portfolioId);

            const [rows] = await this.pool.query(`
                SELECT 
                    pd.asset_type,
                    pd.asset_symbol,
                    pd.quantity,
                    pd.weight,
                    pd.purchase_price
                FROM portfolio_details pd
                WHERE pd.portfolio_id = ?
            `, [portfolioId]);

            // Debug için log ekleyelim
            console.log('Portfolio details:', rows);

            return rows;
        } catch (error) {
            console.error('Portföy fiyat verisi alma hatası:', error);
            return [];
        }
    }

    // Dönem getirilerini hesapla
    async calculatePeriodReturns(portfolio, period = '3Y') {
        try {
            if (!Array.isArray(portfolio)) {
                console.error('Portfolio is not an array:', portfolio);
                return {
                    expectedReturn: 0,
                    totalReturn: 0,
                    periodReturns: []
                };
            }

            // Fiyatları al
            const prices = await this.marketDataService.getBulkAssetPrices(portfolio);
            console.log('Alınan portföy:', portfolio);
            console.log('Alınan fiyatlar:', prices);

            if (!prices || Object.keys(prices).length === 0) {
                console.error('Fiyat verisi alınamadı');
                return {
                    expectedReturn: 0,
                    totalReturn: 0,
                    periodReturns: []
                };
            }

            let periodReturns = [];
            let totalReturn = 0;
            let expectedReturn = 0;

            portfolio.forEach(asset => {
                const price = prices[asset.asset_symbol];
                if (price) {
                    const assetReturn = (price - asset.purchase_price) / asset.purchase_price;
                    const weightedReturn = assetReturn * (asset.weight / 100);
                    
                    totalReturn += weightedReturn;
                    expectedReturn += weightedReturn;
                    periodReturns.push(weightedReturn);
                }
            });

            return {
                expectedReturn: expectedReturn,
                totalReturn: totalReturn,
                periodReturns: periodReturns.length > 0 ? periodReturns : [0]
            };
        } catch (error) {
            console.error('Dönem getirileri hesaplama hatası:', error);
            return {
                expectedReturn: 0,
                totalReturn: 0,
                periodReturns: [0]
            };
        }
    }

    // Piyasa getirilerini hesapla
    calculateMarketReturns(marketData, period = '3Y') {
        try {
            const periodDays = getPeriodDays(period);
            const prices = marketData.prices.slice(-periodDays);
            
            if (prices.length < 2) {
                throw new Error('Yetersiz piyasa verisi');
            }

            // Günlük getirileri hesapla
            const returns = [];
            for (let i = 1; i < prices.length; i++) {
                const dailyReturn = (prices[i] - prices[i-1]) / prices[i-1];
                returns.push(dailyReturn);
            }

            return returns;
        } catch (error) {
            console.error('Piyasa getirileri hesaplama hatası:', error);
            return [];
        }
    }

    // Performans karşılaştırması için yeni fonksiyon
    async getPerformanceComparison(portfolioId) {
        try {
            // Portföy detaylarını al
            const portfolio = await this.getPortfolioWithPrices(portfolioId);
            if (!portfolio || portfolio.length === 0) {
                throw new Error('Portföy verisi bulunamadı');
            }

            // S&P 500 verilerini al (1 yıllık)
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 1);
            const endDate = new Date('2024-06-07'); // Son veri tarihi
            
            // Her varlık için fiyat geçmişini al
            const historicalPrices = {};
            for (const asset of portfolio) {
                const prices = await this.marketDataService.getAssetPrices(asset.asset_symbol, startDate);
                // Sadece endDate'e kadar olan verileri al
                historicalPrices[asset.asset_symbol] = prices.filter(p => 
                    new Date(p.date) <= endDate
                );
            }

            // S&P 500 verilerini al ve filtrele
            const marketData = await this.marketDataService.getSP500Data(startDate);
            const filteredMarketData = {
                dates: marketData.dates.filter(d => new Date(d) <= endDate),
                prices: marketData.prices.slice(0, marketData.dates.filter(d => new Date(d) <= endDate).length)
            };

            // Her tarih için portföy değerini hesapla
            const portfolioValues = filteredMarketData.dates.map(date => {
                let totalValue = 0;
                portfolio.forEach(asset => {
                    const priceData = historicalPrices[asset.asset_symbol]?.find(p => 
                        new Date(p.date).toDateString() === new Date(date).toDateString()
                    );
                    if (priceData) {
                        totalValue += asset.quantity * priceData.price;
                    }
                });
                return totalValue;
            });

            // İlk değere göre normalize et
            const normalizedPortfolio = portfolioValues.map(value => 
                (value / portfolioValues[0]) * 100
            );

            return {
                dates: filteredMarketData.dates,
                portfolio: normalizedPortfolio,
                market: this.normalizePerformance(filteredMarketData.prices)
            };

        } catch (error) {
            console.error('Performans karşılaştırma hatası:', error);
            throw new Error('Performans karşılaştırması yapılamadı');
        }
    }

    // Portföy performansını hesapla
    async calculatePortfolioPerformance(portfolio) {
        try {
            // Başlangıç değerini hesapla
            const initialValue = portfolio.reduce((total, asset) => 
                total + (asset.quantity * asset.purchase_price), 0);

            // Son 1 yıllık fiyat verilerini al
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 1);

            const historicalPrices = {};
            for (const asset of portfolio) {
                const prices = await this.marketDataService.getAssetPrices(asset.asset_symbol, startDate);
                historicalPrices[asset.asset_symbol] = prices;
            }

            // Her tarih için portföy değerini hesapla
            const dailyValues = [];
            const dates = Object.values(historicalPrices)[0].map(p => p.date);

            for (const date of dates) {
                let portfolioValue = 0;
                for (const asset of portfolio) {
                    const priceData = historicalPrices[asset.asset_symbol].find(p => p.date === date);
                    if (priceData) {
                        portfolioValue += asset.quantity * priceData.price;
                    }
                }
                // Baz 100'e normalize et
                dailyValues.push((portfolioValue / initialValue) * 100);
            }

            console.log('Portföy Performans Detayları:', {
                initialValue,
                dailyValues: dailyValues.slice(0, 5), // İlk 5 günü göster
                dates: dates.slice(0, 5),
                historicalPrices: Object.keys(historicalPrices).reduce((acc, key) => {
                    acc[key] = historicalPrices[key].slice(0, 5);
                    return acc;
                }, {})
            });

            return dailyValues;

        } catch (error) {
            console.error('Portföy performans hesaplama hatası:', error);
            return Array(252).fill(100); // 1 yıllık sabit değer
        }
    }

    // Performans verilerini normalize et (baz 100)
    normalizePerformance(prices) {
        if (!prices || prices.length === 0) return [];
        
        const initialValue = prices[0];
        return prices.map(price => (price / initialValue) * 100);
    }

    // Sharpe Ratio hesaplama
    calculateSharpeRatio(portfolioReturn, riskFreeRate, returns) {
        try {
            const volatility = this.calculateStandardDeviation(returns);
            if (volatility === 0) return 0;
            
            return (portfolioReturn - riskFreeRate) / volatility;
        } catch (error) {
            console.error('Sharpe Ratio hesaplama hatası:', error);
            return 0;
        }
    }

    // Treynor Ratio hesaplama
    calculateTreynorRatio(portfolioReturn, beta, riskFreeRate) {
        try {
            if (beta === 0) return 0;
            return (portfolioReturn - riskFreeRate) / beta;
        } catch (error) {
            console.error('Treynor Ratio hesaplama hatası:', error);
            return 0;
        }
    }

    // Korelasyon matrisi hesaplama
    async getCorrelationMatrix(portfolioId) {
        try {
            // Portföy detaylarını al
            const portfolio = await this.getPortfolioWithPrices(portfolioId);
            if (!portfolio || portfolio.length === 0) {
                throw new Error('Portföy verisi bulunamadı');
            }

            // Her varlık için fiyat geçmişini al
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 1);
            const endDate = new Date('2024-06-07');

            const assetPrices = {};
            for (const asset of portfolio) {
                const prices = await this.marketDataService.getAssetPrices(asset.asset_symbol, startDate);
                assetPrices[asset.asset_symbol] = prices
                    .filter(p => new Date(p.date) <= endDate)
                    .map(p => p.price);
            }

            // Korelasyon matrisini hesapla
            const symbols = Object.keys(assetPrices);
            const correlationMatrix = [];

            for (let i = 0; i < symbols.length; i++) {
                correlationMatrix[i] = [];
                for (let j = 0; j < symbols.length; j++) {
                    const correlation = this.calculateCorrelation(
                        assetPrices[symbols[i]],
                        assetPrices[symbols[j]]
                    );
                    correlationMatrix[i][j] = parseFloat(correlation.toFixed(2));
                }
            }

            return {
                symbols: symbols,
                matrix: correlationMatrix
            };

        } catch (error) {
            console.error('Korelasyon matrisi hesaplama hatası:', error);
            throw new Error('Korelasyon matrisi hesaplanamadı');
        }
    }

    // İki varlık arasındaki korelasyonu hesapla
    calculateCorrelation(array1, array2) {
        if (array1.length !== array2.length) {
            const minLength = Math.min(array1.length, array2.length);
            array1 = array1.slice(0, minLength);
            array2 = array2.slice(0, minLength);
        }

        const mean1 = array1.reduce((a, b) => a + b, 0) / array1.length;
        const mean2 = array2.reduce((a, b) => a + b, 0) / array2.length;

        const variance1 = array1.reduce((a, b) => a + Math.pow(b - mean1, 2), 0);
        const variance2 = array2.reduce((a, b) => a + Math.pow(b - mean2, 2), 0);

        const covariance = array1.reduce((a, b, i) => 
            a + ((b - mean1) * (array2[i] - mean2)), 0);

        return covariance / Math.sqrt(variance1 * variance2);
    }

    async getPortfolioAnalysis(portfolioId) {
        try {
            // Portföy detaylarını al
            const [portfolioDetails] = await this.pool.query(`
                SELECT 
                    p.asset_symbol,
                    p.weight,
                    p.quantity,
                    p.purchase_price,
                    a.sector
                FROM portfolio_assets p
                LEFT JOIN sp500_companies a ON p.asset_symbol = a.Symbol
                WHERE p.portfolio_id = ?
            `, [portfolioId]);

            // Her varlık için fiyat geçmişini al
            for (let asset of portfolioDetails) {
                const [priceHistory] = await this.pool.query(`
                    SELECT Date, \`${asset.asset_symbol}\` as price
                    FROM sp500veri
                    WHERE Date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
                    AND \`${asset.asset_symbol}\` IS NOT NULL
                    ORDER BY Date ASC
                `);
                
                asset.prices = priceHistory.map(row => row.price);
            }

            // S&P 500 verilerini al
            const [marketData] = await this.pool.query(`
                SELECT Date, \`S&P500\` as price
                FROM sp500_index
                WHERE Date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
                ORDER BY Date ASC
            `);

            return {
                portfolio_details: portfolioDetails,
                market_data: {
                    prices: marketData.map(row => row.price)
                }
            };

        } catch (error) {
            console.error('Portföy analizi hatası:', error);
            throw new Error('Portföy analizi yapılamadı');
        }
    }
}

module.exports = AnalysisService; 