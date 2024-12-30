const { calculateDailyReturns } = require('../utils/calculations');
const MarketDataService = require('./MarketDataService');

class PortfolioService {
    constructor(pool) {
        this.pool = pool;
        this.marketDataService = new MarketDataService(pool);
    }

    // Query yardımcı metodu ekleyelim
    async query(sql, params = []) {
        try {
            const [rows] = await this.pool.query(sql, params);
            return rows;
        } catch (error) {
            console.error('Query hatası:', error);
            throw error;
        }
    }

    /**
     * Portföy detaylarını getir
     * @param {number} portfolioId Portföy ID
     * @returns {Promise<Object>} Portföy detayları ve varlıkları
     */
    async getPortfolioDetails(portfolioId) {
        try {
            // Portföy detaylarını al
            const [details] = await this.pool.query(`
                SELECT 
                    p.*,
                    pd.asset_type,
                    pd.asset_symbol,
                    pd.quantity,
                    pd.weight as weight,  /* Ağırlığı direkt al, çarpma işlemi kaldırıldı */
                    pd.purchase_price,
                    pd.purchase_date
                FROM portfolios p
                LEFT JOIN portfolio_details pd ON p.portfolio_id = pd.portfolio_id
                WHERE p.portfolio_id = ?
            `, [portfolioId]);

            if (!details || details.length === 0) {
                throw new Error('Portföy bulunamadı');
            }

            // Portföy bilgilerini düzenle
            const portfolio = {
                portfolio_id: details[0].portfolio_id,
                portfolio_name: details[0].portfolio_name,
                creation_date: details[0].creation_date,
                initial_value: details[0].initial_value,
                description: details[0].description,
                assets: details.map(row => ({
                    asset_type: row.asset_type,
                    asset_symbol: row.asset_symbol,
                    quantity: row.quantity,
                    weight: row.weight,
                    purchase_price: row.purchase_price,
                    purchase_date: row.purchase_date
                })).filter(asset => asset.asset_symbol)
            };

            return portfolio;

        } catch (error) {
            console.error('Portföy detayları alınırken hata:', error);
            throw new Error('Portföy detayları alınamadı');
        }
    }

    /**
     * Yeni portföy oluştur
     * @param {Object} portfolioData Portföy bilgileri
     * @returns {Promise<Object>} Oluşturulan portföy
     */
    async createPortfolio(portfolioData) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            // Portföy validasyonu
            await this._validatePortfolioData(portfolioData);

            // Ana portföy kaydı
            const [result] = await connection.query(`
                INSERT INTO portfolios (
                    portfolio_name,
                    creation_date,
                    initial_value,
                    description
                ) VALUES (?, CURDATE(), ?, ?)
            `, [
                portfolioData.portfolio_name,
                portfolioData.initial_value || 0,
                portfolioData.description || null
            ]);

            const portfolioId = result.insertId;

            // Varlıkları ekle
            await this._addPortfolioAssets(connection, portfolioId, portfolioData.assets);

            await connection.commit();
            
