class ChartManager {
    static charts = {};

    
    static updateAnalysisPerformanceChart(chartId, performanceData) {
        const ctx = document.getElementById(chartId)?.getContext('2d');
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) {
            existingChart.destroy();
        }

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: performanceData.dates,
                datasets: [
                    {
                        label: 'Portföy Performansı',
                        data: performanceData.portfolio,
                        borderColor: '#4CAF50',
                        tension: 0.1,
                        fill: false,
                        pointRadius: 0
                    },
                    {
                        label: 'S&P 500',
                        data: performanceData.market,
                        borderColor: '#2196F3',
                        tension: 0.1,
                        fill: false,
                        pointRadius: 0,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Portföy Performans Karşılaştırması (Baz 100)'
                    },
                    legend: {
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
                            }
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
            }
        });
    }

    
    static updateSimulationPerformanceChart(chartId, data) {
        const ctx = document.getElementById(chartId);
        if (!ctx) return;

        const labels = data.dates || Array.from(Array(data.portfolio.length).keys());

        const existingChart = Chart.getChart(ctx);
        if (existingChart) {
            existingChart.destroy();
        }

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Portföy',
                        data: data.portfolio,
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        borderWidth: 2,
                        fill: true
                    },
                    {
                        label: 'Piyasa',
                        data: data.market,
                        borderColor: '#2196F3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        borderWidth: 2,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Performans Karşılaştırması'
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Zaman'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Değer'
                        }
                    }
                }
            }
        });
    }

    static updateAllocationChart(chartId, data) {
        const ctx = document.getElementById(chartId)?.getContext('2d');
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) {
            existingChart.destroy();
        }

        const percentageValues = data.values.map(value => value * 100);

        return new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.labels,
                datasets: [{
                    data: percentageValues,
                    backgroundColor: this.getChartColors(data.values.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                return `${label}: %${value.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    static getChartColors(count) {
        const colors = [
            '#2563eb', '#dc2626', '#059669', '#d97706', 
            '#7c3aed', '#db2777', '#2dd4bf', '#84cc16'
        ];
        return colors.slice(0, count);
    }

    static getChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { font: { size: 11 } }
                }
            }
        };
    }

    static resetAllCharts() {
        const chartIds = [
            'allocationChart',
            'efficientFrontierChart',
            'correlationHeatmap',
            'simulationChart'
        ];

        chartIds.forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas) {
                const existingChart = Chart.getChart(canvas);
                if (existingChart) {
                    existingChart.destroy();
                }
                
                const newCanvas = document.createElement('canvas');
                newCanvas.id = id;
                canvas.parentNode.replaceChild(newCanvas, canvas);
            }
        });
    }

    static updateEfficientFrontierChart(chartId, efficientFrontier) {
        const ctx = document.getElementById(chartId)?.getContext('2d');
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) {
            existingChart.destroy();
        }

        const data = efficientFrontier.points.map(point => ({
            x: point.risk * 100,
            y: point.return_ * 100
        }));

        return new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Etkin Sınır',
                    data: data,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    pointRadius: 3,
                    showLine: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Risk (%)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(2) + '%';
                            }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Getiri (%)'
                        },
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(2) + '%';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Risk: ${context.parsed.x.toFixed(2)}%, Getiri: ${context.parsed.y.toFixed(2)}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    static updateSectorChart(chartId, sectorData) {
        const ctx = document.getElementById(chartId)?.getContext('2d');
        if (!ctx) return;

        const existingChart = Chart.getChart(ctx);
        if (existingChart) {
            existingChart.destroy();
        }

        
        const percentageValues = sectorData.values.map(value => value * 100);

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sectorData.labels,
                datasets: [{
                    data: percentageValues,
                    backgroundColor: this.getChartColors(sectorData.values.length)
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                return `${label}: %${value.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    static updatePerformanceChart(canvasId, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        
        const labels = data.dates || Array.from(Array(data.portfolio.length).keys());

        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        this.charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Portföy',
                        data: data.portfolio,
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.1)',
                        borderWidth: 2,
                        fill: true
                    },
                    {
                        label: 'Piyasa',
                        data: data.market,
                        borderColor: '#2196F3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        borderWidth: 2,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Performans Karşılaştırması'
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Zaman'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Değer'
                        }
                    }
                }
            }
        });
    }
}

window.ChartManager = ChartManager; 