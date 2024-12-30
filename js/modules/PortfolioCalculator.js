class PortfolioCalculator {
    static calculateReturns(prices) {
        if (!prices || prices.length < 2) return [];
        
        const dailyReturns = prices.slice(1).map((price, i) => {
            const prevPrice = prices[i];
            if (prevPrice <= 0) {
                console.warn('Sıfır veya negatif fiyat tespit edildi:', prevPrice);
                return 0;
            }
            return (price - prevPrice) / prevPrice;
        });

        return dailyReturns;
    }

    static calculateExpectedReturn(returns) {
        if (!returns || returns.length === 0) return 0;
        
        // Günlük ortalama getiri
        const avgDailyReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        
        // Yıllıklandırılmış beklenen getiri
        const annualizedReturn = Math.pow(1 + avgDailyReturn, 252) - 1;
        
        console.log('Ortalama günlük getiri:', avgDailyReturn);
        console.log('Yıllıklandırılmış beklenen getiri:', annualizedReturn);
        
        return annualizedReturn;
    }

    static calculateCovariance(returns1, returns2) {
        if (!returns1 || !returns2 || returns1.length !== returns2.length || returns1.length < 2) {
            return 0;
        }

        const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
        const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

        let covariance = 0;
        for (let i = 0; i < returns1.length; i++) {
            covariance += (returns1[i] - mean1) * (returns2[i] - mean2);
        }

        return (covariance / (returns1.length - 1)) * 252; // Yıllıklandırılmış
    }

    static calculateVariance(returns) {
        if (!returns || returns.length < 2) return 0;
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        return returns.reduce((sum, ret) => 
            sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    }

    static calculatePortfolioRisk(weights, covariance) {
        if (!weights || !covariance || weights.length === 0) {
            return 0;
        }

        let risk = 0;
        const n = weights.length;

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                risk += weights[i] * weights[j] * covariance[i][j];
            }
        }

        return Math.sqrt(Math.max(0, risk));
    }

    static calculatePortfolioReturn(weights, expectedReturns) {
        if (!weights || !expectedReturns || weights.length !== expectedReturns.length) {
            return 0;
        }
        return weights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);
    }
}

// Global scope'a ekle
window.PortfolioCalculator = PortfolioCalculator; 