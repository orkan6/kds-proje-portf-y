const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

// Emtia sembollerini düzelt
const COMMODITY_MAPPING = {
    'BRENT CRUD': 'BRENT CRUDE',
    'WTI CRUD': 'WTI CRUDE',
    'NATURAL GAS': 'NATURAL GAS',
    'LOW SULPHU': 'LOW SULPHUR GAS OIL',
    'LIVE CATTL': 'LIVE CATTLE',
    'SOYBEAN OI': 'SOYBEAN OIL',
    'SOYBEAN ME': 'SOYBEAN MEAL',
    'SOYBEANS': 'SOYBEANS',
    'CORN': 'CORN',
    'COPPER': 'COPPER',
    'SILVER': 'SILVER',
    'ALUMINIUM': 'ALUMINIUM',
    'ZINC': 'ZINC',
    'NICKEL': 'NICKEL',
    'WHEAT': 'WHEAT',
    'SUGAR': 'SUGAR',
    'GASOLINE': 'GASOLINE',
    'COFFEE': 'COFFEE',
    'LEAN HOGS': 'LEAN HOGS',
    'HRW WHEAT': 'HRW WHEAT',
    'COTTON': 'COTTON',
    'ULS DIESEL': 'ULS DIESEL'
};

// Dönem konfigürasyonları
const periodConfig = {
    '1M': { days: 21, factor: 1/12 },
    '3M': { days: 63, factor: 1/4 },
    '6M': { days: 126, factor: 1/2 },
    '1Y': { days: 252, factor: 1 }
};

// Hisse senetlerini getir
router.get('/stocks', async (req, res) => {
    try {
        const stocks = await query(`
            SELECT Symbol, Shortname, Sector, Currentprice 
            FROM sp500_companies 
            ORDER BY Shortname
        `);
        res.json(stocks);
    } catch (err) {
        console.error('Hisse senedi listesi alınırken hata:', err);
        res.status(500).json({ error: 'Hisse senetleri getirilemedi' });
    }
});

// Emtiaları getir
router.get('/commodities', async (req, res) => {
    try {
        const commodities = await query(`
            SELECT * FROM commodity_futures 
            WHERE Date = (SELECT MAX(Date) FROM commodity_futures)
        `);
        res.json(commodities);
    } catch (err) {
        console.error('Emtia listesi alınırken hata:', err);
        res.status(500).json({ error: 'Emtialar getirilemedi' });
    }
});

// Yeni portföy oluştur
router.post('/portfolios', async (req, res) => {
    try {
        console.log('Yeni portföy oluşturuluyor:', req.body);
        const { portfolio_name, description = '', initial_value = 0, assets } = req.body;
        
        // Validasyonlar
        if (!portfolio_name) {
            return res.status(400).json({ error: 'Portföy adı gereklidir' });
        }
        
        if (!Array.isArray(assets) || assets.length === 0) {
            return res.status(400).json({ error: 'En az bir varlık eklenmelidir' });
        }

        // Varlıkları kontrol et
        for (const asset of assets) {
            if (!asset.type || !asset.symbol || !asset.quantity || !asset.price) {
                return res.status(400).json({ 
                    error: 'Eksik varlık bilgisi',
                    details: 'Her varlık için tip, sembol, miktar ve fiyat gereklidir'
                });
            }
        }
        
        // Portföy oluştur
        const result = await query(`
            INSERT INTO portfolios (portfolio_name, creation_date, initial_value, description)
            VALUES (?, CURDATE(), ?, ?)
        `, [portfolio_name, initial_value || 0, description || null]);
        
        const portfolioId = result.insertId;
        let totalValue = 0;

        // Varlıkları ekle
        for (const asset of assets) {
            const value = parseFloat(asset.quantity) * parseFloat(asset.price);
            totalValue += value;

            await query(`
                INSERT INTO portfolio_details 
                (portfolio_id, asset_type, asset_symbol, quantity, weight, purchase_price, purchase_date)
                VALUES (?, ?, ?, ?, ?, ?, CURDATE())
            `, [
                portfolioId,
                asset.type || 'UNKNOWN',
                asset.symbol,
                parseFloat(asset.quantity),
                parseFloat(asset.weight) || 0,
                parseFloat(asset.price),
            ]);
        }

        // Toplam değeri güncelle
        await query(`
            UPDATE portfolios 
            SET initial_value = ?
            WHERE portfolio_id = ?
        `, [totalValue, portfolioId]);

        res.status(201).json({
            success: true,
            message: 'Portföy başarıyla oluşturuldu',
            portfolio_id: portfolioId,
            total_value: totalValue
        });

    } catch (err) {
        console.error('Portföy oluşturma hatası:', err);
        res.status(500).json({ 
            error: 'Portföy oluşturulamadı', 
            details: err.message 
        });
    }
});

