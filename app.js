const express = require('express');
const path = require('path');
const app = express();

// Middleware'ler
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Debug için log middleware'i
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Ana sayfa route'ları
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'anasayfa.html'));
});

app.get('/portfoy_olustur.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'portfoy_olustur.html'));
});

// API route'ları
const searchRouter = require('./routes/search');
const assetsRouter = require('./routes/assets');

// Route'ları düzenle
app.use('/api/search', searchRouter);
app.use('/api', assetsRouter);  // Tüm portföy işlemleri buradan geçecek

// 404 handler
app.use((req, res) => {
    console.log('404 - Route bulunamadı:', req.url);
    res.status(404).json({ error: 'Sayfa bulunamadı' });  // JSON yanıt döndür
});

// Server'ı başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server http://localhost:${PORT} adresinde çalışıyor...`);
}); 
