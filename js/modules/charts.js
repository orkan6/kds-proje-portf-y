// Grafik işlemleri için ayrı bir modül
export class PerformanceChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.chart = null;
    }

    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    update(data) {
        this.destroy();
        if (!this.canvas || !data.portfolio_details) return;

        const ctx = this.canvas.getContext('2d');
        const { portfolioData, benchmarkData } = this._prepareChartData(data);

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Portföy Performansı',
                        data: portfolioData,
                        borderColor: '#4CAF50',
                        tension: 0.1,
                        fill: false,
                        pointRadius: 0
                    },
                    {
                        label: 'S&P 500',
                        data: benchmarkData,
                        borderColor: '#2196F3',
                        tension: 0.1,
                        fill: false,
                        pointRadius: 0,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: this._getChartOptions()
        });
    }

    _prepareChartData(data) {
        // Portföy performansını hesapla
        const portfolioData = this._calculatePortfolioPerformance(data.portfolio_details);
        
        // Benchmark (S&P 500) performansını al
        const benchmarkData = this._calculateBenchmarkPerformance(data.market_data);

        return { portfolioData, benchmarkData };
    }

    _calculatePortfolioPerformance(assets) {
        const performanceData = [];
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);

        // Her gün için portföy değerini hesapla
        for (let d = new Date(startDate); d <= new Date(); d.setDate(d.getDate() + 1)) {
            let portfolioValue = 0;
            assets.forEach(asset => {
                const price = this._getAssetPriceOnDate(asset, d);
                portfolioValue += price * asset.quantity;
            });

            performanceData.push({
                x: new Date(d),
                y: portfolioValue
            });
        }

        // Baz 100'e normalize et
        const initialValue = performanceData[0].y;
        return performanceData.map(point => ({
            x: point.x,
            y: (point.y / initialValue) * 100
        }));
    }

    _calculateBenchmarkPerformance(marketData) {
        if (!marketData?.prices) return [];

        // Baz 100'e normalize et
        const initialValue = marketData.prices[0];
        return marketData.dates.map((date, i) => ({
            x: new Date(date),
            y: (marketData.prices[i] / initialValue) * 100
        }));
    }

    _getAssetPriceOnDate(asset, date) {
        const priceHistory = asset.price_history || [];
        const pricePoint = priceHistory.find(p => 
            new Date(p.date).toDateString() === date.toDateString()
        );
        return pricePoint ? pricePoint.price : asset.purchase_price;
    }

    _getChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Portföy Performans Karşılaştırması (Baz 100)'
                },
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'month',
                        displayFormats: {
                            month: 'MMM yyyy'
                        },
                        tooltipFormat: 'dd MMM yyyy'
                    },
                    title: {
                        display: true,
                        text: 'Tarih'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Performans (Baz 100)'
                    },
                    ticks: {
                        callback: value => value.toFixed(0)
                    }
                }
            }
        };
    }

    _getRandomColor() {
        const colors = [
            '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63',
            '#00BCD4', '#FFC107', '#3F51B5', '#795548', '#607D8B'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
} 