// Tüm portföyleri getir
router.get('/portfolios', async (req, res) => {
    try {
        console.log('Portföyler getiriliyor...');
        
        const portfolios = await query(`
            SELECT 
                p.*,
                pd.detail_id,
                pd.asset_type,
                pd.asset_symbol,
                pd.quantity,
                pd.weight,
                pd.purchase_price,
                pd.purchase_date
            FROM portfolios p
            LEFT JOIN portfolio_details pd ON p.portfolio_id = pd.portfolio_id
            ORDER BY p.creation_date DESC
        `);

        console.log('Ham veritabanı sonuçları:', portfolios);

        // Portföyleri grupla
        const groupedPortfolios = portfolios.reduce((acc, row) => {
            if (!acc[row.portfolio_id]) {
                acc[row.portfolio_id] = {
                    portfolio_id: row.portfolio_id,
                    portfolio_name: row.portfolio_name,
                    initial_value: row.initial_value,
                    creation_date: row.creation_date,
                    description: row.description,
                    portfolio_details: []
                };
            }

            if (row.detail_id) {
                acc[row.portfolio_id].portfolio_details.push({
                    detail_id: row.detail_id,
                    asset_type: row.asset_type,
                    asset_symbol: row.asset_symbol,
                    quantity: row.quantity,
                    weight: row.weight,
                    purchase_price: row.purchase_price,
                    purchase_date: row.purchase_date
                });
            }

            return acc;
        }, {});

        const result = Object.values(groupedPortfolios);
        console.log('İşlenmiş portföy verileri:', result);
        
        res.json(result);

    } catch (err) {
        console.error('Portföyleri getirme hatası:', err);
        res.status(500).json({ 
            error: 'Portföyler getirilemedi', 
            details: err.message 
        });
    }
});

// Tek bir portföyü getir
router.get('/portfolios/:id', async (req, res) => {
    try {
        const portfolioId = req.params.id;
        
        const portfolio = await query(`
            SELECT 
                p.*,
                pd.detail_id,
                pd.asset_type,
                pd.asset_symbol,
                pd.quantity,
                pd.weight,
                pd.purchase_price,
                pd.purchase_date
            FROM portfolios p
            LEFT JOIN portfolio_details pd ON p.portfolio_id = pd.portfolio_id
            WHERE p.portfolio_id = ?
        `, [portfolioId]);

        if (portfolio.length === 0) {
            return res.status(404).json({ error: 'Portföy bulunamadı' });
        }

        // Portföy verilerini düzenle
        const result = {
            portfolio_id: portfolio[0].portfolio_id,
            portfolio_name: portfolio[0].portfolio_name,
            initial_value: portfolio[0].initial_value,
            creation_date: portfolio[0].creation_date,
            description: portfolio[0].description,
            portfolio_details: portfolio.filter(row => row.detail_id).map(row => ({
                detail_id: row.detail_id,
                asset_type: row.asset_type,
                asset_symbol: row.asset_symbol,
                quantity: row.quantity,
                weight: row.weight,
                purchase_price: row.purchase_price,
                purchase_date: row.purchase_date
            }))
        };

        res.json(result);

    } catch (err) {
        console.error('Portföy getirme hatası:', err);
        res.status(500).json({ 
            error: 'Portföy getirilemedi', 
            details: err.message 
        });
    }
});

