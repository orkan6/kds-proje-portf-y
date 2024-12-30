export class ErrorHandler {
    static handle(error, context) {
        console.error(`${context} hatası:`, error);
        
        let userMessage = 'Bir hata oluştu';
        
        if (error.name === 'NetworkError') {
            userMessage = 'Sunucu bağlantısında hata oluştu. Lütfen internet bağlantınızı kontrol edin.';
        } else if (error.response?.status === 404) {
            userMessage = 'İstenen kaynak bulunamadı';
        } else if (error.response?.status === 500) {
            userMessage = 'Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.';
        }

        // Toast veya modal göster
        this.showError(userMessage);
    }

    static showError(message) {
        // Burada toast veya modal gösterimi yapılabilir
        alert(message); // Şimdilik basit alert kullanalım
    }
} 