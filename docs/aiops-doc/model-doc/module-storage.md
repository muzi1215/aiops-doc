# 统一存储模块文档（Storage）

> **代码行数**: 653 | **文件数**: 9 | **最后更新**: 2026-08-02

---

## 一、全景架构

```
业务调用方（备份云端同步 / OSS管理页面 / COS管理页面）
  │
  ├── 通用操作: storage/service.py        (upload/download/exists/delete/get_url/list_objects/head_object/get_bytes)
  │      → get_backend("oss"/"cos") → StorageBackend 实例 → asyncio.to_thread(同步底层)
  │
  ├── OSS 专用: storage/service_oss.py    (oss_list_objects/oss_head/oss_get_bytes/oss_upload/oss_download_stream)
  │      → 内置 OSS 配置 (_OSS_KWARGS)，调用方无需传 bucket/ak/sk/region
  │
  ├── COS 专用: storage/service_cos.py    (cos_list_objects/cos_head/cos_get_bytes/cos_upload/cos_download_stream)
  │      → 内置 COS 配置 (_COS_KWARGS)
  │
  └── 共享工具: storage/util.py           (sftp_fetch_remote_file — 远程文件 SFTP 拉取)
  │
  ▼
storage/base.py（底层 SDK 封装 — 纯同步）
  ├── StorageBackend ABC  ← 定义接口: upload/download/exists/delete/get_url/get_bytes/list_objects/head_object
  ├── LocalBackend        ← shutil 本地文件
  ├── OSSBackend          ← alibabacloud_oss_v2 SDK
  └── COSBackend          ← qcloud_cos SDK

storage/registry.py（工厂模式）
  _BACKEND_REGISTRY = {"local": LocalBackend, "oss": OSSBackend, "cos": COSBackend}
  get_backend("oss", **overrides) → OSSBackend 实例
  register_backend("minio", MinioBackend)  ← 扩展入口
```

---

## 二、文件结构

```
aiops/storage/
├── __init__.py          ← 模块入口，导出全部公开函数
├── base.py       (370行)← StorageBackend ABC + LocalBackend + OSSBackend + COSBackend
├── registry.py    (54行)← 后端注册表，get_backend() / register_backend()
├── service.py    (100行)← 通用异步包装层，asyncio.to_thread 调用同步底层
├── service_oss.py (87行)← ★ OSS 专用管理服务（内置 OSS 配置）
├── service_cos.py (79行)← ★ COS 专用管理服务（内置 COS 配置）
├── util.py        (63行)← ★ 共享 SFTP 远程文件拉取
└── config.py      (28行)← 读 .env 配置
```

---

## 三、核心方法速查

### StorageBackend ABC（`base.py:23`）

| 方法 | 签名 | 说明 |
|------|------|------|
| `upload` | `(local_path, key) → str` | 上传，返回 URL |
| `download` | `(key, local_path) → str` | 下载到本地 |
| `exists` | `(key) → bool` | 是否存在 |
| `delete` | `(key) → bool` | 删除 |
| `get_url` | `(key) → str` | 公开 URL |
| `get_bytes` | `(key) → bytes` | 文件内容（有默认实现） |
| `list_objects` | `(prefix, max_keys, marker) → dict` | 列举对象 |
| `head_object` | `(key) → dict` | 元信息 |

### 通用异步包装（`service.py`）

| 函数 | 说明 |
|------|------|
| `upload_file(local_path, key, storage_type, **kwargs)` | 异步上传 |
| `download(key, local_path, storage_type, **kwargs)` | 异步下载 |
| `exists(key, storage_type, **kwargs)` | 异步存在检查 |
| `delete(key, storage_type, **kwargs)` | 异步删除 |
| `get_url(key, storage_type, **kwargs)` | 获取 URL |
| `list_objects(prefix, max_keys, marker, storage_type, **kwargs)` | 异步列举 |
| `head_object(key, storage_type, **kwargs)` | 异步元信息 |
| `get_object_bytes(key, storage_type, **kwargs)` | 异步读 bytes |

### OSS 专用（`service_oss.py` — 内置 OSS 配置）

| 函数 | 说明 |
|------|------|
| `oss_list_objects(prefix, max_keys, marker)` | 列举 OSS 文件 |
| `oss_head_object(key)` | OSS 元信息 |
| `oss_get_object_bytes(key)` | OSS 读 bytes |
| `oss_upload_file(local_path, key)` | OSS 上传 |
| `oss_download_stream(key) → AsyncGenerator` | OSS 流式下载 |
| `oss_is_configured() → bool` | OSS 是否配置 |
| `oss_config_info() → dict` | OSS 配置信息 |

### COS 专用（`service_cos.py` — 内置 COS 配置）

同上，函数名 `cos_` 前缀。

---

## 四、完整调用链

### 4.1 备份云端同步

