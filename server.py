# -*- coding: utf-8 -*-
"""黑八影视监控 - FastAPI 后端"""
import json, os, time, threading, asyncio
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import random, smtplib, time
from email.mime.text import MIMEText

CODE_STORE = {}
CODE_EXPIRE = 300

def send_mail(to_addr, subject, body):
    cfg = C.load_config()
    smtp_pass = cfg.get('smtp_pass', '')
    if not smtp_pass:
        return False, 'no smtp_pass'
    try:
        msg = MIMEText(body, 'plain', 'utf-8')
        msg['From'] = cfg.get('smtp_user', '2607998743@qq.com')
        msg['To'] = to_addr
        msg['Subject'] = subject
        srv = smtplib.SMTP_SSL(cfg.get('smtp_host','smtp.qq.com'), cfg.get('smtp_port',465), timeout=15)
        srv.login(cfg.get('smtp_user','2607998743@qq.com'), smtp_pass)
        srv.sendmail(cfg.get('smtp_user','2607998743@qq.com'), [to_addr], msg.as_string())
        srv.quit()
        return True, 'ok'
    except Exception as e:
        return False, str(e)[:100]


BASE = Path("/www/dashboard")
import sys
sys.path.insert(0, str(BASE))
import crawler as C

app = FastAPI()

@app.post('/api/auth/login')
async def api_login(request: Request):
    body = await request.json()
    cfg = C.load_config()
    if body.get('username') == cfg.get('admin_user','root') and body.get('password') == cfg.get('admin_pass','heiba888'):
        return {'ok': True, 'role': 'admin'}
    return {'ok': False, 'msg': '账号或密码错误'}

@app.post('/api/auth/send-code')
async def api_send_code():
    cfg = C.load_config()
    email = cfg.get('email_to', '2607998743@qq.com')
    code = f'{random.randint(100000,999999)}'
    CODE_STORE[email] = {'code': code, 'expire': time.time()+CODE_EXPIRE}
    ok, msg = send_mail(email, "heiba code", "code: " + code + "\n5min")
    if ok:
        return {'ok': True, 'msg': '验证码已发送'}
    else:
        print(f'[DEBUG] 验证码: {code}')
        return {'ok': False, 'msg': f'邮件失败: {msg}'}

