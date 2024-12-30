const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');

router.get('/', async (req, res) => {
    try {
        const searchTerm = req.query.q?.toLowerCase();
        if (!searchTerm) {
            return res.json({ stocks: [], commodities: [] });
        }

        
        const stocks = await query(`
            SELECT Symbol, Shortname, Currentprice 
            FROM sp500_companies 
            WHERE LOWER(Symbol) LIKE ? OR LOWER(Shortname) LIKE ?
            LIMIT 10
        `, [`%${searchTerm}%`, `%${searchTerm}%`]);

        
        const commodities = await query(`
            SELECT * FROM commodity_futures 
            WHERE Date = (SELECT MAX(Date) FROM commodity_futures)
        `);

        res.json({ stocks, commodities: commodities[0] });
    } catch (err) {
        console.error('Arama hatası:', err);
        res.status(500).json({ error: 'Arama yapılırken hata oluştu' });
    }
});

module.exports = router; 