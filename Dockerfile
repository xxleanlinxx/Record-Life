FROM python:3.11-slim
WORKDIR /app
COPY requirements-core.txt requirements-api.txt ./
RUN pip install --no-cache-dir -r requirements-api.txt
COPY core ./core
COPY api ./api
COPY sql ./sql
RUN useradd --create-home app && mkdir /data && chown app:app /data
USER app
ENV RECORD_LIFE_DB=/data/record_life.duckdb RECORD_LIFE_HOST=0.0.0.0 PORT=8000
VOLUME /data
EXPOSE 8000
CMD ["python", "-m", "api.serve"]
