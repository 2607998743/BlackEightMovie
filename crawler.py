# -*- coding: utf-8 -*-
"""
黑八影视监控 - 抖音影视博主采集引擎
5步流水线：爬关注列表→AI识别影视博主→爬万赞视频→爬发布信息→识别原片标题
"""
import json, os, re, time, threading, queue, base64, traceback
from pathlib import Path
from datetime import datetime

BASE_DIR = Path('/www/dashboard')
DATA_DIR = Path('/www/MediaCrawler/data')
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = DATA_DIR / 'crawl_log.txt'
STATE_FILE = DATA_DIR / 'crawl_state.json'
FOLLOWING_FILE = DATA_DIR / 'following_list.json'
SKIP_FILE = DATA_DIR / 'skip_bloggers.json'
VIDEOS_FILE = DATA_DIR / 'crawl_videos.json'
CONFIG_FILE = BASE_DIR / 'config.json'
BLOGGER_FILE = BASE_DIR / 'blogger_data.js'
HISTORY_FILE = DATA_DIR / 'crawl_history.json'

# ============ 工具函数 ============
def load_config():
    return json.loads(CONFIG_FILE.read_text(encoding='utf-8'))

def log(msg):
    ts = datetime.now().strftime('%H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line, flush=True)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line + '\n')

def read_log():
    if LOG_FILE.exists():
        return LOG_FILE.read_text(encoding='utf-8')
    return ''

def clear_log():
    if LOG_FILE.exists():
        LOG_FILE.unlink()

def load_blogger_data():
    text = BLOGGER_FILE.read_text(encoding='utf-8')
    m = re.search(r'const BLOGGER_DATA\s*=\s*(\[.*\])', text, re.DOTALL)
    if m:
        return json.loads(m.group(1))
    return []

def save_blogger_data(data):
    js = 'const BLOGGER_DATA = ' + json.dumps(data, ensure_ascii=False, indent=1) + ';'
    BLOGGER_FILE.write_text(js, encoding='utf-8')

def load_skip_bloggers():
    if SKIP_FILE.exists():
        return json.loads(SKIP_FILE.read_text(encoding='utf-8'))
    return []

def save_skip_bloggers(lst):
    SKIP_FILE.write_text(json.dumps(lst, ensure_ascii=False, indent=1), encoding='utf-8')

def _get_cookie():
    cfg = load_config()
    return cfg.get('dy_cookie', '')

def _cookie_list(cookie):
    out = []
    for part in cookie.split(';'):
        if '=' in part:
            k, v = part.strip().split('=', 1)
            out.append({'name': k, 'value': v, 'domain': '.douyin.com', 'path': '/'})
    return out

# ============ API调用 ============
def call_text_api(prompt):
    import urllib.request
    cfg = load_config()
    api = cfg.get('txt_api', {})
    url = api.get('base', 'https://api.siliconflow.cn/v1') + '/chat/completions'
    key = api.get('key', '')
    model = api.get('model', 'Qwen/Qwen3.5-4B')
    body = json.dumps({
        'model': model,
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': 512,
    }).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers={
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
            return data['choices'][0]['message']['content'].strip()
    except Exception as e:
        log(f'文本API调用失败: {e}')
        return ''

def call_vl_api(image_b64, title, tags):
    import urllib.request
    cfg = load_config()
    api = cfg.get('vl_api', {})
    url = api.get('base', 'https://api.siliconflow.cn/v1') + '/chat/completions'
    key = api.get('key', '')
    model = api.get('model', 'Qwen/Qwen3-VL-8B-Instruct')
    tag_str = ', '.join(tags) if tags else '无'
    prompt = (
        "请识别这个抖音视频封面对应的原片影片名。\n"
        "步骤：\n"
        "1. 先对封面图做OCR，识别图中所有文字；如果识别到的文字就是影片名，直接输出。\n"
        f"2. 如果OCR没识别到影片名，根据标签[{tag_str}]推断影片名。\n"
        "3. 如果标签也不含影片名，识别封面中的演员形象，根据演员溯源原影片名。\n"
        f"视频标题：{title}\n"
        "只输出影片名，不要其他解释；识别不了就输出空。"
    )
    body = json.dumps({
        'model': model,
        'messages': [{'role': 'user', 'content': [
            {'type': 'text', 'text': prompt},
            {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{image_b64}'}},
        ]}],
        'max_tokens': 256,
    }).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers={
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            data = json.loads(r.read())
            return data['choices'][0]['message']['content'].strip()
    except Exception as e:
        log(f'视觉API调用失败: {e}')
        return ''

# ============ 步骤1：爬关注列表 ============
def step1_following():
    from playwright.sync_api import sync_playwright
    cookie = _get_cookie()
    if not cookie:
        log('步骤1失败: 未配置Cookie')
        return []
    log('步骤1: 开始爬关注列表...')
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
        ctx.add_cookies(_cookie_list(cookie))
        page = ctx.new_page()
        page.goto('https://www.douyin.com/user/self?showTab=follow', wait_until='domcontentloaded', timeout=30000)
        time.sleep(4)
        for i in range(40):
            page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            time.sleep(1.5)
            if '暂时没有更多了' in page.content():
                break
        items = page.evaluate("""() => {
            const out = [];
            document.querySelectorAll('a[href*="/user/"]').forEach(a => {
                const href = a.href;
                const m = href.match(/\\/user\\/([A-Za-z0-9_-]+)/);
                if (m) {
                    const img = a.querySelector('img');
                    out.push({sec_user_id: m[1], nickname: a.innerText.split('\\n')[0], avatar: img?img.src:''});
                }
            });
            return out;
        }""")
        browser.close()
    seen = set()
    result = []
    for it in items:
        if it['sec_user_id'] not in seen:
            seen.add(it['sec_user_id'])
            result.append(it)
    FOLLOWING_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
    log(f'步骤1完成: 关注列表 {len(result)} 个博主')
    return result

# ============ 步骤2：AI识别影视博主 ============
def _fetch_first6_tags(sec_user_id):
    from playwright.sync_api import sync_playwright
    cookie = _get_cookie()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
        ctx.add_cookies(_cookie_list(cookie))
        page = ctx.new_page()
        page.goto(f'https://www.douyin.com/user/{sec_user_id}', wait_until='domcontentloaded', timeout=30000)
        time.sleep(4)
        tags = page.evaluate("""() => {
            const out = [];
            document.querySelectorAll('a[href*="/video/"]').forEach(a => {
                const text = a.innerText || '';
                const matches = text.match(/#([^#\\s]+)/g);
                if (matches) out.push(...matches);
            });
            return [...new Set(out)].slice(0, 18);
        }""")
        browser.close()
    return tags

def identify_movie_blogger(nickname, bio='', tags=None):
    tag_str = ', '.join(tags) if tags else '无'
    prompt = (
        "判断这个抖音博主是不是影视解说博主。\n"
        f"昵称：{nickname}\n"
        f"简介：{bio or '无'}\n"
        f"前6个视频标签：{tag_str}\n"
        "影视博主包括：电影解说、电视剧剪辑、影视混剪、动漫解说。\n"
        "只回答 YES 或 NO，不要解释。"
    )
    result = call_text_api(prompt)
    return 'YES' in result.upper()

def step2_identify(new_bloggers):
    movie_bloggers = []
    skip_bloggers = load_skip_bloggers()
    skip_ids = {b['sec_user_id'] for b in skip_bloggers}
    total = len(new_bloggers)
    for i, b in enumerate(new_bloggers):
        if b['sec_user_id'] in skip_ids:
            log(f'步骤2 [{i+1}/{total}] {b["nickname"]} 已在跳过列表')
            continue
        log(f'步骤2 [{i+1}/{total}] 识别 {b["nickname"]}...')
        try:
            tags = _fetch_first6_tags(b['sec_user_id'])
            is_movie = identify_movie_blogger(b['nickname'], b.get('bio', ''), tags)
            if is_movie:
                b['tags_sample'] = tags
                movie_bloggers.append(b)
                log(f'  -> 影视博主')
            else:
                skip_bloggers.append({'sec_user_id': b['sec_user_id'], 'nickname': b['nickname'], 'skip_time': datetime.now().isoformat()})
                save_skip_bloggers(skip_bloggers)
                log(f'  -> 非影视，已加入跳过列表')
        except Exception as e:
            log(f'  -> 识别失败: {e}')
        time.sleep(1)
    log(f'步骤2完成: 影视博主 {len(movie_bloggers)} 位')
    return movie_bloggers

# ============ 步骤3：生产者 - 爬万赞视频 ============
def _parse_likes(text):
    text = text.strip()
    if '万' in text:
        return int(float(text.replace('万', '')) * 10000)
    try:
        return int(text.replace(',', ''))
    except:
        return 0

def step3_producer(sec_uid, known_ids, blogger_name, video_queue, stop_event):
    from playwright.sync_api import sync_playwright
    cookie = _get_cookie()
    log(f'步骤3 [{blogger_name}] 开始爬视频...')
    videos = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
        ctx.add_cookies(_cookie_list(cookie))
        page = ctx.new_page()
        page.goto(f'https://www.douyin.com/user/{sec_uid}', wait_until='domcontentloaded', timeout=30000)
        time.sleep(4)
        seen = set()
        hit_known = False
        for i in range(60):
            if stop_event.is_set():
                break
            page.evaluate("""() => {
                const c = document.querySelector('.route-scroll-container') || document.querySelector('.parent-route-container');
                if (c) c.scrollTop = c.scrollHeight;
            }""")
            time.sleep(1.5)
            items = page.evaluate("""() => {
                const out = [];
                document.querySelectorAll('a[href*="/video/"]').forEach(a => {
                    const href = a.href;
                    if (!/\\/video\\/\\d+/.test(href)) return;
                    const img = a.querySelector('img');
                    out.push({href: href, text: (a.innerText||'').trim().replace(/\\n+/g,'|'), cover: img?img.src:''});
                });
                return out;
            }""")
            new_count = 0
            for it in items:
                m = re.match(r'^(?:置顶\|)?([\d.]+万?)\|(.*)$', it['text'], re.S)
                if not m:
                    continue
                likes = _parse_likes(m.group(1))
                vid = it['href'].split('/video/')[1].split('?')[0]
                if vid in seen:
                    continue
                seen.add(vid)
                new_count += 1
                if known_ids and vid in known_ids:
                    hit_known = True
                    log(f'步骤3 [{blogger_name}] 遇到已知视频，增量停止')
                    break
                if likes > 10000:
                    title = m.group(2).split('#')[0].strip()
                    tags = re.findall(r'#([^#\s]+)', m.group(2))
                    v = {
                        'video_id': vid,
                        'title': title,
                        'tags': tags,
                        'likes': likes,
                        'cover': it['cover'],
                        'url': it['href'].split('?')[0],
                        'blogger': blogger_name,
                    }
                    videos.append(v)
                    video_queue.put(v)
            if hit_known:
                break
            if '暂时没有更多了' in page.content():
                log(f'步骤3 [{blogger_name}] 已滚动到底')
                break
            if new_count == 0:
                time.sleep(1)
        browser.close()
    log(f'步骤3 [{blogger_name}] 完成: 万赞视频 {len(videos)} 条')
    return videos

# ============ 步骤4：消费者 - 爬发布信息 ============
def step4_consumer(video_queue, result_dict, stop_event, worker_id=0):
    from playwright.sync_api import sync_playwright
    cookie = _get_cookie()
    count = 0
    pw = sync_playwright().start()
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 800, 'height': 600})
    ctx.add_cookies(_cookie_list(cookie))
    while not stop_event.is_set():
        try:
            v = video_queue.get(timeout=3)
        except queue.Empty:
            if video_queue.empty():
                break
            continue
        if v is None:
            break
        if count > 0 and count % 5 == 0:
            try:
                browser.close()
            except:
                pass
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={'width': 800, 'height': 600})
            ctx.add_cookies(_cookie_list(cookie))
        try:
            page = ctx.new_page()
            page.goto(v['url'], wait_until='domcontentloaded', timeout=15000)
            time.sleep(2)
            info = page.evaluate("""() => {
                const txt = document.body.innerText;
                const t = txt.match(/(\\d{4}-\\d{2}-\\d{2})/);
                const d = txt.match(/(\\d+):(\\d{2})/);
                return {publish_time: t?t[1]:'', duration: d?(parseInt(d[1])*60+parseInt(d[2]))*1000:0};
            }""")
            v['publish_time'] = info.get('publish_time', '')
            v['duration'] = info.get('duration', 0)
            result_dict[v['video_id']] = v
            count += 1
            if count % 10 == 0:
                log(f'步骤4 worker{worker_id}: 已处理 {count} 条')
        except Exception as e:
            log(f'步骤4 worker{worker_id}: 视频 {v["video_id"]} 失败: {e}')
            v['_failed'] = True
            result_dict[v['video_id']] = v
        finally:
            try:
                page.close()
            except:
                pass
    try:
        browser.close()
        pw.stop()
    except:
        pass

# ============ 步骤5：识别原片标题 ============
def step5_identify(videos, max_workers=6):
    import urllib.request, concurrent.futures
    if not videos:
        return {}
    log(f'步骤5: 开始识别 {len(videos)} 条视频原片标题（{max_workers}线程）...')
    mapping = {}
    def identify_one(v):
        vid = v['video_id']
        cover = v.get('cover', '')
        if not cover:
            return vid, ''
        try:
            req = urllib.request.Request(cover, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.douyin.com/'})
            with urllib.request.urlopen(req, timeout=20) as r:
                img_data = r.read()
            img_b64 = base64.b64encode(img_data).decode()
            movie_name = call_vl_api(img_b64, v.get('title', ''), v.get('tags', []))
            return vid, movie_name
        except Exception as e:
            log(f'步骤5: 视频 {vid} 识别失败: {e}')
            return vid, ''
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        for vid, movie_name in ex.map(identify_one, videos):
            mapping[vid] = movie_name
            done += 1
            if done % 10 == 0:
                log(f'步骤5: 已识别 {done}/{len(videos)}')
    identified = sum(1 for v in mapping.values() if v)
    log(f'步骤5完成: 已识别 {identified} 条，未识别 {len(mapping)-identified} 条')
    return mapping

# ============ 主流程 ============
_crawl_thread = None
_stop_event = None

def run_crawl(step='all'):
    global _stop_event
    _stop_event = threading.Event()
    clear_log()
    log('=== 开始采集任务 ===')
    start_time = time.time()
    new_blogger_names = []
    old_blogger_names = []
    all_videos = []
    fails = []
    try:
        # 步骤1
        following = step1_following()
        if not following:
            log('关注列表为空，终止')
            return
        # 分类
        blogger_data = load_blogger_data()
        existing_ids = {}
        for b in blogger_data:
            m = re.search(r'/user/([A-Za-z0-9_-]+)', b.get('url', ''))
            if m:
                existing_ids[m.group(1)] = b
        skip_bloggers = load_skip_bloggers()
        skip_ids = {b['sec_user_id'] for b in skip_bloggers}
        new_bloggers = []
        old_bloggers = []
        for f in following:
            sid = f['sec_user_id']
            if sid in skip_ids:
                continue
            if sid in existing_ids:
                old_bloggers.append({'sec_user_id': sid, 'nickname': existing_ids[sid].get('name', f['nickname']), 'existing': existing_ids[sid]})
            else:
                new_bloggers.append(f)
        log(f'分类: 新博主 {len(new_bloggers)} 位，旧博主 {len(old_bloggers)} 位，跳过 {len(skip_ids)} 位')
        # 步骤2
        movie_new = step2_identify(new_bloggers)
        new_blogger_names = [b['nickname'] for b in movie_new]
        # 步骤3+4并发
        targets = movie_new + old_bloggers
        old_blogger_names = [b['nickname'] for b in old_bloggers]
        total = len(targets)
        video_queue = queue.Queue()
        result_dict = {}
        consumer_threads = []
        for wid in range(2):
            t = threading.Thread(target=step4_consumer, args=(video_queue, result_dict, _stop_event, wid), daemon=True)
            t.start()
            consumer_threads.append(t)
        for i, b in enumerate(targets):
            if _stop_event.is_set():
                break
            sec_uid = b['sec_user_id']
            name = b['nickname']
            known_ids = set()
            if 'existing' in b:
                known_ids = {v['video_id'] for v in b['existing'].get('videos', [])}
            log(f'=== 博主 {i+1}/{total}: {name} (新博主={"existing" not in b}) ===')
            try:
                vids = step3_producer(sec_uid, known_ids, name, video_queue, _stop_event)
                all_videos.extend(vids)
            except Exception as e:
                log(f'博主 {name} 采集失败: {e}')
                fails.append(name)
        log('步骤3完成，等待步骤4消费剩余视频...')
        for _ in range(2):
            video_queue.put(None)
        for t in consumer_threads:
            t.join(timeout=120)
        all_videos = list(result_dict.values())
        wanfen = [v for v in all_videos if v.get('likes', 0) > 10000]
        log(f'步骤3+4完成: 共采集 {len(all_videos)} 条，万赞 {len(wanfen)} 条')
        # 失败重试一次
        failed_videos = [v for v in wanfen if v.get('_failed')]
        if failed_videos:
            log(f'失败重试: {len(failed_videos)} 条')
            retry_queue = queue.Queue()
            retry_result = {}
            retry_stop = threading.Event()
            ct = threading.Thread(target=step4_consumer, args=(retry_queue, retry_result, retry_stop, 99), daemon=True)
            ct.start()
            for v in failed_videos:
                v.pop('_failed', None)
                retry_queue.put(v)
            retry_queue.put(None)
            ct.join(timeout=120)
            for vid, v in retry_result.items():
                if not v.get('_failed'):
                    for idx, av in enumerate(wanfen):
                        if av['video_id'] == vid:
                            wanfen[idx] = v
                            break
        # 步骤5
        mapping = step5_identify(wanfen, max_workers=6)
        # 追加入库
        log('开始追加入库...')
        data = load_blogger_data()
        blogger_map = {}
        for b in data:
            m = re.search(r'/user/([A-Za-z0-9_-]+)', b.get('url', ''))
            if m:
                blogger_map[m.group(1)] = b
        sec_uid_by_name = {t['nickname']: t['sec_user_id'] for t in targets}
        for v in wanfen:
            sec_uid = sec_uid_by_name.get(v['blogger'], '')
            if not sec_uid:
                continue
            if sec_uid in blogger_map:
                b = blogger_map[sec_uid]
                existing_vids = {x['video_id'] for x in b.get('videos', [])}
                if v['video_id'] not in existing_vids:
                    v['movie_name'] = mapping.get(v['video_id'], '')
                    v['type'] = ''
                    v['country'] = ''
                    v['date'] = ''
                    b.setdefault('videos', []).append(v)
            else:
                new_b = {
                    'name': v['blogger'],
                    'fans': 0, 'fans_str': '0', 'total_likes': '0', 'works': 0,
                    'url': f'https://www.douyin.com/user/{sec_uid}',
                    'videos': [], 'style': [], 'analysis': {}, 'country_dist': [],
                    'avatar': '', 'full_scan': False, 'wanfen_count': 0,
                }
                v['movie_name'] = mapping.get(v['video_id'], '')
                v['type'] = ''
                v['country'] = ''
                v['date'] = ''
                new_b['videos'].append(v)
                data.append(new_b)
                blogger_map[sec_uid] = new_b
        save_blogger_data(data)
        # 历史记录
        identified = sum(1 for vid, mn in mapping.items() if mn)
        history = {
            'time': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'action': 'crawl',
            'new_bloggers': new_blogger_names,
            'old_bloggers': old_blogger_names,
            'old_new_count': len(wanfen),
            'total_wanfen': len(wanfen),
            'identified': identified,
            'unidentified': len(wanfen) - identified,
            'fails': fails,
        }
        hist_list = []
        if HISTORY_FILE.exists():
            hist_list = json.loads(HISTORY_FILE.read_text(encoding='utf-8'))
        hist_list.append(history)
        HISTORY_FILE.write_text(json.dumps(hist_list, ensure_ascii=False, indent=1), encoding='utf-8')
        elapsed = int(time.time() - start_time)
        log(f'=== 采集完成: 耗时 {elapsed}s, 新博主 {len(new_blogger_names)} 位, 旧博主 {len(old_blogger_names)} 位, 万赞 {len(wanfen)} 条, 已识别 {identified} 条 ===')
    except Exception as e:
        log(f'!!! 采集异常: {e}')
        log(traceback.format_exc())
    finally:
        _stop_event = None

def start_crawl():
    global _crawl_thread, _stop_event
    if _crawl_thread and _crawl_thread.is_alive():
        return False, '采集正在运行中'
    _crawl_thread = threading.Thread(target=run_crawl, daemon=True)
    _crawl_thread.start()
    return True, '采集已启动'

def stop_crawl():
    global _stop_event
    if _stop_event:
        _stop_event.set()
        return True, '停止信号已发送'
    return False, '没有正在运行的采集'

def is_running():
    global _crawl_thread
    return _crawl_thread is not None and _crawl_thread.is_alive()
