// Tarih işlemleri
const getPeriodDays = (period) => {
    switch (period) {
        case '1M': return 21;    // 1 aylık trading günü
        case '3M': return 63;    // 3 aylık trading günü
        case '6M': return 126;   // 6 aylık trading günü
        case '1Y': return 252;   // 1 yıllık trading günü
        case '3Y': return 756;   // 3 yıllık trading günü (252 * 3)
        default: return 756;     // Varsayılan olarak 3 yıl
    }
};

module.exports = {
    getPeriodDays
}; 