# 代码生成器模块文档（Codegen）

> **代码行数**: 442 | **文件数**: 4 | **最后更新**: 2026-08-02

---

## 一、模块定位

`aiops/codegen/` 是从数据库表自动生成 CRUD 代码的开发工具。选择表 → 预览代码 → 下载 zip。

---

## 二、文件结构

```
aiops/codegen/
├── router/
│   └── code_generator.py  ← API: /admin/codegen/tables /preview /download
├── service/
│   └── code_generator_service.py  ← 读表结构 + Jinja2 渲染
├── schemas/
│   └── code_generator_schemas.py  ← Pydantic
└── templates/             ← Jinja2 模板（6个）
```

---

## 三、核心方法

| API | 说明 |
|-----|------|
| `GET /admin/codegen/tables` | 列出数据库中所有表 |
| `POST /admin/codegen/preview` | 预览生成代码 |
| `POST /admin/codegen/download` | 下载 zip 包 |

---

## 四、使用方式

1. 启动后端 → `http://127.0.0.1:2029/docs` 调 codegen API
2. 或前端 `/#/codegen` → 选表 → 预览 → 下载 zip
3. 解压放入对应目录，`main.py` 注册路由

---

## 五、Update 方法规范

```python
# ✅ 正确：逐字段显式赋值
async def update_xxx(db, param):
    record = await get_xxx_by_id(db, param.id)
    record.name = param.name
    if param.remark is not None:
        record.remark = param.remark
    await db.commit()

# ❌ 错误：setattr 遍历覆盖隐藏字段
update_fields = param.model_dump(exclude={"id"}, exclude_unset=True)
for k, v in update_fields.items():
    setattr(record, k, v)
```
