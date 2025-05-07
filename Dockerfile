FROM python:3.8-slim

# Sistem bağımlılıklarını yükle (tkinter dahil)
RUN apt-get update && apt-get install -y \
    python3-tk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Gereksinimleri kopyala ve yükle
COPY python-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Uygulama kodunu kopyala
COPY python-service/ .

# Uygulama portunu dışa aç
EXPOSE 8000

# Uygulamayı başlat
CMD ["uvicorn", "chat_service:app", "--host", "0.0.0.0", "--port", "8000"]
