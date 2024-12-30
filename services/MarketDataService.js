const { format, subYears, subMonths } = require('date-fns');

class MarketDataService {
    constructor(pool) {
        this.pool = pool;
    }

    async query(...args) {
        return this.pool.query(...args);
    }

    /**
     * S&P 500 verilerini getir
     * @param {Date} startDate Başlangıç tarihi (opsiyonel)
     * @returns {Promise<Object>} S&P 500 verileri
     */
    async getSP500Data(startDate = subYears(new Date(), 3)) {
        try {
            const formattedDate = format(startDate, 'yyyy-MM-dd');
            
            const [data] = await this.query(`
                SELECT Date, \`S&P500\` as price
                FROM sp500_index
                WHERE Date >= ?
                AND \`S&P500\` IS NOT NULL
                ORDER BY Date ASC
            `, [formattedDate]);

            if (!data || data.length === 0) {
                throw new Error('S&P 500 verisi bulunamadı');
            }

            return {
                dates: data.map(row => row.Date),
                prices: data.map(row => parseFloat(row.price))
            };
        } catch (error) {
            console.error('S&P 500 verisi alınırken hata:', error);
            throw new Error('Piyasa verileri alınamadı');
        }
    }

    /**
     * Belirli bir varlığın fiyat geçmişini getir
     * @param {string} symbol Varlık sembolü
     * @param {Date} startDate Başlangıç tarihi (opsiyonel)
     * @returns {Promise<Array>} Fiyat geçmişi
     */
    async getAssetPrices(symbol, startDate = subYears(new Date(), 1)) {
        try {
            const formattedDate = format(startDate, 'yyyy-MM-dd');

            // Emtia sembolünü düzelt
            let querySymbol = symbol;
            if (symbol === 'BRENT CRUD') {
                querySymbol = 'BRENT CRUDE';
            }

            // Varlık tipine göre farklı tablolardan sorgula
            if (querySymbol.includes('BRENT') || this.isCommodity(querySymbol)) {
                // Emtia fiyatları için commodity_futures tablosunu kullan
                const [rows] = await this.query(`
                    SELECT Date, \`${querySymbol}\` as price
                    FROM commodity_futures
                    WHERE Date >= ?
                    AND \`${querySymbol}\` IS NOT NULL
                    ORDER BY Date ASC
                `, [formattedDate]);

                if (!rows || rows.length === 0) {
                    throw new Error(`${symbol} için fiyat verisi bulunamadı`);
                }

                return rows.map(row => ({
                    date: row.Date,
                    price: parseFloat(row.price)
                }));
            } else {
                // Hisse senetleri için sp500veri tablosunu kullan
                const [rows] = await this.query(`
                    SELECT Date, \`${querySymbol}\` as price
                    FROM sp500veri
                    WHERE Date >= ?
                    AND \`${querySymbol}\` IS NOT NULL
                    ORDER BY Date ASC
                `, [formattedDate]);

                if (!rows || rows.length === 0) {
                    throw new Error(`${symbol} için fiyat verisi bulunamadı`);
                }

                return rows.map(row => ({
                    date: row.Date,
                    price: parseFloat(row.price)
                }));
            }
        } catch (error) {
            console.error(`${symbol} fiyat verisi alınırken hata:`, error);
            throw new Error('Varlık fiyat verisi alınamadı');
        }
    }

    /**
     * Birden fazla varlığın fiyat geçmişini getir
     * @param {Array<string>} symbols Varlık sembolleri
     * @param {Date} startDate Başlangıç tarihi (opsiyonel)
     * @returns {Promise<Object>} Varlık fiyatları
     */
    async getBulkAssetPrices(symbols) {
        try {
            const prices = {};
            
            // En son tarihi al
            const [dateRow] = await this.pool.query(`
                SELECT MAX(Date) as latest_date 
                FROM sp500veri
            `);
            const latestDate = dateRow[0].latest_date;

            // Tüm sembollerin fiyatlarını tek sorguda al
            const [rows] = await this.pool.query(`
                SELECT * FROM sp500veri 
                WHERE Date = ?
            `, [latestDate]);

            if (rows && rows.length > 0) {
                const latestPrices = rows[0];
                
                // Her sembol için fiyatı al
                for (const symbol of symbols) {
                    if (symbol.asset_type === 'STOCK') {
                        // Hisse senedi fiyatı için sp500veri tablosunu kullan
                        if (latestPrices[symbol.asset_symbol]) {
                            prices[symbol.asset_symbol] = parseFloat(latestPrices[symbol.asset_symbol]);
                        }
                    } else {
                        // Emtia fiyatları için commodity_futures tablosunu kullan
                        const [commodityRows] = await this.pool.query(`
                            SELECT * FROM commodity_futures 
                            WHERE Date = (
                                SELECT MAX(Date) 
                                FROM commodity_futures
                            )
                        `);
                        
                        if (commodityRows.length > 0 && commodityRows[0][symbol.asset_symbol]) {
                            prices[symbol.asset_symbol] = parseFloat(commodityRows[0][symbol.asset_symbol]);
                        }
                    }
                }
            }
            
            console.log('Alınan fiyatlar:', prices); // Debug için
            return prices;
        } catch (error) {
            console.error('Toplu fiyat verisi alma hatası:', error);
            return {};
        }
    }

