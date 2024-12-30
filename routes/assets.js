const express = require('express');
const { pool, query } = require('../db/connection');
const PortfolioService = require('../services/PortfolioService');
const MarketDataService = require('../services/MarketDataService');
const AnalysisService = require('../services/AnalysisService');
const OptimizationService = require('../services/OptimizationService');

const router = express.Router();


const portfolioService = new PortfolioService(pool);
const marketDataService = new MarketDataService(pool);
const analysisService = new AnalysisService(pool);
const optimizationService = new OptimizationService(pool);


router.get('/portfolios/:id/analysis', async (req, res) => {
    try {
        
        const portfolio = await portfolioService.getPortfolioDetails(req.params.id);
        
        
        const symbols = portfolio.assets.map(asset => asset.asset_symbol);
        const prices = await marketDataService.getBulkAssetPrices(symbols);
        
        
        const marketData = await marketDataService.getSP500Data();

        
        const metrics = await analysisService.calculateRiskMetrics(req.params.id);
        const returns = await analysisService.calculateReturn(req.params.id);
        const volatility = await analysisService.calculateVolatility(req.params.id);

        
        const portfolio_details = portfolio.assets.map(asset => ({
            asset_symbol: asset.asset_symbol,
            weight: asset.weight / 100,
            prices: prices[asset.asset_symbol] || [],
            sector: asset.sector
        }));

        
        res.json({
            
            metrics,
            expectedReturn: returns.expectedReturn || 0,
            totalReturn: returns.totalReturn || 0,
            volatility: volatility.volatility || 0,
            sharpeRatio: (returns.expectedReturn - 0.02) / (volatility.volatility || 1),
            treynorRatio: (returns.expectedReturn - 0.02) / (metrics.beta || 1),

            
            portfolio_details,
            market_data: {
                prices: marketData.prices
            }
        });

    } catch (err) {
        console.error('Analiz hatası:', err);
        res.status(500).json({ error: err.message });
    }
});


