"""ContactBook API: browser-isolated address books and Excel interchange."""
import io
import json
import os
from pathlib import Path
import secrets
import sqlite3
import zipfile

from flask import Flask, jsonify, request, send_file, send_from_directory, session
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from werkzeug.exceptions import HTTPException

HEADERS = ['姓名', '收藏', '手机号', '邮箱', '社交账号', '通讯地址', '备注']
FIELDS = ['phones', 'emails', 'socials', 'addresses']


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('联系人必须为对象')
    result = {}
    for key in ['name', 'notes']:
        value = data.get(key, '')
        if not isinstance(value, str) or len(value) > (100 if key == 'name' else 2000):
            raise ValueError('姓名最多100字，备注最多2000字')
        result[key] = value.strip()
    if not result['name']:
        raise ValueError('姓名不能为空')
    if type(data.get('favorite', False)) is not bool:
        raise ValueError('收藏状态必须为布尔值')
    result['favorite'] = data.get('favorite', False)
    for key in FIELDS:
        values = data.get(key, [])
        if not isinstance(values, list) or len(values) > 20:
            raise ValueError('每类联系方式最多20条')
        if any(not isinstance(v, str) or len(v) > 300 or '\n' in v or '\r' in v for v in values):
            raise ValueError('每条联系方式最多300字，不能包含换行')
        result[key] = list(dict.fromkeys(v.strip() for v in values if v.strip()))
    return result


