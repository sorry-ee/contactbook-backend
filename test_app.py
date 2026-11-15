import io
import tempfile
import unittest
from pathlib import Path
from app import create_app, HEADERS
from openpyxl import Workbook, load_workbook


class ContactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app({'TESTING':True, 'DATABASE':str(Path(self.temp.name) / 'test.db'), 'SECRET_KEY':'test'})
        self.client = self.app.test_client()
        self.headers = {'X-Requested-With':'ContactBook'}
        self.item = dict(name='林小舟', favorite=True, phones=['13800000001','05910000000'], emails=['demo@example.com'], socials=['微信：demo'], addresses=['福州市示例路1号'], notes='虚构联系人')

    def tearDown(self):
        self.temp.cleanup()

    def add(self, client=None, item=None):
        return (client or self.client).post('/api/contacts', json=item or self.item, headers=self.headers)

    def sheet(self, rows):
        wb = Workbook(); ws = wb.active
        for row in rows: ws.append(row)
        data = io.BytesIO(); wb.save(data); data.seek(0)
        return data

    def upload(self, client, data):
        return client.post('/api/import', data={'file':(data,'contacts.xlsx')}, headers=self.headers)

    def test_crud_favorite_and_persistence(self):
        c = self.add().json; self.assertEqual(c['phones'], self.item['phones'])
        c['favorite'] = False
        self.assertEqual(self.client.put('/api/contacts/'+str(c['id']), json=c, headers=self.headers).status_code,200)
        self.assertFalse(self.client.get('/api/contacts').json[0]['favorite'])
        self.assertEqual(self.client.delete('/api/contacts/'+str(c['id']), headers=self.headers).status_code,200)
        self.assertEqual(self.client.get('/api/contacts').json, [])

    def test_browser_isolation(self):
        c = self.add().json; other = self.app.test_client()
        self.assertEqual(other.get('/api/contacts').json, [])
        self.assertEqual(other.put('/api/contacts/'+str(c['id']), json=self.item, headers=self.headers).status_code,404)
        self.assertEqual(other.delete('/api/contacts/'+str(c['id']), headers=self.headers).status_code,404)

    def test_excel_roundtrip_and_duplicate(self):
        self.add(); exported = self.client.get('/api/export')
        other = self.app.test_client()
        self.assertEqual(self.upload(other, io.BytesIO(exported.data)).json, dict(added=1, skipped=0))
        actual = other.get('/api/contacts').json[0]; actual.pop('id')
        self.assertEqual(actual, self.item)
        self.assertEqual(self.upload(other, io.BytesIO(exported.data)).json, dict(added=0,skipped=1))

    def test_invalid_import_is_atomic(self):
        good = ['甲','是','13800000001','','','','']
        bad = ['','否','','','','','']
        r = self.upload(self.client,self.sheet([HEADERS,good,bad]))
        self.assertEqual(r.status_code,400)
        self.assertEqual(self.client.get('/api/contacts').json, [])

    def test_headers_numeric_phone_corrupt_file(self):
        for rows in [[['错误表头']], [HEADERS,['甲','否',13800000001,'','','','']]]:
            self.assertEqual(self.upload(self.client,self.sheet(rows)).status_code,400)
        self.assertEqual(self.upload(self.client,io.BytesIO(b'not excel')).status_code,400)

    def test_formula_export_is_text(self):
        self.add(item={**self.item,'name':'=1+1'})
        wb = load_workbook(io.BytesIO(self.client.get('/api/export').data))
        self.assertEqual(wb.active['A2'].data_type, 's')
        self.assertEqual(wb.active['A2'].value,'=1+1')

    def test_validation_and_request_guard(self):
        self.assertEqual(self.client.post('/api/contacts',json=self.item).status_code,403)
        for invalid in [dict(name=''),dict(name='甲',phones='123'),dict(name='甲',favorite='yes'),dict(name='甲',phones=['a\nb'])]:
            self.assertEqual(self.client.post('/api/contacts',json=invalid,headers=self.headers).status_code,400)

    def test_frontend(self):
        for path in ['/','/style.css','/app.js']:
            response = self.client.get(path)
            self.assertEqual(response.status_code,200)
            response.close()

if __name__ == '__main__': unittest.main(verbosity=2)