```
database_backup_sync.py:141  sync_backup_to_cloud()
  │
  └── get_backend("oss", bucket=rep.bucket, endpoint=rep.endpoint, ...)
        → registry.py:29  → 查 _BACKEND_REGISTRY["oss"] → OSSBackend(**overrides)
        → base.py:122  OSSBackend.__init__()
          ├── self._ak_id = access_key_id or OSS_ACCESS_KEY_ID     ← .env
          ├── self._bucket = bucket or STORAGE_OSS_BUCKET          ← .env
          └── ...

  → asyncio.to_thread(backend.upload, local_file, cloud_key)
    → base.py:160  OSSBackend.upload()
      → self._get_client()
        → alibabacloud_oss_v2 客户端（延迟导入）
      → client.put_object(PutObjectRequest(bucket, key, body=data))
      → return self.get_url(key)
        → https://{bucket}.oss-{region}.aliyuncs.com/{key}
```

### 4.2 OSS 管理页面列举文件

```
前端 GET /admin/aliyunOss/list?prefix=backup/

aliyun_oss.py — Router 薄层，只做参数校验
  → oss_list_objects(prefix, max_keys, marker)            service_oss.py:24
    → get_backend("oss", **_OSS_KWARGS)                   registry.py:29
      (_OSS_KWARGS 内置了 bucket/ak/sk/region — 调用方不用传)
    → asyncio.to_thread(backend.list_objects, prefix, max_keys, marker)
      → base.py:238  OSSBackend.list_objects()
        → client.list_objects(ListObjectsRequest(bucket, prefix, max_keys, marker))
        → 格式化返回: {"objects": [{key, size, last_modified, etag}, ...], "next_marker": ..., "is_truncated": ...}
  → 返回给前端 JSON
```

### 4.3 COS 管理页面下载文件

```
前端 GET /admin/tencentCos/downloadByKey?cos_key=backup/mysql/db/file.tar.gz

tencent_cos.py:57  tencent_cos_download_by_key()
  → cos_get_object_bytes(cos_key)                         service_cos.py:21
    → get_backend("cos", **_COS_KWARGS)
    → asyncio.to_thread(backend.get_bytes, cos_key)
      → base.py:53  StorageBackend.get_bytes() (默认实现)
        → 临时文件 → download → read → 返回 bytes → 清理临时文件
  → StreamingResponse(iter([data]), ...)  返回给浏览器
```

### 4.4 SFTP 远程文件拉取

```
aliyun_oss.py:_oss_sftp_prepare()  /  tencent_cos.py:_cos_sftp_prepare()
  │
  └── sftp_fetch_remote_file(host, cred, remote_path)     storage/util.py:17
        ├── decrypt_field(cred.password)                   crypto_util 解密 SSH 密码
        ├── 尝试 RSAKey/Ed25519Key/ECDSAKey 解析私钥
        ├── paramiko SSH 连接
        │     ├── 有私钥: ssh.connect(hostname, port, username, pkey=...)
        │     └── 有密码: ssh.connect(hostname, port, username, password=...)
        ├── sftp.stat(remote_path)    确认远程文件存在
        ├── tempfile.NamedTemporaryFile  → 本地临时文件
        ├── sftp.get(remote_path, temp_file)  拉取
        └── return temp_file        ← 调用方负责 os.unlink 清理
```

---

## 五、OSS/COS URL 生成逻辑

### OSS（`base.py:201`）

```python
def get_url(self, key):
    if self._endpoint:
        # 自定义 endpoint（私有云/内网）
        return f"https://{self._bucket}.{self._endpoint}/{key}"
    # 公网标准域名
    return f"https://{self._bucket}.oss-{self._region}.aliyuncs.com/{key}"
```

### COS（`base.py:320`）

```python
def get_url(self, key):
    return f"https://{self._bucket}.cos.{self._region}.myqcloud.com/{key}"
```

---

## 六、如何新增存储后端（MinIO 示例）

```python
# ① 实现 StorageBackend 子类
from aiops.storage.base import StorageBackend

class MinioBackend(StorageBackend):
    target_type = "minio"
    def __init__(self, bucket="", endpoint="", access_key_id="", access_key_secret=""):
        from minio import Minio
        self._client = Minio(endpoint, access_key_id, access_key_secret, secure=False)
        self._bucket = bucket

    def upload(self, local_path, key):
        self._client.fput_object(self._bucket, key, local_path)
        return f"http://{self._endpoint}/{self._bucket}/{key}"

    def exists(self, key):
        try: self._client.stat_object(self._bucket, key); return True
        except: return False
    # ... download/delete/get_url/list_objects/head_object 同理

# ② 注册
from aiops.storage.registry import register_backend
register_backend("minio", MinioBackend)

# ③ 使用
backend = get_backend("minio", endpoint="http://minio:9000", bucket="aiops", ...)
```

---

## 七、环境变量

| 变量 | 用途 | 文件 |
|------|------|------|
| `STORAGE_TYPE` | 默认存储类型 | `storage/config.py` |
| `STORAGE_LOCAL_ROOT` | 本地存储根目录 | `storage/config.py` |
| `STORAGE_OSS_BUCKET` | OSS 通用 Bucket | `storage/config.py` |
| `STORAGE_COS_BUCKET` | COS 通用 Bucket | `storage/config.py` |
| `OSS_ACCESS_KEY_ID/SECRET` | OSS AK/SK | `config/aliyun_oss_config.py` |
| `COS_SECRET_ID/KEY` | COS AK/SK | `config/cos_config.py` |
