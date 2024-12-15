const mysql = require('mysql2/promise');

// Veritabanı bağlantı havuzu oluştur
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'kds_proje',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Query fonksiyonu
async function query(sql, params = []) {
    try {
        const [rows] = await pool.execute(sql, params);
        return rows;
    } catch (err) {
        throw err;
    }
}

// Test sorgusu ekleyelim
async function testConnection() {
    try {
        const result = await query('SELECT 1 + 1 as test');
        console.log('Veritabanı bağlantı testi başarılı:', result);
        return true;
    } catch (err) {
        console.error('Veritabanı bağlantı testi başarısız:', err);
        return false;
    }
}

// Bağlantıyı test et
testConnection();

module.exports = {
    pool,
    query,
    testConnection
}; 