def create_app(test_config=None):
    app = Flask(__name__)
    data_dir = Path(os.environ.get('DATA_DIR', Path(__file__).parent / 'data'))
    data_dir.mkdir(parents=True, exist_ok=True)
    secret_path = data_dir / 'session-secret'
    if not secret_path.exists():
        try:
            with secret_path.open('x') as f:
                f.write(secrets.token_hex(32))
            secret_path.chmod(0o600)
        except FileExistsError:
            pass
    app.config.update(SECRET_KEY=secret_path.read_text(), DATABASE=str(data_dir / 'contacts.db'),
                      MAX_CONTENT_LENGTH=3 * 1024 * 1024, SESSION_COOKIE_HTTPONLY=True,
                      SESSION_COOKIE_SAMESITE='Lax', SESSION_COOKIE_SECURE=os.environ.get('COOKIE_SECURE') == '1',
                      FRONTEND=str(Path(__file__).resolve().parent.parent / 'contactbook-frontend'))
    if test_config:
        app.config.update(test_config)
    with sqlite3.connect(app.config['DATABASE']) as db:
        db.execute('CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY, owner TEXT NOT NULL, body TEXT NOT NULL)')

    def connection():
        return sqlite3.connect(app.config['DATABASE'])

    @app.before_request
    def protect():
        if 'owner' not in session:
            session['owner'] = secrets.token_hex(24)
            session.permanent = True
        if request.method in ['POST', 'PUT', 'DELETE']:
            if request.headers.get('X-Requested-With') != 'ContactBook':
                return jsonify(error='请求来源无效'), 403

    @app.errorhandler(ValueError)
    def bad_input(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error='文件不能超过3 MB' if error.code == 413 else error.description), error.code

    @app.get('/api/contacts')
    def contacts():
        with connection() as db:
            rows = db.execute('SELECT id, body FROM contacts WHERE owner=? ORDER BY id DESC', (session['owner'],)).fetchall()
        return jsonify([dict(json.loads(body), id=cid) for cid, body in rows])

    @app.post('/api/contacts')
    def add():
        item = validate(request.get_json())
        with connection() as db:
            cursor = db.execute('INSERT INTO contacts(owner, body) VALUES (?,?)', (session['owner'], json.dumps(item)))
        return jsonify(dict(item, id=cursor.lastrowid)), 201

    @app.route('/api/contacts/<int:cid>', methods=['PUT', 'DELETE'])
    def change(cid):
        with connection() as db:
            if request.method == 'DELETE':
                cursor = db.execute('DELETE FROM contacts WHERE id=? AND owner=?', (cid, session['owner']))
            else:
                item = validate(request.get_json())
                cursor = db.execute('UPDATE contacts SET body=? WHERE id=? AND owner=?', (json.dumps(item), cid, session['owner']))
            if not cursor.rowcount:
                return jsonify(error='联系人不存在'), 404
        return jsonify(ok=True)

    @app.get('/api/export')
    @app.get('/api/template')
    def export():
        wb = Workbook()
        ws = wb.active
        ws.title = '通讯录'
        ws.append(HEADERS)
        if request.path.endswith('export'):
            with connection() as db:
                items = db.execute('SELECT body FROM contacts WHERE owner=? ORDER BY id', (session['owner'],)).fetchall()
            for (body,) in items:
                c = json.loads(body)
                ws.append([c['name'], '是' if c['favorite'] else '否', *['\n'.join(c[k]) for k in FIELDS], c['notes']])
        for row in ws:
            for cell in row:
                # Untrusted contact text must never become an Excel formula.
                if isinstance(cell.value, str):
                    cell.data_type = 's'
        for cell in ws[1]:
            cell.font = Font(bold=True, color='FFFFFF')
            cell.fill = PatternFill('solid', fgColor='216E61')
        for col in 'ABCDEFG':
            ws.column_dimensions[col].width = 28
        ws.freeze_panes = 'A2'
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return send_file(output, as_attachment=True, download_name='contacts.xlsx', mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    @app.post('/api/import')
    def import_excel():
        uploaded = request.files.get('file')
        if not uploaded or not uploaded.filename.lower().endswith('.xlsx'):
            raise ValueError('请选择 .xlsx 文件')
        raw = uploaded.read()
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                if sum(i.file_size for i in archive.infolist()) > 20 * 1024 * 1024:
                    raise ValueError('Excel 解压后不能超过20 MB')
            wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=False)
        except (zipfile.BadZipFile, KeyError, OSError, SyntaxError) as error:
            raise ValueError('文件不是有效的 Excel 工作簿') from error
        pending = []
        try:
            rows = wb.active.iter_rows(values_only=True)
            if list(next(rows, [])) != HEADERS:
                raise ValueError('表头不符合模板，请先下载模板')
            for number, row in enumerate(rows, 2):
                if number > 1001:
                    raise ValueError('每次最多导入1000行')
                if all(v is None for v in row):
                    continue
                if len(row) != 7:
                    raise ValueError(f'第{number}行必须有7列')
                if any(v is not None and not isinstance(v, str) for v in row):
                    raise ValueError(f'第{number}行请使用文本格式，尤其是电话列')
                values = [v or '' for v in row]
                if values[1] not in ['是', '否']:
                    raise ValueError(f'第{number}行收藏必须填“是”或“否”')
                c = dict(name=values[0], favorite=values[1] == '是', notes=values[6])
                c.update({key: values[i + 2].splitlines() for i, key in enumerate(FIELDS)})
                try:
                    pending.append(validate(c))
                except ValueError as error:
                    raise ValueError(f'第{number}行：{error}') from error
        finally:
            wb.close()
        added = 0
        with connection() as db:
            existing = {json.dumps(validate(json.loads(r[0])), ensure_ascii=False, sort_keys=True) for r in db.execute('SELECT body FROM contacts WHERE owner=?', (session['owner'],))}
            for item in pending:
                body = json.dumps(item, ensure_ascii=False, sort_keys=True)
                if body not in existing:
                    db.execute('INSERT INTO contacts(owner,body) VALUES (?,?)', (session['owner'], body))
                    existing.add(body)
                    added += 1
        return jsonify(added=added, skipped=len(pending) - added)

    @app.get('/')
    def index():
        return send_from_directory(app.config['FRONTEND'], 'index.html')

    @app.get('/<path:filename>')
    def assets(filename):
        return send_from_directory(app.config['FRONTEND'], filename)

    return app


if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=8000)
