class OptimizationService {
    constructor(pool) {
        this.pool = pool;
    }

    async getOptimizationData(portfolioId) {
        try {
            // Portföy detaylarını al
            const [portfolio] = await this.pool.query(`
                SELECT 
                    pd.asset_symbol,
                    pd.weight,
                    pd.asset_type,
                    pd.quantity,
                    pd.purchase_price,
                    sc.Sector as sector,
                    sc.Shortname as name,
                    sc.Currentprice as current_price
                FROM portfolio_details pd
                LEFT JOIN sp500_companies sc ON pd.asset_symbol = sc.Symbol
                WHERE pd.portfolio_id = ?
                AND pd.asset_symbol IS NOT NULL
            `, [portfolioId]);

            // Her varlık için fiyat verilerini ve güncel değeri hesapla
            const portfolio_details = await Promise.all(portfolio.map(async asset => {
                const prices = await this.getAssetPrices(asset.asset_symbol, asset.asset_type);
                const currentValue = asset.quantity * (asset.current_price || asset.purchase_price);
                
                return {
                    ...asset,
                    weight: asset.weight,
                    prices: prices,
                    currentValue: currentValue,
                    quantity: asset.quantity,
                    currentPrice: asset.current_price || asset.purchase_price
                };
            }));

            // Toplam portföy değerini hesapla
            const totalValue = portfolio_details.reduce((sum, asset) => sum + asset.currentValue, 0);

            // Market verilerini al
            const [marketData] = await this.pool.query(`
                SELECT \`S&P500\` as price
                FROM sp500_index
                WHERE Date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
                ORDER BY Date ASC
            `);

            return {
                portfolio_details,
                market_data: {
                    prices: marketData.map(row => row.price)
                },
                totalValue
            };

        } catch (error) {
            console.error('Optimizasyon verisi alma hatası:', error);
            throw error;
        }
    }