router.get('/portfolios/:id/performance', async (req, res) => {
    try {
        const performance = await analysisService.getPerformanceComparison(req.params.id);
        res.json(performance);
    } catch (error) {
        console.error('Performans karşılaştırma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});


router.get('/portfolios/:id', async (req, res) => {
    try {
        const portfolio = await portfolioService.getPortfolioDetails(req.params.id);
        const summary = await portfolioService.getPortfolioSummary(req.params.id);
        
        res.json({
            portfolio,
            summary
        });
    } catch (err) {
        console.error('Portföy detayları hatası:', err);
        res.status(500).json({ error: err.message });
    }
});


router.get('/portfolios', async (req, res) => {
    try {
        const portfolios = await portfolioService.getAllPortfolios();
        res.json(portfolios);
    } catch (err) {
        console.error('Portföy listesi hatası:', err);
        res.status(500).json({ error: err.message });
    }
});


router.put('/portfolios/:id', async (req, res) => {
    try {
        const updatedPortfolio = await portfolioService.updatePortfolio(
            req.params.id,
            req.body
        );
        res.json(updatedPortfolio);
    } catch (err) {
        console.error('Portföy güncelleme hatası:', err);
        res.status(500).json({ error: err.message });
    }
});


router.delete('/portfolios/:id', async (req, res) => {
    try {
        await portfolioService.deletePortfolio(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Portföy silme hatası:', err);
        res.status(500).json({ error: err.message });
    }
});


router.get('/search', async (req, res) => {
    try {
        const searchTerm = req.query.q.toLowerCase();
        console.log('Aranan terim:', searchTerm);
        
        // SP500 
        const [stocks] = await pool.query(`
            SELECT 
                Symbol, 
                Shortname, 
                Sector,
                Industry,
                Currentprice 
            FROM sp500_companies 
            WHERE LOWER(Symbol) LIKE ? 
                OR LOWER(Shortname) LIKE ?
                OR LOWER(Sector) LIKE ?
            LIMIT 10
        `, [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]);

        // Emtialar
        const [commodities] = await pool.query(`
            SELECT *
            FROM commodity_futures cf1
            WHERE Date = (
                SELECT MAX(Date)
                FROM commodity_futures cf2
            )
            AND (
                EXISTS (
                    SELECT 1
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = 'commodity_futures'
                    AND COLUMN_NAME != 'Date'
                    AND LOWER(COLUMN_NAME) LIKE ?
                )
            )
        `, [`%${searchTerm}%`]);

        // Emtiaları düzenle
        let commodityList = [];
        if (commodities.length > 0) {
            const commodityData = commodities[0];
            Object.entries(commodityData).forEach(([key, value]) => {
                if (key !== 'Date' && value !== null && value > 0) {
                    if (key.toLowerCase().includes(searchTerm)) {
                        commodityList.push({
                            name: key,
                            price: parseFloat(value)
                        });
                    }
                }
            });
        }

        res.json({
            stocks: stocks.map(stock => ({
                symbol: stock.Symbol,
                name: stock.Shortname,
                sector: stock.Sector,
                industry: stock.Industry,
                price: parseFloat(stock.Currentprice)
            })),
            commodities: commodityList
        });

    } catch (error) {
        console.error('Arama hatası:', error);
        res.status(500).json({ 
            error: 'Arama hatası',
            details: error.message 
        });
    }
});

// Portföy ekleme
router.post('/portfolios', async (req, res) => {
    try {
        const portfolioData = req.body;
        console.log('Gelen portföy verisi:', portfolioData);

        // Portföy oluştur
        const newPortfolio = await portfolioService.createPortfolio(portfolioData);
        
        res.json({
            success: true,
            portfolio_id: newPortfolio.portfolio_id
        });
    } catch (err) {
        console.error('Portföy oluşturma hatası:', err);
        res.status(500).json({ 
            error: 'Portföy oluşturulamadı',
            details: err.message 
        });
    }
});

// Korelasyon matrisi 
router.get('/portfolios/:id/correlation', async (req, res) => {
    try {
        const correlationMatrix = await analysisService.getCorrelationMatrix(req.params.id);
        res.json(correlationMatrix);
    } catch (error) {
        console.error('Korelasyon matrisi hatası:', error);
        res.status(500).json({ error: error.message });
    }
});


router.get('/portfolios/:id/optimization', async (req, res) => {
    try {
        const optimizationData = await optimizationService.getOptimizationData(req.params.id);
        res.json(optimizationData);
    } catch (error) {
        console.error('Optimizasyon verisi alma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});


router.get('/portfolios/:id/recommendations', async (req, res) => {
    try {
        const recommendations = await optimizationService.getRecommendations(req.params.id);
        res.json(recommendations);
    } catch (error) {
        console.error('Öneriler alma hatası:', error);
        res.status(500).json({ error: error.message });
    }
});


router.post('/simulation', async (req, res) => {
    try {
        const portfolio = req.body.portfolio;
        
        if (!portfolio || !Array.isArray(portfolio)) {
            throw new Error('Geçersiz portföy verisi');
        }

        
        const portfolioData = await Promise.all(portfolio.map(async asset => {
            let prices = [];
            
            // Sembol temizleme
            const cleanSymbol = asset.asset_symbol.split('(')[0].trim();
            
            try {
                if (asset.asset_type === 'STOCK') {
                    // Hisse senedi fiyatları
                    const [stockData] = await pool.query(`
                        SELECT \`${cleanSymbol}\` as price, Date as date 
                        FROM sp500veri
                        WHERE \`${cleanSymbol}\` IS NOT NULL 
                        ORDER BY Date ASC
                    `);
                    prices = stockData.map(row => row.price);
                } else {
                    // Emtia fiyatları - özel durumları kontrol et
                    let commodityColumn = cleanSymbol;
                    if (cleanSymbol === 'GOLD') commodityColumn = 'GOLD';
                    if (cleanSymbol === 'SILVER') commodityColumn = 'SILVER';
                    // Diğer özel durumlar...

                    const [commodityData] = await pool.query(`
                        SELECT \`${commodityColumn}\` as price, Date as date 
                        FROM commodity_futures
                        WHERE \`${commodityColumn}\` IS NOT NULL 
                        ORDER BY Date ASC
                    `);
                    prices = commodityData.map(row => row.price);
                }
            } catch (error) {
                console.warn(`${cleanSymbol} için fiyat verisi alınamadı:`, error);
                prices = [];
            }

            // Fiyat verisi yoksa varsayılan değerler kullan
            if (prices.length === 0) {
                console.warn(`${cleanSymbol} için fiyat verisi bulunamadı, varsayılan değerler kullanılıyor`);
                prices = [100]; // Varsayılan değer
            }

            return {
                ...asset,
                symbol: cleanSymbol,
                weight: asset.weight / 100,
                prices: prices
            };
        }));

        // Market verilerini al
        const [marketData] = await pool.query(`
            SELECT \`S&P500\` as price, Date as date
            FROM sp500_index
            WHERE Date >= DATE_SUB(CURDATE(), INTERVAL 3 YEAR)
            ORDER BY Date ASC
        `);

        // Simülasyon sonuçlarını hesapla
        const results = {
            expectedReturn: calculatePortfolioReturn(portfolioData),
            estimatedRisk: calculatePortfolioRisk(portfolioData),
            correlationMatrix: {
                assets: portfolioData.map(p => p.symbol),
                matrix: calculateCorrelationMatrix(portfolioData)
            },
            performance: {
                portfolio: calculatePerformance(portfolioData),
                market: marketData.map(d => d.price),
                dates: marketData.map(d => d.date)
            }
        };

        // Debug log ekleyelim
        console.log('Simulation results being sent:', results);

        res.json(results);

    } catch (error) {
        console.error('Simülasyon hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Simülasyon optimizasyonu endpoint'i
router.post('/simulation/optimize', async (req, res) => {
    try {
        const results = await optimizationService.optimizeSimulatedPortfolio(
            req.body.portfolio,
            req.body.riskTolerance
        );
        res.json(results);
    } catch (error) {
        console.error('Optimizasyon hatası:', error);
        res.status(500).json({ error: error.message });
    }
});

// Yardımcı fonksiyonlar
function calculatePortfolioReturn(portfolio) {
    if (!portfolio || portfolio.length === 0) return 0;

    let totalReturn = 0;
    let totalWeight = 0;

    portfolio.forEach(asset => {
        const prices = asset.prices;
        if (!prices || prices.length < 2) return; // Bu varlığı atla

        // Son 30 günlük getiri (veya mevcut tüm veri)
        const lookbackPeriod = Math.min(30, prices.length - 1);
        const lastPrice = prices[prices.length - 1];
        const startPrice = prices[prices.length - 1 - lookbackPeriod];

        if (!lastPrice || !startPrice || startPrice === 0) return; // Geçersiz fiyatları atla

        const return_ = (lastPrice - startPrice) / startPrice;
        totalReturn += return_ * asset.weight;
        totalWeight += asset.weight;
    });

    // Ağırlıkları normalize et
    if (totalWeight > 0) {
        totalReturn = totalReturn * (1 / totalWeight);
    }

    // Yıllık getiriye çevir (252 trading günü)
    const annualizedReturn = Math.pow(1 + totalReturn, 252 / 30) - 1;

    console.log('Portfolio return calculation:', {
        totalReturn,
        totalWeight,
        annualizedReturn
    });

    return annualizedReturn;
}

function calculatePortfolioRisk(portfolio) {
    if (!portfolio || portfolio.length === 0) return 0;

    // Günlük getiriler
    const dailyReturns = portfolio.map(asset => {
        const prices = asset.prices;
        if (!prices || prices.length < 2) return [];

        return prices.slice(1).map((price, i) => {
            const prevPrice = prices[i];
            // Sıfır kontrolü ekleyelim
            if (!prevPrice || prevPrice === 0) return 0;
            return (price - prevPrice) / prevPrice;
        }).filter(return_ => isFinite(return_)); // Infinity değerleri filtrele
    });

    // En kısa getiri dizisinin uzunluğunu al
    const minLength = Math.min(...dailyReturns.map(returns => returns.length));
    if (minLength === 0) return 0;

    // Portföy günlük getirileri
    const portfolioDailyReturns = Array(minLength).fill(0).map((_, day) => {
        return portfolio.reduce((sum, asset, i) => {
            if (!dailyReturns[i][day]) return sum;
            return sum + (dailyReturns[i][day] * asset.weight);
        }, 0);
    });

    // Outlier'ları filtrele
    const validReturns = portfolioDailyReturns.filter(r => 
        isFinite(r) && Math.abs(r) < 1); // %100'den büyük günlük değişimleri filtrele

    if (validReturns.length < 2) return 0;

    const mean = validReturns.reduce((a, b) => a + b, 0) / validReturns.length;
    const variance = validReturns.reduce((sum, ret) => 
        sum + Math.pow(ret - mean, 2), 0) / (validReturns.length - 1);
    
    return Math.sqrt(variance) * Math.sqrt(252); // Yıllık volatilite
}

function calculateSectorConcentration(portfolio) {
    if (!portfolio || portfolio.length === 0) return 0;

    // Sektör ağırlıklarını topla
    const sectorWeights = {};
    portfolio.forEach(asset => {
        if (asset.sector) {
            sectorWeights[asset.sector] = (sectorWeights[asset.sector] || 0) + asset.weight;
        }
    });

    // Herfindahl Index hesapla
    return Object.values(sectorWeights).reduce((sum, weight) => 
        sum + Math.pow(weight, 2), 0);
}

function calculateCorrelationMatrix(portfolio) {
    if (!portfolio || portfolio.length === 0) return [];

    const n = portfolio.length;
    const matrix = Array(n).fill().map(() => Array(n).fill(0));

    // Her varlık çifti için korelasyon hesapla
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const returns1 = calculateReturns(portfolio[i].prices);
            const returns2 = calculateReturns(portfolio[j].prices);
            matrix[i][j] = calculateCorrelation(returns1, returns2);
        }
    }

    return matrix;
}

function calculatePerformance(portfolio) {
    if (!portfolio || portfolio.length === 0) return [];

    // Son 30 günlük performans hesapla
    const maxDays = Math.min(30, ...portfolio.map(asset => asset.prices.length));
    const performance = [100]; // Baz 100 ile başla
    
    for (let day = 1; day < maxDays; day++) {
        const dailyReturn = portfolio.reduce((sum, asset) => {
            const todayPrice = asset.prices[asset.prices.length - maxDays + day] || 0;
            const yesterdayPrice = asset.prices[asset.prices.length - maxDays + day - 1] || 0;
            
            // Sıfır kontrolü ekle
            if (!yesterdayPrice) return sum;
            
            const dailyReturn = (todayPrice - yesterdayPrice) / yesterdayPrice;
            return sum + (dailyReturn * asset.weight);
        }, 0);

        // Infinity kontrolü ekle
        const todayValue = performance[day - 1] * (1 + (isFinite(dailyReturn) ? dailyReturn : 0));
        performance.push(isFinite(todayValue) ? todayValue : performance[day - 1]);
    }

    return performance;
}

function calculateReturns(prices) {
    if (!prices || prices.length < 2) return [];
    return prices.slice(1).map((price, i) => 
        (price - prices[i]) / prices[i]);
}

function calculateCorrelation(returns1, returns2) {
    if (returns1.length !== returns2.length || returns1.length < 2) return 0;

    const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;

    for (let i = 0; i < returns1.length; i++) {
        const diff1 = returns1[i] - mean1;
        const diff2 = returns2[i] - mean2;
        numerator += diff1 * diff2;
        denom1 += diff1 * diff1;
        denom2 += diff2 * diff2;
    }

    return numerator / Math.sqrt(denom1 * denom2);
}

module.exports = router;
