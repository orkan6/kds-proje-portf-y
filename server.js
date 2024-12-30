const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();

// MySQL bağlantısı
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'kds_proje',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Varlık ara 
router.get('/api/search', async (req, res) => {
    try {
        const searchTerm = req.query.q.toLowerCase();
        console.log('Aranan terim:', searchTerm);
        
        // SP500 ara
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

        // Emtia
        const [commodities] = await pool.query(`
            SELECT * 
            FROM commodity_futures 
            WHERE Date = (
                SELECT MAX(Date) 
                FROM commodity_futures
            )
        `);

        // Emtia filtrele
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

        console.log('Bulunan hisseler:', stocks);
        console.log('Bulunan emtialar:', commodityList);

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
router.post('/api/portfolios', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        
        if (!req.body.portfolio_name || !req.body.initial_value) {
            throw new Error('Portföy adı ve başlangıç değeri zorunludur');
        }

        await connection.beginTransaction();

        // Ana portföy kaydı
        const [portfolio] = await connection.query(
            `INSERT INTO portfolios (portfolio_name, initial_value, creation_date) 
             VALUES (?, ?, CURDATE())`,
            [req.body.portfolio_name, req.body.initial_value]
        );

        const portfolioId = portfolio.insertId;
        console.log('Portföy ID:', portfolioId); 

        // Portföy detaylarını ekle
        if (req.body.assets && req.body.assets.length > 0) {
            for (const asset of req.body.assets) {
                
                if (!asset.type || !asset.symbol || !asset.quantity || !asset.weight || !asset.price) {
                    throw new Error('Eksik varlık bilgisi');
                }

                const params = [
                    portfolioId,
                    asset.type,
                    asset.symbol,
                    asset.quantity,
                    asset.weight,
                    asset.price
                ];

                console.log('SQL parametreleri:', params); 

                await connection.query(`
                    INSERT INTO portfolio_details 
                    (portfolio_id, asset_type, asset_symbol, quantity, weight, purchase_price, purchase_date) 
                    VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
                    params
                );
            }
        }

        await connection.commit();
        res.json({ success: true, portfolio_id: portfolioId });

    } catch (error) {
        await connection.rollback();
        console.error('HATA:', error);
        res.status(500).json({ 
            error: 'Portföy oluşturulamadı', 
            details: error.message 
        });
    } finally {
        connection.release();
    }
});


router.get('/api/portfolios', async (req, res) => {
    try {
       
        const [results] = await pool.query(`
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

        
        const portfolioMap = new Map();
        
        results.forEach(row => {
            if (!portfolioMap.has(row.portfolio_id)) {
                portfolioMap.set(row.portfolio_id, {
                    ...row,
                    portfolio_details: []
                });
            }
            
            if (row.detail_id) {
                const portfolio = portfolioMap.get(row.portfolio_id);
                portfolio.portfolio_details.push({
                    detail_id: row.detail_id,
                    asset_type: row.asset_type,
                    asset_symbol: row.asset_symbol,
                    quantity: row.quantity,
                    weight: row.weight,
                    purchase_price: row.purchase_price,
                    purchase_date: row.purchase_date
                });
            }
        });

        const portfolios = Array.from(portfolioMap.values());
        console.log('Portföyler:', portfolios);
        res.json(portfolios);

    } catch (error) {
        console.error('Portföy getirme hatası:', error);
        res.status(500).json({ 
            error: 'Portföyler getirilirken bir hata oluştu',
            details: error.message 
        });
    }
});

module.exports = router; 