    async getAssetPrices(symbol, assetType) {
        try {
            // Özel karakterleri temizle
            const cleanSymbol = symbol.replace(/[^A-Z0-9]/g, '');
            
            // Asset type'a göre tabloyu seç
            const table = assetType === 'STOCK' ? 'sp500veri' : 'commodity_futures';
            
            // Önce sembolün tabloda olup olmadığını kontrol et
            const [columns] = await this.pool.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = ? 
                AND COLUMN_NAME = ?
            `, [table, cleanSymbol]);

            // Eğer sembol tabloda yoksa
            if (columns.length === 0) {
                console.log(`${symbol} için alternatif veri kaynağı aranıyor...`);
                
                // sp500_companies tablosundan güncel fiyatı al
                const [currentPrice] = await this.pool.query(`
                    SELECT Currentprice 
                    FROM sp500_companies 
                    WHERE Symbol = ?
                `, [cleanSymbol]);

                if (currentPrice.length > 0 && currentPrice[0].Currentprice) {
                    // Son 30 günlük yapay fiyat verisi oluştur
                    const basePrice = currentPrice[0].Currentprice;
                    return Array(30).fill(basePrice);
                }

                // Hiç veri bulunamazsa varsayılan değerler
                console.warn(`${symbol} için veri bulunamadı, varsayılan değerler kullanılıyor`);
                return Array(30).fill(100);
            }

            // Normal fiyat verilerini getir
            const [priceData] = await this.pool.query(`
                SELECT \`${cleanSymbol}\` as price 
                FROM ${table}
                WHERE \`${cleanSymbol}\` IS NOT NULL 
                ORDER BY Date ASC
            `);

            return priceData.map(row => row.price);

        } catch (error) {
            console.error(`${symbol} fiyat verisi alma hatası:`, error);
            // Hata durumunda varsayılan değerler
            return Array(30).fill(100);
        }
    }

    async getRecommendations(portfolioId) {
        try {
            // Mevcut portföy varlıklarını al
            const [currentAssets] = await this.pool.query(`
                SELECT asset_symbol, asset_type
                FROM portfolio_details
                WHERE portfolio_id = ?
            `, [portfolioId]);

            // Mevcut sektörleri al
            const currentSectors = new Set();
            for (const asset of currentAssets) {
                if (asset.asset_type === 'STOCK') {
                    const [sectorData] = await this.pool.query(`
                        SELECT Sector FROM sp500_companies 
                        WHERE Symbol = ?
                    `, [asset.asset_symbol]);
                    if (sectorData[0]?.Sector) {
                        currentSectors.add(sectorData[0].Sector);
                    }
                }
            }

            // Farklı sektörlerden hisseleri öner
            const [sectorDiversification] = await this.pool.query(`
                SELECT 
                    Symbol as symbol,
                    Shortname as name,
                    Sector as sector,
                    Currentprice as currentPrice
                FROM sp500_companies
                WHERE Sector NOT IN (?)
                AND Symbol NOT IN (
                    SELECT asset_symbol 
                    FROM portfolio_details 
                    WHERE portfolio_id = ?
                )
                LIMIT 5
            `, [Array.from(currentSectors), portfolioId]);

            // Düşük korelasyonlu varlıkları bul
            const lowCorrelation = await this.findLowCorrelationAssets(currentAssets, portfolioId);

            return {
                sectorDiversification,
                lowCorrelation
            };

        } catch (error) {
            console.error('Öneriler alma hatası:', error);
            throw error;
        }
    }

    async findLowCorrelationAssets(currentAssets, portfolioId) {
        // Mevcut varlıkların getirilerini hesapla
        const portfolioReturns = await Promise.all(
            currentAssets.map(async asset => {
                const prices = await this.getAssetPrices(asset.asset_symbol, asset.asset_type);
                return this.calculateReturns(prices);
            })
        );

        // Tüm S&P 500 hisselerini al
        const [allStocks] = await this.pool.query(`
            SELECT Symbol, Shortname, Sector, Currentprice
            FROM sp500_companies
            WHERE Symbol NOT IN (
                SELECT asset_symbol FROM portfolio_details
                WHERE portfolio_id = ?
            )
        `, [portfolioId]);

        // Her hisse için korelasyon hesapla
        const correlations = await Promise.all(
            allStocks.map(async stock => {
                const prices = await this.getAssetPrices(stock.Symbol, 'STOCK');
                const returns = this.calculateReturns(prices);
                
                // Ortalama korelasyon hesapla
                const correlationSum = portfolioReturns.reduce((sum, portReturns) => {
                    return sum + this.calculateCorrelation(returns, portReturns);
                }, 0);
                
                return {
                    symbol: stock.Symbol,
                    name: stock.Shortname,
                    sector: stock.Sector,
                    currentPrice: stock.Currentprice,
                    avgCorrelation: correlationSum / portfolioReturns.length
                };
            })
        );

        // En düşük korelasyonlu 5 hisseyi döndür
        return correlations
            .sort((a, b) => a.avgCorrelation - b.avgCorrelation)
            .slice(0, 5);
    }

    calculateReturns(prices) {
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            if (prices[i] > 0 && prices[i-1] > 0) {
                returns.push((prices[i] - prices[i-1]) / prices[i-1]);
            }
        }
        return returns;
    }

    calculateCorrelation(returns1, returns2) {
        const n = Math.min(returns1.length, returns2.length);
        if (n < 2) return 0;

        const mean1 = returns1.reduce((a, b) => a + b, 0) / n;
        const mean2 = returns2.reduce((a, b) => a + b, 0) / n;

        let num = 0, den1 = 0, den2 = 0;
        
        for (let i = 0; i < n; i++) {
            const diff1 = returns1[i] - mean1;
            const diff2 = returns2[i] - mean2;
            num += diff1 * diff2;
            den1 += diff1 * diff1;
            den2 += diff2 * diff2;
        }

        return num / Math.sqrt(den1 * den2);
    }

    async simulatePortfolio(portfolio) {
        try {
            // Test için log
            console.log('Simülasyon başlatıldı:', portfolio);

            // Her varlık için fiyat verilerini al
            const portfolioData = await Promise.all(portfolio.map(async asset => {
                const prices = await this.getAssetPrices(asset.asset_symbol, asset.asset_type);
                return {
                    ...asset,
                    weight: asset.weight / 100,
                    prices
                };
            }));

            // Test için log
            console.log('Fiyat verileri alındı:', portfolioData);

            // Market verilerini al
            const [marketData] = await this.pool.query(`
                SELECT \`S&P500\` as price
                FROM sp500_index
                ORDER BY Date ASC
            `);

            // Test için log
            console.log('Market verileri alındı');

            // Simülasyon verilerini hazırla
            const simulationData = {
                portfolio_details: portfolioData,
                market_data: {
                    prices: marketData.map(row => row.price)
                }
            };

            // PortfolioOptimizer ile hesapla
            const optimizer = new PortfolioOptimizer(simulationData);
            const metrics = optimizer.calculateInitialMetrics();
            const efficientFrontier = optimizer.calculateEfficientFrontier();

            // Test için log
            console.log('Hesaplamalar tamamlandı:', metrics);

            return {
                ...metrics,
                efficientFrontier,
                portfolio: portfolioData,
                correlationMatrix: optimizer.calculateCorrelationMatrix()
            };

        } catch (error) {
            console.error('Portföy simülasyon hatası:', error);
            throw error;
        }
    }

    async optimizeSimulatedPortfolio(portfolio, riskTolerance) {
        try {
            const simulationResults = await this.simulatePortfolio(portfolio);
            const optimizer = new PortfolioOptimizer({
                portfolio_details: simulationResults.portfolio
            });

            // Mevcut getiriyi hesapla
            const currentReturn = optimizer.calculateCurrentReturn();

            // Optimal ağırlıkları bul
            const optimizedWeights = optimizer.findOptimalWeights(
                optimizer.covariance,
                optimizer.expectedReturns,
                currentReturn,
                riskTolerance
            );

            // Yeni metrikleri hesapla
            const optimizedMetrics = optimizer.calculateMetrics(optimizedWeights);

            return {
                ...optimizedMetrics,
                optimizedWeights,
                portfolio: simulationResults.portfolio,
                correlationMatrix: optimizer.calculateCorrelationMatrix()
            };

        } catch (error) {
            console.error('Portföy optimizasyon hatası:', error);
            throw error;
        }
    }
}

module.exports = OptimizationService; 