@app.post('/api/auth/reset-password')
async def api_reset_password(request: Request):
    body = await request.json()
    cfg = C.load_config()
    email = cfg.get('email_to', '2607998743@qq.com')
    rec = CODE_STORE.get(email)
    if not rec:
        return {'ok': False, 'msg': '请先获取验证码'}
    if time.time() > rec['expire']:
        return {'ok': False, 'msg': '验证码已过期'}
    if body.get('code') != rec['code']:
        return {'ok': False, 'msg': '验证码错误'}
    new_pwd = body.get('new_password','')
    if len(new_pwd) < 4:
        return {'ok': False, 'msg': '新密码至少4位'}
    cfg['admin_pass'] = new_pwd
    json.dump(cfg, open('/www/dashboard/config.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    del CODE_STORE[email]
    return {'ok': True, 'msg': '密码修改成功'}


@app.get("/api/config")
def get_config():
    cfg = C.load_config()
    # mask api key
    key = cfg.get("vl_api_key", "")
    if len(key) > 8:
        cfg["vl_api_key"] = key[:6] + "..." + key[-4:]
    cfg["dy_cookie_len"] = len(cfg.get("dy_cookie", ""))
    cfg.pop("dy_cookie", None)
    return cfg

@app.post("/api/config")
async def save_config(request: Request):
    body = await request.json()
    cfg = C.load_config()
    if "dy_cookie" in body and body["dy_cookie"]:
        cfg["dy_cookie"] = body["dy_cookie"]
    for k in ["vl_api_base", "vl_api_key", "vl_model", "txt_api_base", "txt_api_key", "txt_model"]:
        if k in body and body[k]:
            cfg[k] = body[k]
    json.dump(cfg, open('/www/dashboard/config.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return {"ok": True}

@app.get("/api/crawler/log")
def get_log():
    return {"log": C.read_log()}

@app.get("/api/crawler/status")
def crawl_status():
    return {"running": C.is_running()}



# ============ 账号管理 API ============
@app.get('/api/account/cookie')
def get_cookie():
    cfg = C.load_config()
    return {'cookie': cfg.get('dy_cookie', ''), 'logged_in': bool(cfg.get('dy_cookie',''))}

@app.get('/api/account/cookie/test')
async def test_cookie():
    cfg = C.load_config()
    cookie = cfg.get('dy_cookie', '')
    if not cookie:
        return {'ok': False, 'msg': '未配置 Cookie'}
    has_session = 'sessionid=' in cookie
    has_sid_guard = 'sid_guard=' in cookie
    if not has_session or not has_sid_guard:
        return {'ok': False, 'msg': f'缺少关键字段: sessionid={has_session}, sid_guard={has_sid_guard}'}

    # ===== 快速预筛选：解析 sid_guard 过期时间 =====
    try:
        import re, urllib.parse, time as _time
        m = re.search(r'sid_guard=([^;]+)', cookie)
        if m:
            sid_val = urllib.parse.unquote(m.group(1))
            parts = sid_val.split('|')
            if len(parts) >= 4:
                expire_str = parts[3]  # e.g. "Mon, 14-Dec-2026 18:18:11 GMT"
                from email.utils import parsedate_to_datetime
                expire_dt = parsedate_to_datetime(expire_str)
                now = _time.time()
                if expire_dt.timestamp() < now:
                    return {'ok': False, 'msg': f'Cookie 已过期（{expire_str}），请重新获取'}
    except Exception:
        pass  # 解析失败则跳过预筛选，继续Playwright验证

    # ===== Playwright 验证（优化版） =====
    try:
        from playwright.async_api import async_playwright
        cookies = []
        for part in cookie.split(';'):
            if '=' in part:
                k, v = part.strip().split('=', 1)
                cookies.append({'name': k, 'value': v, 'domain': '.douyin.com', 'path': '/'})
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=[
                '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
                '--disable-extensions', '--disable-images'
            ])
            ctx = await browser.new_context(viewport={'width': 1280, 'height': 800})
            # 拦截图片和媒体资源，加快加载
            await ctx.route('**/*.{png,jpg,jpeg,gif,webp,svg,mp4,webm,woff,woff2,ttf}', lambda route: route.abort())
            await ctx.add_cookies(cookies)
            page = await ctx.new_page()
            await page.goto('https://www.douyin.com/user/self?showTab=follow', wait_until='domcontentloaded', timeout=20000)
            import asyncio
            await asyncio.sleep(2)  # 从4秒减到2秒
            content = await page.content()
            url = page.url
            await browser.close()
        if 'login' in url.lower() or 'passport' in url.lower():
            return {'ok': False, 'msg': 'Cookie 已失效（跳转到登录页），请重新获取'}
        if '暂时没有更多了' in content or '关注' in content:
            m = re.search(r'关注[\s\n]*(\d+)', content)
            if m:
                return {'ok': True, 'msg': f'Cookie 有效，关注列表可访问（约{m.group(1)}个关注）'}
            return {'ok': True, 'msg': 'Cookie 有效，登录状态正常'}
        if '登录' in content and '登录后' in content:
            return {'ok': False, 'msg': 'Cookie 已失效（页面显示登录按钮），请重新获取'}
        return {'ok': True, 'msg': 'Cookie 有效，页面正常加载'}
    except Exception as e:
        return {'ok': False, 'msg': f'验证失败: {str(e)[:100]}'}

@app.get('/api/server/info')
async def server_info():
    import platform, os, time, socket, subprocess
    
    def run(cmd):
        try:
            return subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL).decode().strip()
        except Exception:
            return ''
    
    # 实例ID（阿里云metadata或hostname）
    instance_id = run('curl -s --connect-timeout 2 http://100.100.100.200/latest/meta-data/instance-id') or socket.gethostname()
    # 地域
    region = run('curl -s --connect-timeout 2 http://100.100.100.200/latest/meta-data/region-id') or '未知'
    # OS
    os_name = run('cat /etc/os-release | grep PRETTY_NAME | sed "s/.*=//;s/\"//g"') or (platform.system() + ' ' + platform.release())
    # 运行时间
    uptime_raw = run('uptime -p') or '-'
    # 内核
    kernel = platform.release()
    # CPU
    cpu_cores = run('nproc') or str(os.cpu_count() or '?')
    cpu_model = run("cat /proc/cpuinfo | grep 'model name' | head -1 | cut -d: -f2 | xargs | cut -c1-30") or 'CPU'
    cpu_info = f'{cpu_cores}核 {cpu_model}'
    # 内存
    mem_info = run('free -h | grep Mem').split()
    mem = f'{mem_info[2]}/{mem_info[1]}' if len(mem_info) >= 3 else '-'
    # 磁盘
    disk_info = run('df -h / | tail -1').split()
    disk = f'{disk_info[2]}/{disk_info[1]} ({disk_info[4]})' if len(disk_info) >= 5 else '-'
    # Python
    python_ver = platform.python_version()
    
    info = {
        'instance_id': instance_id,
        'region': region,
        'os': os_name,
        'uptime': uptime_raw,
        'kernel': kernel,
        'cpu': cpu_info,
        'mem': mem,
        'disk': disk,
        'python': python_ver
    }
    return {'ok': True, 'info': info}


@app.post('/api/account/cookie')
async def save_cookie(request: Request):
    body = await request.json()
    cookie = body.get('cookie', '')
    cfg = C.load_config()
    cfg['dy_cookie'] = cookie
    json.dump(cfg, open('/www/dashboard/config.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return {'ok': True, 'msg': 'Cookie已保存'}

@app.post('/api/account/qrcode')
async def gen_qrcode():
    try:
        path = await C.qr_start()
        return {'ok': True, 'qr_url': f'/api/account/qrcode/img?t={int(time.time())}'}
    except Exception as e:
        return {'ok': False, 'msg': str(e)}

@app.get('/api/account/qrcode/img')
def qr_img():
    from fastapi.responses import FileResponse
    p = C.DATA_DIR / 'login_qr.png'
    if p.exists():
        return FileResponse(p)
    return {'ok': False, 'msg': '二维码未生成'}

@app.get('/api/account/qrcode/status')
async def qr_status():
    cookie = await C.qr_check()
    if cookie:
        return {'ok': True, 'logged_in': True, 'msg': '登录成功'}
    return {'ok': True, 'logged_in': False, 'msg': getattr(C, '_qr_progress', '等待扫码中...')}

@app.get('/api/account/qrcode/progress')
def qr_progress():
    return {'ok': True, 'progress': getattr(C, '_qr_progress', '初始化...')}

@app.get('/api/account/config')
def get_config():
    cfg = C.load_config()
    return {
        'vl_api_base': cfg.get('vl_api_base',''),
        'vl_model': cfg.get('vl_model',''),
        'vl_api_key': cfg.get('vl_api_key',''),
        'txt_api_base': cfg.get('txt_api_base',''),
        'txt_model': cfg.get('txt_model',''),
        'txt_api_key': cfg.get('txt_api_key',''),
        'ocr_api_base': cfg.get('ocr_api_base',''),
        'ocr_model': cfg.get('ocr_model',''),
        'ocr_api_key': cfg.get('ocr_api_key',''),
    }

@app.post('/api/account/config')
async def save_config_api(request: Request):
    body = await request.json()
    cfg = C.load_config()
    for k in ['vl_api_base','vl_model','vl_api_key','txt_api_base','txt_model','txt_api_key','ocr_api_base','ocr_model','ocr_api_key']:
        if k in body:
            cfg[k] = body[k]
    json.dump(cfg, open('/www/dashboard/config.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return {'ok': True, 'msg': '配置已保存'}

# 静态文件
@app.get("/")
def index():
    return FileResponse(BASE / "index.html")


@app.post("/api/crawler/start")
async def start_crawl(request: Request):
    try:
        body = await request.json()
    except:
        body = {}
    step = body.get('step', 'all')
    ok, msg = C.start_crawl()
    return {'ok': ok, 'msg': msg}


@app.post("/api/crawler/stop")
async def stop_crawl():
    ok, msg = C.stop_crawl()
    return {'ok': ok, 'msg': msg}


@app.get("/{path:path}")
def static(path: str):
    f = BASE / path
    if f.exists() and f.is_file():
        return FileResponse(f)
    return FileResponse(BASE / "index.html")



@app.post("/api/account/vl_api")
async def save_vl_api(request: Request):
    body = await request.json()
    cfg = C.load_config()
    # 支持两种字段格式：vl_api_base 或 base
    if "base" in body and body["base"]:
        cfg["vl_api_base"] = body["base"]
    if "key" in body and body["key"]:
        cfg["vl_api_key"] = body["key"]
    if "model" in body and body["model"]:
        cfg["vl_model"] = body["model"]
    for k in ["vl_api_base", "vl_api_key", "vl_model"]:
        if k in body and body[k]:
            cfg[k] = body[k]
    json.dump(cfg, open('/www/dashboard/config.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return {"ok": True, "msg": "视觉API配置已保存"}

@app.post("/api/account/txt_api")
async def save_txt_api(request: Request):
    body = await request.json()
    cfg = C.load_config()
    if "base" in body and body["base"]:
        cfg["txt_api_base"] = body["base"]
    if "key" in body and body["key"]:
        cfg["txt_api_key"] = body["key"]
    if "model" in body and body["model"]:
        cfg["txt_model"] = body["model"]
    for k in ["txt_api_base", "txt_api_key", "txt_model"]:
        if k in body and body[k]:
            cfg[k] = body[k]
    json.dump(cfg, open('/www/dashboard/config.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return {"ok": True, "msg": "文本API配置已保存"}

@app.post("/api/account/ocr_api")
async def save_ocr_api(request: Request):
    body = await request.json()
    cfg = C.load_config()
    if "base" in body and body["base"]:
        cfg["ocr_api_base"] = body["base"]
    if "key" in body and body["key"]:
        cfg["ocr_api_key"] = body["key"]
    if "model" in body and body["model"]:
        cfg["ocr_model"] = body["model"]
    for k in ["ocr_api_base", "ocr_api_key", "ocr_model"]:
        if k in body and body[k]:
            cfg[k] = body[k]
    json.dump(cfg, open('/www/dashboard/config.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return {"ok": True, "msg": "OCR API配置已保存"}

@app.post("/api/account/vl_api/test")
async def test_vl_api(request: Request):
    body = await request.json()
    base = body.get("base", "").rstrip("/")
    key = body.get("key", "")
    if not base or not key:
        return {"ok": False, "msg": "请先填写 API Base 和 API Key"}
    try:
        import httpx
        r = httpx.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"}, timeout=10)
        if r.status_code == 200:
            data = r.json()
            models = [m.get("id", "") for m in data.get("data", [])]
            return {"ok": True, "msg": f"连接成功，可用模型 {len(models)} 个", "models": models}
        else:
            return {"ok": False, "msg": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "msg": f"连接失败: {str(e)[:200]}"}

@app.post("/api/account/txt_api/test")
async def test_txt_api(request: Request):
    body = await request.json()
    base = body.get("base", "").rstrip("/")
    key = body.get("key", "")
    if not base or not key:
        return {"ok": False, "msg": "请先填写 API Base 和 API Key"}
    try:
        import httpx
        r = httpx.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"}, timeout=10)
        if r.status_code == 200:
            data = r.json()
            models = [m.get("id", "") for m in data.get("data", [])]
            return {"ok": True, "msg": f"连接成功，可用模型 {len(models)} 个", "models": models}
        else:
            return {"ok": False, "msg": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "msg": f"连接失败: {str(e)[:200]}"}

@app.post("/api/account/ocr_api/test")
async def test_ocr_api(request: Request):
    body = await request.json()
    base = body.get("base", "").rstrip("/")
    key = body.get("key", "")
    if not base or not key:
        return {"ok": False, "msg": "请先填写 API Base 和 API Key"}
    try:
        import httpx
        r = httpx.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"}, timeout=10)
        if r.status_code == 200:
            data = r.json()
            models = [m.get("id", "") for m in data.get("data", [])]
            return {"ok": True, "msg": f"连接成功，可用模型 {len(models)} 个", "models": models}
        else:
            return {"ok": False, "msg": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "msg": f"连接失败: {str(e)[:200]}"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="warning")
