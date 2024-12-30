const express = require('express');
const path = require('path');
const { pool } = require('./db/connection');
const assetsRouter = require('./routes/assets');

const app = express();
const PORT = process.env.PORT || 3001;


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(express.static(path.join(__dirname)));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/public', express.static(path.join(__dirname, 'public')));


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'anasayfa.html'));
});

app.get('/anasayfa.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'anasayfa.html'));
});

app.get('/portfoy_olustur.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'portfoy_olustur.html'));
});

app.get('/analiz.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'analiz.html'));
});

app.get('/optimizasyon.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'optimizasyon.html'));
});


app.use('/api', assetsRouter);


async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('Veritabanı bağlantısı başarılı');
        connection.release();
    } catch (error) {
        console.error('Veritabanı bağlantı hatası:', error);
        process.exit(1);
    }
}


app.use((req, res) => {
    console.log('404 - Route bulunamadı:', req.url);
    res.status(404).json({ error: 'Sayfa bulunamadı' });
});


app.use((err, req, res, next) => {
    console.error('Sunucu hatası:', err);
    res.status(500).json({ 
        error: 'Sunucu hatası',
        message: err.message 
    });
});


const server = app.listen(PORT, async () => {
    await testConnection();
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});


server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} kullanımda. Farklı bir port deneyin.`);
        process.exit(1);
    }
    console.error('Sunucu hatası:', error);
});

process.on('unhandledRejection', (err) => {
    console.error('Yakalanmamış Promise hatası:', err);
});

module.exports = app; 
