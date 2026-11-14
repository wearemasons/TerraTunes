# Deploying to Render

One web service. The Dockerfile builds the site with bun and the API with uv, then
FastAPI serves frontend/dist from the same origin, so the browsers /api/* calls need
no proxy and no allowed-origin list.

Dashboard: New Web Service, connect wearemasons/TerraTunes, branch main,
Environment = Docker, DockerfilePath = ./Dockerfile, Health Check Path = /healthz.
Or push this file and Render reads render.yaml.

Environment: TERRATUNES_DATA_DIR=/srv/app/backend/data, PYTHONUNBUFFERED=1.
The image listens on 8000 and Render maps its internal port to EXPOSE 8000.

Track grids, about 20 MB, are baked into the image. The recorded Orchestra notes are
fetched on demand with python -m app.cli samples; attach a disk at
/srv/app/backend/data/samples so they are not re-downloaded on restart.

The free plan sleeps when idle, so the first request after a wait takes a few seconds.
After deploy check /healthz, /api/tracks and a deep link such as /scan.
