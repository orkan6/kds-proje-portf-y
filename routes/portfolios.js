const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');


router.get('/', async (req, res) => {
    try {
        const portfolios = await query(`
            SELECT 
                p.portfolio_id,
                p.portfolio_name,
                p.initial_value,
                p.creation_date,
                COUNT(pd.asset_symbol) as asset_count,
                SUM(pd.weight) as total_weight
            FROM portfolios p
            LEFT JOIN portfolio_details pd ON p.portfolio_id = pd.portfolio_id
            GROUP BY p.portfolio_id
            ORDER BY p.creation_date DESC
        `);
        
        res.json(portfolios);
    } catch (err) {
        console.error('Portföy listesi getirme hatası:', err);
        res.status(500).json({ error: 'Portföyler getirilemedi' });
    }
});


router.post('/', async (req, res) => {
    try {
        const { portfolio_name, description, initial_value, assets } = req.body;

        // 1. Portföy başlığını kaydet
        const result = await query(`
            INSERT INTO portfolios 
            (portfolio_name, description, initial_value, creation_date) 
            VALUES (?, ?, ?, CURDATE())
        `, [portfolio_name, description, initial_value]);

        const portfolioId = result.insertId;

        
        for (const asset of assets) {
            await query(`
                INSERT INTO portfolio_details 
                (portfolio_id, asset_type, asset_symbol, weight, quantity, purchase_price, purchase_date)
                VALUES (?, ?, ?, ?, ?, ?, CURDATE())
            `, [
                portfolioId,
                asset.type,
                asset.symbol,
                asset.weight,
                asset.quantity,
                asset.price
            ]);
        }

        
        await query(`
            INSERT INTO portfolio_history 
            (portfolio_id, date, portfolio_value, daily_return, total_return)
            VALUES (?, CURDATE(), ?, 0, 0)
        `, [portfolioId, initial_value]);

        res.status(201).json({
            success: true,
            message: 'Portföy başarıyla oluşturuldu',
            portfolio_id: portfolioId
        });

    } catch (err) {
        console.error('Portföy oluşturma hatası:', err);
        res.status(500).json({ 
            error: 'Portföy oluşturulamadı',
            details: err.message 
        });
    }
});


router.delete('/:id', async (req, res) => {
    try {
        const portfolioId = req.params.id;

        
        await query('DELETE FROM portfolio_details WHERE portfolio_id = ?', [portfolioId]);
        
        
        await query('DELETE FROM portfolio_history WHERE portfolio_id = ?', [portfolioId]);
        
        
        await query('DELETE FROM portfolios WHERE portfolio_id = ?', [portfolioId]);

        res.json({ success: true, message: 'Portföy başarıyla silindi' });
    } catch (err) {
        console.error('Portföy silme hatası:', err);
        res.status(500).json({ error: 'Portföy silinemedi' });
    }
});


router.get('/:id', async (req, res) => {
    try {
        const portfolioId = req.params.id;
        
        
        const [portfolio] = await query(`
            SELECT * FROM portfolios 
            WHERE portfolio_id = ?
        `, [portfolioId]);

        if (!portfolio) {
            return res.status(404).json({ error: 'Portföy bulunamadı' });
        }

        
        const assets = await query(`
            SELECT 
                pd.asset_type,
                pd.asset_symbol,
                pd.weight,
                pd.quantity,
                pd.purchase_price
            FROM portfolio_details pd
            WHERE pd.portfolio_id = ?
        `, [portfolioId]);

        portfolio.assets = assets;

        // Örnek tarihsel veri
        portfolio.historicalData = {
            dates: ['2023-01-01', '2023-01-02', '2023-01-03'],
            prices: [100, 102, 101],
            marketPrices: [1000, 1010, 1005]
        };

        res.json(portfolio);
    } catch (err) {
        console.error('Portföy detayı getirme hatası:', err);
        res.status(500).json({ error: 'Portföy detayları getirilemedi' });
    }
});

// güncelleme
router.put('/:id', async (req, res) => {
    try {
        const portfolioId = req.params.id;
        const { portfolio_name, description, initial_value, assets } = req.body;

        
        await query(`
            UPDATE portfolios 
            SET portfolio_name = ?, 
                description = ?, 
                initial_value = ?
            WHERE portfolio_id = ?
        `, [portfolio_name, description, initial_value, portfolioId]);

        
        await query('DELETE FROM portfolio_details WHERE portfolio_id = ?', [portfolioId]);

        
        for (const asset of assets) {
            await query(`
                INSERT INTO portfolio_details 
                (portfolio_id, asset_type, asset_symbol, weight, quantity, purchase_price, purchase_date)
                VALUES (?, ?, ?, ?, ?, ?, CURDATE())
            `, [
                portfolioId,
                asset.type,
                asset.symbol,
                asset.weight,
                asset.quantity,
                asset.price
            ]);
        }

        res.json({
            success: true,
            message: 'Portföy başarıyla güncellendi'
        });

    } catch (err) {
        console.error('Portföy güncelleme hatası:', err);
        res.status(500).json({ 
            error: 'Portföy güncellenemedi',
            details: err.message 
        });
    }
});