            // Portföy detaylarını getirmeden direkt başarılı döndür
            return {
                portfolio_id: portfolioId,
                success: true
            };

        } catch (error) {
            await connection.rollback();
            console.error('Portföy oluşturma hatası:', error);
            throw new Error('Portföy oluşturulamadı');
        } finally {
            connection.release();
        }
    }

    /**
     * Portföy güncelle
     * @param {number} portfolioId Portföy ID
     * @param {Object} updateData Güncelleme verileri
     * @returns {Promise<Object>} Güncellenmiş portföy
     */
    async updatePortfolio(portfolioId, updateData) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            // Portföy varlığını kontrol et
            const [portfolio] = await connection.query(
                'SELECT * FROM portfolios WHERE portfolio_id = ?',
                [portfolioId]
            );

            if (!portfolio) {
                throw new Error('Portföy bulunamadı');
            }

            // Ana portföy bilgilerini güncelle
            if (updateData.portfolio_name || updateData.description) {
                await connection.query(`
                    UPDATE portfolios 
                    SET 
                        portfolio_name = COALESCE(?, portfolio_name),
                        description = COALESCE(?, description)
                    WHERE portfolio_id = ?
                `, [
                    updateData.portfolio_name,
                    updateData.description,
                    portfolioId
                ]);
            }

            // Varlıkları güncelle
            if (updateData.assets) {
                // Mevcut varlıkları sil
                await connection.query(
                    'DELETE FROM portfolio_details WHERE portfolio_id = ?',
                    [portfolioId]
                );

                // Yeni varlıkları ekle
                await this._addPortfolioAssets(connection, portfolioId, updateData.assets);
            }

            await connection.commit();
            return this.getPortfolioDetails(portfolioId);

        } catch (error) {
            await connection.rollback();
            console.error('Portföy güncelleme hatası:', error);
            throw new Error('Portföy güncellenemedi');
        } finally {
            connection.release();
        }
    }

    /**
     * Portföy sil
     * @param {number} portfolioId Portföy ID
     * @returns {Promise<boolean>} Silme durumu
     */
    async deletePortfolio(portfolioId) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();

            // Önce portföy detaylarını sil
            await connection.query(
                'DELETE FROM portfolio_details WHERE portfolio_id = ?',
                [portfolioId]
            );

            // Sonra ana portföyü sil
            const [result] = await connection.query(
                'DELETE FROM portfolios WHERE portfolio_id = ?',
                [portfolioId]
            );

            await connection.commit();
            return result.affectedRows > 0;

        } catch (error) {
            await connection.rollback();
            console.error('Portföy silme hatası:', error);
            throw new Error('Portföy silinemedi');
        } finally {
            connection.release();
        }
    }

    /**
     * Portföy performans özeti
     * @param {number} portfolioId Portföy ID
     * @returns {Promise<Object>} Performans özeti
     */
    async getPortfolioSummary(portfolioId) {
        try {
            const portfolio = await this.getPortfolioDetails(portfolioId);
            
            // Güncel fiyatları al
            const symbols = portfolio.assets.map(a => a.asset_symbol);
            const currentPrices = await this.marketDataService.getBulkAssetPrices(symbols);

            // Özet hesapla
            const summary = {
                portfolio_id: portfolioId,
                portfolio_name: portfolio.portfolio_name,
                initial_value: portfolio.initial_value,
                totalValue: 0,
                totalReturn: 0,
                assetCount: portfolio.assets.length,
                lastUpdate: new Date()
            };

            // Varlık bazında hesaplamalar
            portfolio.assets.forEach(asset => {
                const currentPrice = currentPrices[asset.asset_symbol] || asset.purchase_price;
                const value = asset.quantity * currentPrice;
                const cost = asset.quantity * asset.purchase_price;
                
                summary.totalValue += value;
                summary.totalReturn += (value - cost);
            });

            // Yüzde getiri hesapla
            summary.totalReturnPercent = (summary.totalReturn / portfolio.initial_value) * 100;

            return summary;

        } catch (error) {
            console.error('Portföy özeti alınırken hata:', error);
            throw new Error('Portföy özeti alınamadı');
        }
    }

    /**
     * Yardımcı metodlar
     * @private
     */
    async _validatePortfolioData(portfolioData) {
        if (!portfolioData.portfolio_name) {
            throw new Error('Portföy adı gereklidir');
        }

        if (!portfolioData.initial_value || portfolioData.initial_value <= 0) {
            throw new Error('Geçerli bir portföy büyüklüğü girilmelidir');
        }

        if (!portfolioData.assets || portfolioData.assets.length === 0) {
            throw new Error('En az bir varlık eklenmelidir');
        }

        let totalWeight = 0;
        portfolioData.assets.forEach(asset => {
            if (!asset.asset_type || !asset.asset_symbol || 
                !asset.quantity || !asset.purchase_price) {
                throw new Error('Eksik varlık bilgisi');
            }
            totalWeight += parseFloat(asset.weight);
        });

        // Sadece %100'ü geçmemesini kontrol et
        if (totalWeight > 100) {
            throw new Error('Toplam ağırlık %100\'ü geçemez');
        }
    }

    async _addPortfolioAssets(connection, portfolioId, assets) {
        for (const asset of assets) {
            await connection.query(`
                INSERT INTO portfolio_details (
                    portfolio_id,
                    asset_type,
                    asset_symbol,
                    quantity,
                    weight,
                    purchase_price,
                    purchase_date
                ) VALUES (?, ?, ?, ?, ?, ?, CURDATE())
            `, [
                portfolioId,
                asset.asset_type,
                asset.asset_symbol,
                asset.quantity,
                asset.weight,
                asset.purchase_price
            ]);
        }
    }

    validateAssetData(asset) {
        const requiredFields = ['type', 'symbol', 'quantity', 'weight', 'price'];
        const missingFields = requiredFields.filter(field => !asset[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Eksik varlık bilgileri: ${missingFields.join(', ')}`);
        }

        if (asset.weight <= 0 || asset.weight > 100) {
            throw new Error('Geçersiz ağırlık değeri');
        }
    }

    /**
     * Tüm portföyleri getir
     * @returns {Promise<Array>} Portföy listesi
     */
    async getAllPortfolios() {
        try {
            const portfolios = await this.query(`
                SELECT 
                    p.*,
                    COUNT(DISTINCT pd.asset_symbol) as asset_count,
                    COALESCE(SUM(pd.quantity * COALESCE(sc.Currentprice, 0)), 0) as current_value
                FROM portfolios p
                LEFT JOIN portfolio_details pd ON p.portfolio_id = pd.portfolio_id
                LEFT JOIN sp500_companies sc ON pd.asset_symbol = sc.Symbol
                GROUP BY p.portfolio_id
                ORDER BY p.creation_date DESC
            `);

            if (!portfolios) {
                throw new Error('Portföy verisi alınamadı');
            }

            return portfolios.map(p => ({
                portfolio_id: p.portfolio_id,
                portfolio_name: p.portfolio_name,
                creation_date: p.creation_date,
                initial_value: parseFloat(p.initial_value),
                description: p.description,
                asset_count: parseInt(p.asset_count),
                current_value: parseFloat(p.current_value || 0),
                return: ((parseFloat(p.current_value || 0) - parseFloat(p.initial_value)) / parseFloat(p.initial_value))
            }));
        } catch (error) {
            console.error('Portföy listesi alınırken hata:', error);
            throw new Error('Portföy listesi alınamadı');
        }
    }
}

module.exports = PortfolioService; 