// Portföy güncelle
router.put('/portfolios/:id', async (req, res) => {
    try {
        const portfolioId = req.params.id;
        const { portfolio_name, description, initial_value, assets } = req.body;

        // Portföyü güncelle
        await query(`
            UPDATE portfolios 
            SET portfolio_name = ?,
                description = ?,
                initial_value = ?,
                last_updated = NOW()
            WHERE portfolio_id = ?
        `, [portfolio_name, description || null, initial_value || 0, portfolioId]);

        // Mevcut varlıkları sil
        await query('DELETE FROM portfolio_details WHERE portfolio_id = ?', [portfolioId]);

        // Yeni varlıkları ekle
        if (Array.isArray(assets) && assets.length > 0) {
            for (const asset of assets) {
                await query(`
                    INSERT INTO portfolio_details 
                    (portfolio_id, asset_type, asset_symbol, quantity, weight, purchase_price, purchase_date)
                    VALUES (?, ?, ?, ?, ?, ?, CURDATE())
                `, [
                    portfolioId,
                    asset.type,
                    asset.symbol,
                    parseFloat(asset.quantity),
                    parseFloat(asset.weight) || 0,
                    parseFloat(asset.price)
                ]);
            }
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

// Portföy sil
router.delete('/portfolios/:id', async (req, res) => {
    try {
        const portfolioId = req.params.id;

        // Önce portföy detaylarını sil
        await query('DELETE FROM portfolio_details WHERE portfolio_id = ?', [portfolioId]);
        
        // Sonra portföyü sil
        await query('DELETE FROM portfolios WHERE portfolio_id = ?', [portfolioId]);

        res.json({ 
            success: true, 
            message: 'Portföy başarıyla silindi' 
        });

    } catch (err) {
        console.error('Portföy silme hatası:', err);
        res.status(500).json({ 
            error: 'Portföy silinemedi', 
            details: err.message 
        });
    }
});

// Korelasyon hesaplama fonksiyonu
function calculateCorrelationMatrix(assets) {
    const n = assets.length;
    const matrix = [];
    const assetSymbols = assets.map(asset => asset.asset_symbol);

    for (let i = 0; i < n; i++) {
        matrix[i] = [];
        for (let j = 0; j < n; j++) {
            if (i === j) {
                matrix[i][j] = 1; // Kendisiyle korelasyonu 1
            } else {
                const returns1 = assets[i].returns;
                const returns2 = assets[j].returns;
                matrix[i][j] = calculateCorrelation(returns1, returns2);
            }
        }
    }

    return {
        assets: assetSymbols,
        matrix: matrix
    };
}

// Pearson korelasyon katsayısı hesaplama
function calculateCorrelation(returns1, returns2) {
    if (!returns1 || !returns2 || returns1.length < 2 || returns2.length < 2) return 0;

    const n = Math.min(returns1.length, returns2.length);
    const mean1 = returns1.reduce((a, b) => a + b, 0) / n;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;

    for (let i = 0; i < n; i++) {
        const diff1 = returns1[i] - mean1;
        const diff2 = returns2[i] - mean2;
        numerator += diff1 * diff2;
        denominator1 += diff1 * diff1;
        denominator2 += diff2 * diff2;
    }

    if (denominator1 === 0 || denominator2 === 0) return 0;
    
    const correlation = numerator / Math.sqrt(denominator1 * denominator2);
    return Math.max(-1, Math.min(1, correlation)); // -1 ile 1 arasında sınırla
}

// Jensen's Alpha hesaplama
function calculateAlpha(portfolioReturn, beta, marketReturn, period) {
    const annualRiskFreeRate = 0.035; // %3.5 yıllık risksiz faiz oranı
    const periodicRiskFreeRate = Math.pow(1 + annualRiskFreeRate, periodConfig[period].factor) - 1;
    
    return portfolioReturn - (periodicRiskFreeRate + beta * (marketReturn - periodicRiskFreeRate));
}

// Sharpe oranı hesaplama
function calculateSharpeRatio(portfolioReturn, portfolioVolatility, period) {
    const annualRiskFreeRate = 0.035; // %3.5
    const periodicRiskFreeRate = Math.pow(1 + annualRiskFreeRate, periodConfig[period].factor) - 1;
    
    if (portfolioVolatility === 0) return 0;
    return (portfolioReturn - periodicRiskFreeRate) / portfolioVolatility;
}

// Treynor oranı hesaplama
function calculateTreynorRatio(portfolioReturn, portfolioBeta, period) {
    const annualRiskFreeRate = 0.035; // %3.5
    const periodicRiskFreeRate = Math.pow(1 + annualRiskFreeRate, periodConfig[period].factor) - 1;
    
    if (portfolioBeta === 0) return 0;
    return (portfolioReturn - periodicRiskFreeRate) / portfolioBeta;
}

// Analiz endpoint'inde bunları kullan
router.get('/portfolios/:id/analysis', async (req, res) => {
    try {
        // Önce portföy varlıklarını getir
        const portfolioDetails = await query(`
            SELECT pd.asset_symbol, pd.weight, sc.Sector
            FROM portfolio_details pd
            JOIN sp500_companies sc ON pd.asset_symbol = sc.Symbol
            WHERE pd.portfolio_id = ?
        `, [req.params.id]);

        // Her varlık için fiyat verilerini getir
        const assets = await Promise.all(portfolioDetails.map(async (asset) => {
            // Dinamik sütun adını kullanarak fiyat verilerini getir
            const priceQuery = `
                SELECT Date, \`${asset.asset_symbol}\` as price
                FROM sp500veri
                WHERE Date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
                AND \`${asset.asset_symbol}\` IS NOT NULL
                ORDER BY Date ASC
            `;

            const priceData = await query(priceQuery);

            return {
                symbol: asset.asset_symbol,
                sector: asset.Sector,
                weight: parseFloat(asset.weight),
                prices: priceData.map(row => parseFloat(row.price)),
                dates: priceData.map(row => row.Date)
            };
        }));

        // SP500 endeks verilerini getir
        const marketData = await query(`
            SELECT Date, \`S&P500\` as price
            FROM sp500_index
            WHERE Date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            ORDER BY Date ASC
        `);

        res.json({
            assets,
            market: {
                dates: marketData.map(row => row.Date),
                prices: marketData.map(row => parseFloat(row.price))
            }
        });

    } catch (err) {
        console.error('Portföy analizi veri hatası:', err);
        res.status(500).json({ 
            error: 'Veri getirme hatası',
            details: err.message
        });
    }
});

// Yıllık getiri hesapla
function calculateAnnualizedReturn(returns) {
    if (!returns || returns.length === 0) return 0;
    
    // Kümülatif getiriyi hesapla
    const totalReturn = returns.reduce((acc, ret) => acc * (1 + ret), 1) - 1;
    
    // Yıllıklandır (252 işlem günü varsayımıyla)
    return Math.pow(1 + totalReturn, 252 / returns.length) - 1;
}

// Yıllıklandırılmış volatilite hesaplama
function calculateAnnualizedVolatility(returns, period) {
    if (!returns || returns.length < 2) return 0;
    
    const { days } = periodConfig[period];
    const relevantReturns = returns.slice(-days);

    if (relevantReturns.length < 2) return 0;

    // Günlük volatiliteyi hesapla
    const mean = relevantReturns.reduce((a, b) => a + b, 0) / relevantReturns.length;
    const variance = relevantReturns.reduce((sum, ret) => {
        return sum + Math.pow(ret - mean, 2);
    }, 0) / (relevantReturns.length - 1);
    
    const dailyVolatility = Math.sqrt(variance);

    // Yıllıklandır
    return dailyVolatility * Math.sqrt(252);
}

// Maksimum düşüş hesapla
function calculateMaxDrawdown(priceHistory) {
    if (!priceHistory || priceHistory.length < 2) return 0;
    
    let maxDrawdown = 0;
    let peak = priceHistory[0].price;
    
    for (let i = 1; i < priceHistory.length; i++) {
        const price = priceHistory[i].price;
        if (price > peak) {
            peak = price;
        } else {
            const drawdown = (peak - price) / peak;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
    }
    
    return maxDrawdown;
}

// Beta hesapla
function calculatePortfolioBeta(portfolioReturns) {
    if (!portfolioReturns || portfolioReturns.length === 0) return 1;
    
    const portfolioVolatility = calculateAnnualizedVolatility(portfolioReturns);
    const marketVolatility = 0.15; // Varsayılan piyasa volatilitesi
    
    return portfolioVolatility !== 0 ? portfolioVolatility / marketVolatility : 1;
}

// Alpha hesapla
function calculatePortfolioAlpha(portfolioReturn, portfolioReturns) {
    if (!portfolioReturns || portfolioReturns.length === 0) return 0;
    
    const beta = calculatePortfolioBeta(portfolioReturns);
    const marketReturn = 0.10; // Varsayılan yıllık piyasa getirisi
    const riskFreeRate = 0.0475; // Risksiz faiz oranı
    
    return portfolioReturn - (riskFreeRate + beta * (marketReturn - riskFreeRate));
}

// Günlük getirileri hesaplama fonksiyonu
function calculateDailyReturns(priceHistory) {
    if (!priceHistory || priceHistory.length < 2) return [];
    
    // Debug için log ekleyelim
    console.log('Calculating daily returns:', {
        totalPrices: priceHistory.length,
        firstFewPrices: priceHistory.slice(0, 5)
    });
    
    const returns = [];
    for (let i = 1; i < priceHistory.length; i++) {
        const currentPrice = parseFloat(priceHistory[i].price);
        const previousPrice = parseFloat(priceHistory[i-1].price);
        
        if (isNaN(currentPrice) || isNaN(previousPrice) || previousPrice === 0) {
            console.warn('Invalid price data:', {
                current: priceHistory[i],
                previous: priceHistory[i-1]
            });
            continue;
        }

        const dailyReturn = (currentPrice - previousPrice) / previousPrice;
        returns.push(dailyReturn);
    }

    // Debug için log ekleyelim
    console.log('Daily returns result:', {
        totalReturns: returns.length,
        firstFewReturns: returns.slice(0, 5)
    });

    return returns;
}

// Portföy maksimum düşüşünü hesapla
function calculatePortfolioMaxDrawdown(assets) {
    if (!assets || assets.length === 0) return 0;
    
    // Her varlığın ağırlıklı maksimum düşüşünü hesapla
    const weightedDrawdowns = assets.map(asset => 
        (asset.max_drawdown || 0) * (asset.weight / 100)
    );
    
    return weightedDrawdowns.reduce((a, b) => a + b, 0);
}

// CAPM ile beklenen getiri hesaplama
async function calculateExpectedReturn(returns, period) {
    if (!returns || returns.length === 0) return 0;
    
    const { days, factor } = periodConfig[period];
    const relevantReturns = returns.slice(-days);

    if (relevantReturns.length === 0) return 0;

    try {
        // S&P 500 endeks verilerini al
        const marketData = await query(`
            SELECT Date, \`S&P500\` as price
            FROM sp500_index
            ORDER BY Date DESC
            LIMIT ${days + 1}
        `);

        if (!marketData || marketData.length === 0) {
            console.warn('Piyasa verisi bulunamadı');
            return 0;
        }

        // Piyasa günlük getirilerini hesapla
        const marketReturns = [];
        for (let i = 1; i < marketData.length; i++) {
            const currentPrice = parseFloat(marketData[i-1].price);
            const previousPrice = parseFloat(marketData[i].price);
            if (!isNaN(currentPrice) && !isNaN(previousPrice) && previousPrice !== 0) {
                marketReturns.push((currentPrice - previousPrice) / previousPrice);
            }
        }

        // Yıllık risksiz faiz oranını dönemsel hale getir
        const annualRiskFreeRate = 0.035; // %3.5
        const periodicRiskFreeRate = Math.pow(1 + annualRiskFreeRate, factor) - 1;

        // Piyasa getirisini hesapla ve dönemsel hale getir
        const annualMarketReturn = marketReturns.reduce((sum, ret) => sum + ret, 0) / marketReturns.length * 252;
        const periodicMarketReturn = Math.pow(1 + annualMarketReturn, factor) - 1;

        // Risk primini hesapla
        const periodicRiskPremium = periodicMarketReturn - periodicRiskFreeRate;

        // Beta hesapla
        const beta = calculateBeta(relevantReturns, marketReturns);

        // CAPM formülü: E(Ri) = Rf + βi(E(Rm) - Rf)
        const expectedReturn = periodicRiskFreeRate + beta * periodicRiskPremium;

        return expectedReturn;

    } catch (err) {
        console.error('CAPM hesaplama hatası:', err);
        return 0;
    }
}

// Beta hesaplama fonksiyonu
function calculateBeta(assetReturns, marketReturns) {
    if (assetReturns.length === 0 || marketReturns.length === 0) return 1;

    // Ortalama getirileri hesapla
    const avgAssetReturn = assetReturns.reduce((a, b) => a + b, 0) / assetReturns.length;
    const avgMarketReturn = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;

    // Kovaryans ve varyans hesapla
    let covariance = 0;
    let marketVariance = 0;

    const length = Math.min(assetReturns.length, marketReturns.length);
    
    for (let i = 0; i < length; i++) {
        covariance += (assetReturns[i] - avgAssetReturn) * (marketReturns[i] - avgMarketReturn);
        marketVariance += Math.pow(marketReturns[i] - avgMarketReturn, 2);
    }

    covariance /= (length - 1);
    marketVariance /= (length - 1);

    // Beta = Covariance(Ri,Rm) / Variance(Rm)
    return marketVariance !== 0 ? covariance / marketVariance : 1;
}

// Portföy volatilitesi hesaplama fonksiyonu
function calculatePortfolioVolatility(assets, period) {
    if (!assets || assets.length === 0) return 0;

    const { days } = periodConfig[period];
    let totalVolatility = 0;

    // İlk toplam: Σ(wi² * σi²)
    const individualContributions = assets.map(asset => {
        const weight = asset.weight / 100;
        const returns = asset.returns.slice(-days);
        const volatility = calculateAnnualizedVolatility(returns, period);
        return weight * weight * volatility * volatility;
    });
    totalVolatility += individualContributions.reduce((sum, val) => sum + val, 0);

    // İkinci toplam: 2 * Σ(wi * wj * Cov(Ri,Rj))
    for (let i = 0; i < assets.length; i++) {
        for (let j = i + 1; j < assets.length; j++) {  // j başlangıcı i+1 çünkü i=j durumunu yukarıda hesapladık
            const weight_i = assets[i].weight / 100;
            const weight_j = assets[j].weight / 100;
            const returns_i = assets[i].returns.slice(-days);
            const returns_j = assets[j].returns.slice(-days);

            // Kovaryansı hesapla
            const covariance = calculateCovariance(returns_i, returns_j);
            
            // 2 * wi * wj * Cov(Ri,Rj)
            totalVolatility += 2 * weight_i * weight_j * covariance;
        }
    }

    return Math.sqrt(totalVolatility);
}

// Kovaryans hesaplama fonksiyonu
function calculateCovariance(returns1, returns2) {
    if (!returns1 || !returns2 || returns1.length !== returns2.length || returns1.length < 2) {
        return 0;
    }

    const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

    let covariance = 0;
    for (let i = 0; i < returns1.length; i++) {
        covariance += (returns1[i] - mean1) * (returns2[i] - mean2);
    }

    // Kovaryansı yıllıklandır
    return (covariance / (returns1.length - 1)) * 252;
}

// Portföy volatilitelerini hesapla
function calculatePortfolioVolatilities(assets) {
    const periods = ['1M', '3M', '6M', '1Y'];
    const volatilities = {};

    periods.forEach(period => {
        volatilities[period] = calculatePortfolioVolatility(assets, period);
    });

    return volatilities;
}

// Portföy için CAPM hesaplama
async function calculatePortfolioExpectedReturn(assets, period) {
    if (!assets || assets.length === 0) return 0;

    try {
        // Her varlık için beklenen getiriyi hesapla
        const expectedReturns = await Promise.all(assets.map(async asset => {
            const returns = asset.returns.slice(-periodConfig[period].days);
            const weight = asset.weight / 100;
            
            // Varlık bazında CAPM hesapla
            const expectedReturn = await calculateExpectedReturn(returns, period);
            
            // E(Rp) = Σ(wi * E(Ri))
            return weight * expectedReturn;
        }));

        // Toplam beklenen getiri
        const portfolioExpectedReturn = expectedReturns.reduce((sum, er) => sum + er, 0);

        // Debug için log
        console.log(`Portföy CAPM Hesaplama (${period}):`, {
            individualReturns: expectedReturns,
            portfolioReturn: portfolioExpectedReturn
        });

        return portfolioExpectedReturn;

    } catch (err) {
        console.error('Portföy CAPM hesaplama hatası:', err);
        return 0;
    }
}

// Portföy beklenen getirilerini hesapla
async function calculatePortfolioExpectedReturns(assets) {
    const periods = ['1M', '3M', '6M', '1Y'];
    const expectedReturns = {};

    // Promise.all ile tüm dönemlerin hesaplanmasını bekle
    await Promise.all(periods.map(async period => {
        expectedReturns[period] = await calculatePortfolioExpectedReturn(assets, period);
    }));

    // Debug için log
    console.log('Portföy Beklenen Getirileri:', expectedReturns);

    return expectedReturns;
}

// Piyasa getirilerini getir
async function getMarketReturns(days) {
    const marketData = await query(`
        SELECT Date, \`S&P500\` as price
        FROM sp500_index
        ORDER BY Date DESC
        LIMIT ${days + 1}
    `);

    const marketReturns = [];
    for (let i = 1; i < marketData.length; i++) {
        const currentPrice = parseFloat(marketData[i-1].price);
        const previousPrice = parseFloat(marketData[i].price);
        if (!isNaN(currentPrice) && !isNaN(previousPrice) && previousPrice !== 0) {
            marketReturns.push((currentPrice - previousPrice) / previousPrice);
        }
    }

    return marketReturns;
}

// Yeni endpoint'leri ekleyelim
router.get('/portfolios/:id/efficient-frontier', async (req, res) => {
    try {
        // SP500 verilerini getir
        const sp500Data = await query(`
            SELECT Date, Close 
            FROM sp500_index 
            ORDER BY Date DESC 
            LIMIT 252
        `);

        // Portföy varlıklarının verilerini getir
        const portfolioStocks = await query(`
            SELECT pd.asset_symbol, pd.weight, s.Close, s.Date, sc.Sector
            FROM portfolio_details pd
            JOIN sp500veri s ON pd.asset_symbol = s.Symbol
            JOIN sp500_companies sc ON pd.asset_symbol = sc.Symbol
            WHERE pd.portfolio_id = ?
            ORDER BY s.Date DESC
        `, [req.params.id]);

        // Verileri işle ve yanıt ver
        res.json({
            efficientFrontier: calculateEfficientFrontier(portfolioStocks, sp500Data),
            currentPortfolio: {
                return: calculatePortfolioReturn(portfolioStocks),
                risk: calculatePortfolioRisk(portfolioStocks),
                position: calculateCurrentPosition(portfolioStocks)
            }
        });

    } catch (err) {
        console.error('Efficient Frontier hesaplama hatası:', err);
        res.status(500).json({ error: 'Hesaplama hatası' });
    }
});

// Sektör analizi endpoint'i
router.get('/portfolios/:id/sector-analysis', async (req, res) => {
    try {
        const sectorData = await query(`
            SELECT pd.portfolio_id, sc.Sector, 
                   SUM(pd.weight) as sector_weight
            FROM portfolio_details pd
            JOIN sp500_companies sc ON pd.asset_symbol = sc.Symbol
            WHERE pd.portfolio_id = ?
            GROUP BY sc.Sector
        `, [req.params.id]);

        res.json(sectorData);
    } catch (err) {
        console.error('Sektör analizi hatası:', err);
        res.status(500).json({ error: 'Sektör analizi hatası' });
    }
});

// SP500 endeks verilerini getir
router.get('/market/sp500', async (req, res) => {
    try {
        const marketData = await query(`
            SELECT Date, \`S&P500\` as price
            FROM sp500_index
            WHERE Date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            ORDER BY Date
        `);

        res.json({
            dates: marketData.map(d => d.Date),
            prices: marketData.map(d => d.price)
        });

    } catch (err) {
        console.error('SP500 veri hatası:', err);
        res.status(500).json({ error: 'Piyasa verisi getirilemedi' });
    }
});

// Portföy metriklerini kaydetme endpoint'i
router.post('/portfolios/:id/metrics', async (req, res) => {
    try {
        const portfolioId = req.params.id;
        const metrics = req.body;

        await query(`
            INSERT INTO portfolio_metrics (
                portfolio_id, calculation_date, total_value, daily_return,
                volatility, sharpe_ratio, beta, alpha, cvar,
                sector_concentration, risk_parity_score, tracking_error
            ) VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                total_value = VALUES(total_value),
                daily_return = VALUES(daily_return),
                volatility = VALUES(volatility),
                sharpe_ratio = VALUES(sharpe_ratio),
                beta = VALUES(beta),
                alpha = VALUES(alpha),
                cvar = VALUES(cvar),
                sector_concentration = VALUES(sector_concentration),
                risk_parity_score = VALUES(risk_parity_score),
                tracking_error = VALUES(tracking_error)
        `, [
            portfolioId, 
            metrics.total_value,
            metrics.daily_return,
            metrics.volatility,
            metrics.sharpe_ratio,
            metrics.beta,
            metrics.alpha,
            metrics.cvar,
            metrics.sector_concentration,
            metrics.risk_parity_score,
            metrics.tracking_error
        ]);

        res.json({ success: true });
    } catch (err) {
        console.error('Metrik kaydetme hatası:', err);
        res.status(500).json({ 
            error: 'Metrikler kaydedilemedi',
            details: err.message
        });
    }
});

// Varlık önerileri endpoint'i
router.get('/portfolios/:id/recommendations', async (req, res) => {
    try {
        // 1. Mevcut portföy verilerini getir
        const portfolio = await query(`
            SELECT 
                pd.asset_symbol,
                pd.weight,
                sc.Sector,
                sc.Shortname,
                sc.Currentprice,
                sc.Marketcap,
                sc.Revenuegrowth
            FROM portfolio_details pd
            JOIN sp500_companies sc ON pd.asset_symbol = sc.Symbol
            WHERE pd.portfolio_id = ?
        `, [req.params.id]);

        // 2. SP500 şirketlerini getir (mevcut portföyde olmayanlar)
        const potentialAssets = await query(`
            SELECT 
                sc.Symbol,
                sc.Shortname,
                sc.Sector,
                sc.Industry,
                sc.Currentprice,
                sc.Marketcap,
                sc.Revenuegrowth
            FROM sp500_companies sc
            WHERE sc.Symbol NOT IN (
                SELECT asset_symbol 
                FROM portfolio_details 
                WHERE portfolio_id = ?
            )
            AND sc.Currentprice IS NOT NULL
            AND sc.Marketcap > 0
            AND sc.Revenuegrowth IS NOT NULL
            LIMIT 20
        `, [req.params.id]);

        // 3. Düşük korelasyonlu varlıkları bul
        const lowCorrAssets = potentialAssets.map(asset => ({
            symbol: asset.Symbol,
            name: asset.Shortname,
            sector: asset.Sector,
            industry: asset.Industry,
            currentPrice: asset.Currentprice,
            marketCap: asset.Marketcap,
            revenueGrowth: asset.Revenuegrowth,
            correlation: Math.random() - 0.5 // Şimdilik random korelasyon
        }));

        // 4. Sektör bazlı öneriler
        const sectorRecommendations = potentialAssets
            .filter(asset => !portfolio.some(p => p.Sector === asset.Sector))
            .map(asset => ({
                symbol: asset.Symbol,
                name: asset.Shortname,
                sector: asset.Sector,
                industry: asset.Industry,
                currentPrice: asset.Currentprice,
                marketCap: asset.Marketcap,
                revenueGrowth: asset.Revenuegrowth
            }));

        // 5. Sonuçları döndür
        res.json({
            lowCorrelation: lowCorrAssets
                .sort((a, b) => Math.abs(a.correlation) - Math.abs(b.correlation))
                .slice(0, 5),
            sectorDiversification: sectorRecommendations.slice(0, 5)
        });

    } catch (err) {
        console.error('Öneri hesaplama hatası:', err);
        res.status(500).json({ error: err.message });
    }
});

// Korelasyon hesaplama yardımcı fonksiyonu
async function calculateAssetCorrelation(portfolio, newAssetSymbol) {
    try {
        // Portföy getirilerini hesapla
        const portfolioReturns = await calculatePortfolioReturns(portfolio);
        
        // Yeni varlığın getirilerini hesapla
        const newAssetReturns = await calculateAssetReturns(newAssetSymbol);

        // Korelasyonu hesapla
        return calculateCorrelation(portfolioReturns, newAssetReturns);
    } catch (err) {
        console.error('Korelasyon hesaplama hatası:', err);
        return null;
    }
}

// Sektör bazlı öneriler
async function getSectorRecommendations(portfolio, potentialAssets) {
    // Mevcut sektör ağırlıklarını hesapla
    const sectorWeights = portfolio.reduce((acc, asset) => {
        acc[asset.Sector] = (acc[asset.Sector] || 0) + parseFloat(asset.weight);
        return acc;
    }, {});

    // Az temsil edilen sektörleri bul
    const underrepresentedSectors = Object.entries(sectorWeights)
        .filter(([sector, weight]) => weight < 0.1)
        .map(([sector, weight]) => ({ sector, weight }));

    // Potansiyel varlıkları sektör bazında filtrele
    const filteredAssets = potentialAssets.filter(asset => underrepresentedSectors.some(s => s.sector === asset.Sector));

    // Sektör bazlı öneriler
    const sectorRecommendations = filteredAssets.map(asset => ({
        symbol: asset.Symbol,
        name: asset.Shortname,
        sector: asset.Sector,
        industry: asset.Industry,
        currentPrice: asset.Currentprice,
        marketCap: asset.Marketcap,
        revenueGrowth: asset.Revenuegrowth,
        correlation: null,
        prices: []
    }));

    return sectorRecommendations;
}

// Portföy getirilerini hesapla
async function calculatePortfolioReturns(portfolio) {
    try {
        // Her varlık için getirileri hesapla
        const assetReturns = await Promise.all(portfolio.map(async (asset) => {
            const returns = await calculateAssetReturns(asset.asset_symbol);
            return returns.map(r => r * (asset.weight / 100)); // Ağırlıklı getiriler
        }));

        // Portföy getirilerini topla
        const portfolioReturns = [];
        for (let i = 0; i < assetReturns[0].length; i++) {
            portfolioReturns[i] = assetReturns.reduce((sum, returns) => sum + returns[i], 0);
        }

        return portfolioReturns;
    } catch (err) {
        console.error('Portföy getirisi hesaplama hatası:', err);
        return [];
    }
}

// Varlık getirilerini hesapla
async function calculateAssetReturns(symbol) {
    try {
        const prices = await query(`
            SELECT \`${symbol}\` as price
            FROM sp500veri
            WHERE Date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            AND \`${symbol}\` IS NOT NULL
            ORDER BY Date ASC
        `);

        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            const currentPrice = parseFloat(prices[i].price);
            const previousPrice = parseFloat(prices[i-1].price);
            
            if (!isNaN(currentPrice) && !isNaN(previousPrice) && previousPrice !== 0) {
                returns.push((currentPrice - previousPrice) / previousPrice);
            }
        }

        return returns;
    } catch (err) {
        console.error(`${symbol} için getiri hesaplama hatası:`, err);
        return [];
    }
}

module.exports = router;