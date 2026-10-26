import os
from pathlib import Path

import boto3

APP_ENV = os.environ.get("APP_ENV", "production").lower()
STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "local" if APP_ENV == "development" else "s3").lower()
LOCAL_STORAGE_DIR = Path(os.environ.get("LOCAL_STORAGE_DIR", "/data/uploads")).resolve()
S3_BUCKET = os.environ.get("S3_BUCKET", "").strip()
_client = None


def init_storage():
    global _client
    if STORAGE_BACKEND == "local":
        if APP_ENV == "production":
            raise RuntimeError("Local file storage is not supported in production; configure S3 storage")
        LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
        return
    if STORAGE_BACKEND != "s3":
        raise RuntimeError("STORAGE_BACKEND must be either 'local' or 's3'")
    if not S3_BUCKET:
        raise RuntimeError("S3_BUCKET is required when STORAGE_BACKEND=s3")
    _client = boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
        region_name=os.environ.get("S3_REGION") or "auto",
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY_ID") or None,
        aws_secret_access_key=os.environ.get("S3_SECRET_ACCESS_KEY") or None,
    )


def _local_path(path: str) -> Path:
    target = (LOCAL_STORAGE_DIR / path).resolve()
    if not target.is_relative_to(LOCAL_STORAGE_DIR):
        raise ValueError("Invalid storage path")
    return target


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if STORAGE_BACKEND == "local":
        target = _local_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return {"path": path}
    if _client is None:
        init_storage()
    _client.put_object(Bucket=S3_BUCKET, Key=path, Body=data, ContentType=content_type)
    return {"path": path}


def get_object(path: str):
    if STORAGE_BACKEND == "local":
        return _local_path(path).read_bytes(), "application/octet-stream"
    if _client is None:
        init_storage()
    result = _client.get_object(Bucket=S3_BUCKET, Key=path)
    return result["Body"].read(), result.get("ContentType", "application/octet-stream")