    /**
     * Varlığın emtia olup olmadığını kontrol et
     */
    isCommodity(symbol) {
        const commodities = [
            'NATURAL GAS', 'GOLD', 'WTI CRUDE', 'BRENT CRUDE', 'SOYBEANS',
            'CORN', 'COPPER', 'SILVER', 'LOW SULPHUR GAS OIL', 'LIVE CATTLE',
            'SOYBEAN OIL', 'ALUMINIUM', 'SOYBEAN MEAL', 'ZINC', 'ULS DIESEL',
            'NICKEL', 'WHEAT', 'SUGAR', 'GASOLINE', 'COFFEE', 'LEAN HOGS',
            'HRW WHEAT', 'COTTON'
        ];
        return commodities.includes(symbol.toUpperCase());
    }

    /**
     * Sektör verilerini getir
     * @returns {Promise<Array>} Sektör listesi ve detayları
     */
    async getSectorData() {
        try {
            const data = await this.query(`
                SELECT DISTINCT Sector,
                    COUNT(*) as company_count,
                    AVG(Marketcap) as avg_market_cap,
                    AVG(Revenuegrowth) as avg_revenue_growth
                FROM sp500_companies
                WHERE Sector IS NOT NULL
                GROUP BY Sector
                ORDER BY company_count DESC
            `);

            if (!data || data.length === 0) {
                throw new Error('Sektör verisi bulunamadı');
            }

            return data.map(row => ({
                sector: row.Sector,
                companyCount: row.company_count,
                avgMarketCap: parseFloat(row.avg_market_cap),
                avgRevenueGrowth: parseFloat(row.avg_revenue_growth)
            }));
        } catch (error) {
            console.error('Sektör verisi alınırken hata:', error);
            throw new Error('Sektör verileri alınamadı');
        }
    }

    /**
     * Piyasa özet verilerini getir
     * @returns {Promise<Object>} Piyasa özeti
     */
    async getMarketSummary() {
        try {
            // S&P 500 son durum
            const spData = await this.getSP500Data(subMonths(new Date(), 1));
            const lastPrice = spData.prices[spData.prices.length - 1];
            const prevPrice = spData.prices[0];
            const monthlyReturn = (lastPrice - prevPrice) / prevPrice;

            // Sektör performansları
            const sectorData = await this.getSectorData();

            return {
                sp500: {
                    lastPrice,
                    monthlyReturn,
                    date: spData.dates[spData.dates.length - 1]
                },
                sectors: sectorData,
                lastUpdate: new Date()
            };
        } catch (error) {
            console.error('Piyasa özeti alınırken hata:', error);
            throw new Error('Piyasa özeti alınamadı');
        }
    }

    /**
     * Varlık detaylarını getir
     * @param {string} symbol Varlık sembolü
     * @returns {Promise<Object>} Varlık detayları
     */
    async getAssetDetails(symbol) {
        try {
            const [details] = await this.query(`
                SELECT *
                FROM sp500_companies
                WHERE Symbol = ?
            `, [symbol]);

            if (!details) {
                throw new Error(`${symbol} için detay bulunamadı`);
            }

            return {
                symbol: details.Symbol,
                name: details.Shortname,
                sector: details.Sector,
                industry: details.Industry,
                marketCap: parseFloat(details.Marketcap),
                currentPrice: parseFloat(details.Currentprice),
                revenueGrowth: parseFloat(details.Revenuegrowth)
            };
        } catch (error) {
            console.error(`${symbol} detayları alınırken hata:`, error);
            throw new Error('Varlık detayları alınamadı');
        }
    }
}

module.exports = MarketDataService; 