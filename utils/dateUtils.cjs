// Tarih işlemleri
const getPeriodDays = (period) => {
    const periodMap = {
        '1M': 21,
        '3M': 63,
        '6M': 126,
        '1Y': 252
    };
    return periodMap[period];
};

module.exports = { getPeriodDays }; 