router.get('/:id/analysis', async (req, res) => {
    try {
        const portfolioId = req.params.id;
        
        
        const [portfolio] = await query(`
            SELECT 
                p.*,
                GROUP_CONCAT(pd.asset_symbol) as assets,
                GROUP_CONCAT(pd.weight) as weights,
                GROUP_CONCAT(pd.purchase_price) as prices,
                GROUP_CONCAT(pd.quantity) as quantities
            FROM portfolios p
            LEFT JOIN portfolio_details pd ON p.portfolio_id = pd.portfolio_id
            WHERE p.portfolio_id = ?
            GROUP BY p.portfolio_id
        `, [portfolioId]);

        if (!portfolio) {
            return res.status(404).json({ error: 'Portföy bulunamadı' });
        }

        
        const assets = await query(`
            SELECT 
                pd.asset_symbol,
                pd.asset_type,
                pd.weight,
                pd.quantity,
                pd.purchase_price,
                pd.purchase_date,
                h.price_history,
                h.date
            FROM portfolio_details pd
            LEFT JOIN historical_prices h ON pd.asset_symbol = h.asset_symbol
            WHERE pd.portfolio_id = ?
            ORDER BY pd.asset_symbol, h.date
        `, [portfolioId]);

        
        const assetData = {};
        assets.forEach(asset => {
            if (!assetData[asset.asset_symbol]) {
                assetData[asset.asset_symbol] = {
                    symbol: asset.asset_symbol,
                    type: asset.asset_type,
                    weight: asset.weight,
                    quantity: asset.quantity,
                    purchasePrice: asset.purchase_price,
                    purchaseDate: asset.purchase_date,
                    priceHistory: []
                };
            }
            if (asset.price_history) {
                assetData[asset.asset_symbol].priceHistory.push({
                    date: asset.date,
                    price: asset.price_history
                });
            }
        });

        
        const analysisResults = {
            portfolio: portfolio,
            assets: Object.values(assetData),
            metrics: {
                totalValue: calculateTotalValue(assetData),
                performance: calculatePerformance(assetData),
                riskMetrics: calculateRiskMetrics(assetData)
            }
        };

        res.json(analysisResults);

    } catch (err) {
        console.error('Portföy analizi hatası:', err);
        res.status(500).json({ error: 'Portföy analizi yapılamadı' });
    }
});


function calculateTotalValue(assetData) {
    let total = 0;
    Object.values(assetData).forEach(asset => {
        const currentPrice = asset.priceHistory[asset.priceHistory.length - 1]?.price || asset.purchasePrice;
        total += currentPrice * asset.quantity;
    });
    return total;
}

function calculatePerformance(assetData) {
    let totalReturn = 0;
    let weightedVolatility = 0;

    Object.values(assetData).forEach(asset => {
        const prices = asset.priceHistory.map(h => h.price);
        const returns = calculateReturns(prices);
        const volatility = calculateVolatility(returns);
        
        totalReturn += (asset.weight / 100) * calculateTotalReturn(prices);
        weightedVolatility += (asset.weight / 100) * volatility;
    });

    return {
        totalReturn: totalReturn,
        volatility: weightedVolatility,
        sharpeRatio: calculateSharpeRatio(totalReturn, weightedVolatility)
    };
}

function calculateRiskMetrics(assetData) {
    
    const assets = Object.values(assetData);
    const returns = assets.map(asset => {
        const prices = asset.priceHistory.map(h => h.price);
        return calculateReturns(prices);
    });

    return {
        beta: calculateBeta(returns),
        correlation: calculateCorrelationMatrix(returns)
    };
}


function calculateReturns(prices) {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    return returns;
}

function calculateVolatility(returns) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (returns.length - 1));
}

function calculateSharpeRatio(return_, volatility) {
    const riskFreeRate = 0.0475; // fed faiz
    return (return_ - riskFreeRate) / volatility;
}

function calculateBeta(returns) {
    
    return 1.0; // Örnek değer
}

function calculateCorrelationMatrix(returns) {
    const n = returns.length;
    const matrix = Array(n).fill().map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            matrix[i][j] = calculateCorrelation(returns[i], returns[j]);
        }
    }
    return matrix;
}

function calculateCorrelation(returns1, returns2) {
    const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;
    
    let covariance = 0;
    let var1 = 0;
    let var2 = 0;

    for (let i = 0; i < returns1.length; i++) {
        const diff1 = returns1[i] - mean1;
        const diff2 = returns2[i] - mean2;
        covariance += diff1 * diff2;
        var1 += diff1 * diff1;
        var2 += diff2 * diff2;
    }

    return covariance / Math.sqrt(var1 * var2);
}

module.exports = router; 