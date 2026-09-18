
// 数据从外部文件加载

new Vue({
  el: '#app',
  data() {
    return {
      activeMenu: 'douyin',
      tkBloggers: TK_DATA,
      searchText: '',
      currentBlogger: {name: '', analysis: {text: ''}, style: [], country_dist: [], videos: []},
      pieChart: null,
      countryPieChart: null,
      sortDesc: false,
      coverDialogVisible: false,
      currentCover: '',
      filterVisible: false,
      filterType: '',
      filterCountry: '',
      searchDialogVisible: false,
      searchMonth: '',
      searchCountry: '',
      searchType: '',
      searchName: '',
      searchBlogger: '',
      searchMinLikes: 0,
      searchPlatform: '',
      searchRan: false,
      nlText: '',
      nlRecognized: '',
      fanMin: 0,
      fanMax: 0,
      editingName: null,
      editNameVal: '',
      loginRole: '',
      loginUser: '',
      loginPass: '',
      loginError: '',
      showPass: false,
      dataVersion: 0,
      syncDialogVisible: false,
      syncToken: '',
    }
  },
  computed: {
    isAdmin() { return this.loginRole === 'admin'; },
    loggedIn() { return this.loginRole === 'admin' || this.loginRole === 'guest'; },
    douyinBloggers() {
      void this.dataVersion;
      let list = BLOGGER_DATA;
      if (this.searchText) {
        list = list.filter(b => b.name.includes(this.searchText));
      }
      return list.slice().sort((a, b) => this.sortDesc ? b.fans - a.fans : a.fans - b.fans);
    },
    filterTypeOptions() {
      if (!this.currentBlogger) return [];
      const s = new Set();
      this.currentBlogger.videos.forEach(v => { const t = v.type || '未知'; if (t) s.add(t); });
      return [...s].sort();
    },
    filterCountryOptions() {
      if (!this.currentBlogger) return [];
      const s = new Set();
      this.currentBlogger.videos.forEach(v => { const c = v.country || '未知'; if (c) s.add(c); });
      return [...s].sort();
    },
    searchMonthOptions() {
      const s = new Set();
      const add = src => src.forEach(b => (b.videos || []).forEach(v => { const p = v.publish_time || ''; if (p.length >= 7) s.add(p.slice(0, 7)); }));
      add(BLOGGER_DATA); add(TK_DATA);
      return [...s].sort().reverse();
    },
    searchCountryOptions() {
      const s = new Set();
      const add = src => src.forEach(b => (b.videos || []).forEach(v => { const c = v.country || '未知'; if (c) s.add(c); }));
      add(BLOGGER_DATA); add(TK_DATA);
      return [...s].sort();
    },
    searchTypeOptions() {
      const s = new Set();
      const add = src => src.forEach(b => (b.videos || []).forEach(v => { const t = v.type || '未知'; if (t) s.add(t); }));
      add(BLOGGER_DATA); add(TK_DATA);
      return [...s].sort();
    },
    searchResults() {
      if (!this.searchRan) return [];
      const min = this.searchMinLikes || 0;
      const res = [];
      const sources = [];
      if (!this.searchPlatform || this.searchPlatform === 'douyin') sources.push(BLOGGER_DATA);
      if (!this.searchPlatform || this.searchPlatform === 'tk') sources.push(TK_DATA);
      sources.forEach(src => src.forEach(b => (b.videos || []).forEach(v => {
        if (this.searchMonth && !(v.publish_time || '').startsWith(this.searchMonth)) return;
        if (this.searchCountry && (v.country || '未知') !== this.searchCountry) return;
        if (this.searchType && (v.type || '未知') !== this.searchType) return;
        if (this.searchName && !(v.movie_name || '').includes(this.searchName)) return;
        if (min && (v.likes || 0) < min) return;
        if (this.searchBlogger && !b.name.includes(this.searchBlogger)) return;
        if (this.fanMin > 0 && (b.fans || 0) < this.fanMin) return;
        if (this.fanMax > 0 && (b.fans || 0) > this.fanMax) return;
        res.push(Object.assign({}, v, { blogger: b.name, fans: b.fans_str, platform: b.platform || 'douyin' }));
      })));
      return res.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    },
    hasFilter() {
      return !!(this.filterType || this.filterCountry);
    },
    filteredVideos() {
      if (!this.currentBlogger) return [];
      let list = this.currentBlogger.videos;
      if (this.filterType) list = list.filter(v => (v.type || '未知') === this.filterType);
      if (this.filterCountry) list = list.filter(v => (v.country || '未知') === this.filterCountry);
      return list;
    }
  },
  methods: {
    openSyncSettings() {
      let t = '';
      try { t = localStorage.getItem('bb_gh_token') || ''; } catch (e) {}
      this.syncToken = t;
      this.syncDialogVisible = true;
    },
    saveSyncToken() {
      try { localStorage.setItem('bb_gh_token', this.syncToken); } catch (e) {}
      this.syncDialogVisible = false;
      this.$message.success('Token 已保存（仅本机浏览器）');
    },
    testGithubToken() {
      if (!this.syncToken) { this.$message.warning('请先输入 Token'); return; }
      fetch('https://api.github.com/repos/2607998743/BlackEightMovie', {headers: {'Authorization': 'token ' + this.syncToken, 'Accept': 'application/vnd.github+json'}})
        .then(r => r.json())
        .then(j => {
          if (j.full_name) this.$message.success('连接成功：' + j.full_name);
          else this.$message.error('连接失败：' + (j.message || '未知错误'));
        })
        .catch(e => this.$message.error('网络异常：' + e.message));
    },
    githubPush(filename) {
      const token = String(this.syncToken || (function(){ try { return localStorage.getItem('bb_gh_token') || ''; } catch(e){ return ''; } })()).replace(/\s+/g, '').replace(/[^\x20-\x7E]/g, '');
      if (!token) {
        this.$message.warning('未配置 GitHub Token：数据仅更新当前页面。请在右上角齿轮中配置后，再次删除即可自动同步线上');
        return Promise.resolve(false);
      }
      const headers = {'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json'};
      const api = 'https://api.github.com/repos/2607998743/BlackEightMovie/contents/';
      const self = this;
      const ts0 = String(Date.now());
      const CHUNKS = (typeof BLOGGER_CHUNKS === 'number' && BLOGGER_CHUNKS > 0) ? BLOGGER_CHUNKS : 12;
      const jobs = [];
      if (filename === 'blogger_data.js') {
        const totalBytes = JSON.stringify(BLOGGER_DATA).length;
        const maxBytes = Math.max(Math.ceil(totalBytes / CHUNKS), 5000);
        const chunks = [];
        let cur = [], curSize = 0;
        for (let bi = 0; bi < BLOGGER_DATA.length; bi++) {
          const bs = JSON.stringify(BLOGGER_DATA[bi]).length;
          if (cur.length && curSize + bs > maxBytes && chunks.length < CHUNKS - 1) {
            chunks.push(cur); cur = []; curSize = 0;
          }
          cur.push(BLOGGER_DATA[bi]); curSize += bs;
        }
        if (cur.length) chunks.push(cur);
        while (chunks.length < CHUNKS) chunks.push([]);
        for (let ci = 0; ci < chunks.length; ci++) {
          jobs.push({
            path: 'blogger_data_' + (ci + 1) + '.js',
            text: 'window.__DY_CHUNK && window.__DY_CHUNK(' + (ci + 1) + ', ' + JSON.stringify(chunks[ci]) + ');'
          });
        }
      } else {
        jobs.push({path: filename, text: 'const TK_DATA = ' + JSON.stringify(TK_DATA) + ';'});
      }
      const putOne = function(path, text) {
        const b64 = btoa(unescape(encodeURIComponent(text)));
        const doPut = function(retry) {
          return fetch(api + path, {headers})
            .then(r => r.json())
            .then(meta => {
              if (!meta.sha) throw new Error(meta.message || '无法读取线上文件');
              const body = JSON.stringify({message: '网页删除数据 ' + new Date().toLocaleString('zh-CN', {hour12: false}), content: b64, sha: meta.sha});
              return fetch(api + path, {method: 'PUT', headers, body}).then(r => r.json().then(j => ({status: r.status, j: j})));
            })
            .then(o => {
              const j = o.j;
              if (j.content && j.content.sha) return true;
              if (retry < 2 && (o.status === 422 || /does not match|but expected/i.test(j.message || ''))) return doPut(retry + 1);
              throw new Error(j.message || '提交失败');
            });
        };
        return doPut(0);
      };
      return Promise.all(jobs.map(function(j) { return putOne(j.path, j.text); }))
        .then(function(results) {
          if (!results.length || results.indexOf(true) < 0) throw new Error('提交失败');
          return fetch(api + 'index.html', {headers}).then(r => r.json()).then(m2 => {
            if (!m2 || !m2.sha) return true;
            let htm = decodeURIComponent(escape(atob(m2.content)));
            htm = htm.replace(/(?:<script src="blogger_data_\d+\.js\?v=\d+"><\/script>\s*)+/, function() {
              var s = '';
              for (var ci = 0; ci < CHUNKS; ci++) {
                s += '<script src="blogger_data_' + (ci + 1) + '.js?v=' + ts0 + '"><\/script>\n';
              }
              return s;
            });
            htm = htm.replace(/tk_data\.js\?v=\d+/, 'tk_data.js?v=' + ts0);
            const nb = btoa(unescape(encodeURIComponent(htm)));
            return fetch(api + 'index.html', {method: 'PUT', headers, body: JSON.stringify({message: 'bump data version ' + new Date().toLocaleString('zh-CN', {hour12: false}), content: nb, sha: m2.sha})}).catch(() => ({}));
          }).then(function() { return true; });
        })
        .then(function(ok) {
          if (ok === true) {
            self.$message.success('已提交 GitHub 线上，图片同步中…');
            return true;
          }
          throw new Error('提交失败');
        })
        .catch(e => { self.$message.error('同步失败：' + e.message + '（本地数据已更新，可稍后重试删除或手动同步）'); throw e; });
    },
    deleteGithubFiles(paths) {
      const token = String(this.syncToken || (function(){ try { return localStorage.getItem('bb_gh_token') || ''; } catch(e){ return ''; } })()).replace(/\s+/g, '').replace(/[^\x20-\x7E]/g, '');
      if (!token || !paths || !paths.length) return Promise.resolve();
      const headers = {'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json'};
      const enc = function(p) { return p.split('/').map(encodeURIComponent).join('/'); };
      const sleep = function(ms) { return new Promise(function(res) { setTimeout(res, ms); }); };
      const delOne = function(p) {
        return fetch('https://api.github.com/repos/2607998743/BlackEightMovie/contents/' + enc(p), {headers})
          .then(function(r) { return r.json(); })
          .then(function(m) {
            if (!m.sha) return;
            return fetch('https://api.github.com/repos/2607998743/BlackEightMovie/contents/' + enc(p), {method: 'DELETE', headers, body: JSON.stringify({message: '删除博主图片 ' + p, sha: m.sha})});
          });
      };
      var list = paths.filter(function(p) { return p && p.indexOf('http') !== 0; });
      if (!list.length) return Promise.resolve();
      var idx = 0;
      var workers = [];
      for (var w = 0; w < 3 && w < list.length; w++) {
        workers.push((function worker() {
          if (idx >= list.length) return Promise.resolve();
          var p = list[idx++];
          return delOne(p).catch(function() { return sleep(800).then(function() { return delOne(p); }); }).catch(function() {}).then(worker);
        })());
      }
      return Promise.all(workers);
    },
    checkLatest() {
      var self = this;
      var token = String(this.syncToken || (function(){ try { return localStorage.getItem('bb_gh_token') || ''; } catch(e){ return ''; } })()).replace(/\\s+/g, '').replace(/[^\\x20-\\x7E]/g, '');
      if (!token) return;
      var curTs = parseInt((location.search.match(/[?&]t=(\d{6,})/) || [])[1] || '0', 10) || 0;
      fetch('https://api.github.com/repos/2607998743/BlackEightMovie/contents/index.html', {
        headers: {'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.raw'},
        cache: 'no-store'
      })
        .then(function(r) { if (!r.ok) { throw new Error('http ' + r.status); } return r.text(); })
        .then(function(html) {
          var ts = 0;
          var ms = html.match(/[?&](?:v|t)=(\d{10,})/g) || [];
          ms.forEach(function(m) { var n = parseInt(m.replace(/\D/g, ''), 10) || 0; if (n > ts) ts = n; });
          if (ts > curTs) {
            setTimeout(function() { location.replace(location.pathname + '?t=' + Date.now()); }, 3000);
          }
        })
        .catch(function() {});
      var dlFiles = [];
      for (var ci = 0; ci < (typeof BLOGGER_CHUNKS === 'number' && BLOGGER_CHUNKS > 0 ? BLOGGER_CHUNKS : 12); ci++) dlFiles.push('blogger_data_' + (ci + 1) + '.js');
      dlFiles.push('tk_data.js');
      var parsed = {};
      var pending = dlFiles.length;
      dlFiles.forEach(function(fn) {
        fetch('https://api.github.com/repos/2607998743/BlackEightMovie/contents/' + fn, {
          headers: {'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.raw'},
          cache: 'no-store'
        })
          .then(function(r) { if (!r.ok) { throw new Error('http ' + r.status); } return r.text(); })
          .then(function(txt) {
            var m = txt.match(/(?:const|var) \w+ = (\[.*?\]);/s);
            if (m) {
              try {
                var arr = JSON.parse(m[1]);
                if (fn === 'tk_data.js') parsed.tk = arr;
                else {
                  if (!parsed.blogger) parsed.blogger = [];
                  parsed.blogger = parsed.blogger.concat(arr);
                }
              } catch (e) {}
            }
          })
          .catch(function() {})
          .then(function() {
            pending--;
            if (pending > 0) return;
            if (parsed.blogger && JSON.stringify(BLOGGER_DATA) !== JSON.stringify(parsed.blogger)) {
              BLOGGER_DATA.length = 0;
              Array.prototype.push.apply(BLOGGER_DATA, parsed.blogger);
              self.dataVersion++;
              self.$forceUpdate();
            }
            if (parsed.tk && JSON.stringify(TK_DATA) !== JSON.stringify(parsed.tk)) {
              TK_DATA.length = 0;
              Array.prototype.push.apply(TK_DATA, parsed.tk);
              self.dataVersion++;
              self.$forceUpdate();
            }
          });
      });
    },
    downloadText(filename, text) {
      const blob = new Blob(['\ufeff' + text], {type: 'application/javascript;charset=utf-8'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 200);
    },
    exportBloggerData() {
      this.downloadText('blogger_data.js', 'const BLOGGER_DATA = ' + JSON.stringify(BLOGGER_DATA) + ';');
    },
    exportTkData() {
      this.downloadText('tk_data.js', 'const TK_DATA = ' + JSON.stringify(TK_DATA) + ';');
    },
    deleteBlogger(b) {
      this.$confirm('确定删除博主「' + b.name + '」吗？此操作不可恢复。', '删除确认', {type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消'}).then(() => {
        const i = BLOGGER_DATA.indexOf(b);
        if (i > -1) BLOGGER_DATA.splice(i, 1);
        if (this.currentBlogger && this.currentBlogger.name === b.name) {
          this.currentBlogger = {name: '', analysis: {text: ''}, style: [], country_dist: [], videos: []};
        }
        this.dataVersion++;
        var files = [];
        if (b.avatar && b.avatar.indexOf('http') !== 0) files.push(b.avatar);
        var self = this;
        this.githubPush('blogger_data.js').then(function() { try { history.replaceState(null, '', location.pathname + '?t=' + Date.now()); } catch(e) {} self.deleteGithubFiles(files); }).catch(function() {});
        this.$message({type: 'success', message: '已删除「' + b.name + '」，正在提交 GitHub 线上…'});
      }).catch(function() {});
    },
    deleteTkBlogger(b) {
      this.$confirm('确定删除 TK 博主「' + b.name + '」吗？此操作不可恢复。', '删除确认', {type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消'}).then(() => {
        const i = this.tkBloggers.indexOf(b);
        if (i > -1) this.tkBloggers.splice(i, 1);
        if (this.currentBlogger && this.currentBlogger.name === b.name) {
          this.currentBlogger = {name: '', analysis: {text: ''}, style: [], country_dist: [], videos: []};
        }
        var files = [];
        if (b.avatar && b.avatar.indexOf('http') !== 0) files.push(b.avatar);
        (b.videos || []).forEach(function(v) { if (v.cover && v.cover.indexOf('http') !== 0) files.push(v.cover); });
        var self = this;
        this.githubPush('tk_data.js').then(function() { try { history.replaceState(null, '', location.pathname + '?t=' + Date.now()); } catch(e) {} self.deleteGithubFiles(files); }).catch(function() {});
        this.$message({type: 'success', message: '已删除「' + b.name + '」，正在提交 GitHub 线上…'});
      }).catch(function() {});
    },
    deleteVideo(v) {
      this.$confirm('确定删除该条视频数据吗？此操作不可恢复。', '删除确认', {type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消'}).then(() => {
        const i = this.currentBlogger.videos.indexOf(v);
        if (i > -1) this.currentBlogger.videos.splice(i, 1);
        this.dataVersion++;
        var files = [];
        if (v.cover && v.cover.indexOf('http') !== 0) files.push(v.cover);
        var dataFile = (this.currentBlogger.platform === 'tk') ? 'tk_data.js' : 'blogger_data.js';
        var self = this;
        this.githubPush(dataFile).then(function() { try { history.replaceState(null, '', location.pathname + '?t=' + Date.now()); } catch(e) {} self.deleteGithubFiles(files); }).catch(function() {});
        this.$message({type: 'success', message: '已删除该视频，正在提交 GitHub 线上…'});
      }).catch(function() {});
    },
    doLogin() {
      if (this.loginUser === 'root' && this.loginPass === 'c87311923') {
        this.loginRole = 'admin';
        try { localStorage.setItem('bb_login_role', 'admin'); } catch (e) {}
        this.loginError = '';
        this.initByRole();
      } else {
        this.loginError = '账号或密码错误，请重试';
      }
    },
    guestLogin() {
      this.loginRole = 'guest';
      try { localStorage.setItem('bb_login_role', 'guest'); } catch (e) {}
      this.loginError = '';
      this.initByRole();
    },
    logout() {
      this.loginRole = '';
      try { localStorage.removeItem('bb_login_role'); } catch (e) {}
      this.loginUser = '';
      this.loginPass = '';
      this.loginError = '';
      this.currentBlogger = null;
      this.activeMenu = 'douyin';
    },
    initByRole() {
      if (this.loginRole === 'guest') {
        this.activeMenu = 'search';
        this.currentBlogger = null;
      } else if (this.loginRole === 'admin' && BLOGGER_DATA.length > 0) {
        this.activeMenu = 'douyin';
        this.selectBlogger(BLOGGER_DATA[0]);
      }
    },
    handleMenuSelect(index) {
      if (index === 'search-open') {
        this.activeMenu = 'search';
        this.currentBlogger = null;
        return;
      }
      this.activeMenu = index;
      if (index === 'search') {
        this.currentBlogger = null;
      }
    },
    selectBlogger(b) {
      this.currentBlogger = JSON.parse(JSON.stringify(b));
      this.activeMenu = (b.platform === 'tk') ? 'tiktok' : 'douyin';
      this.filterType = '';
      this.filterCountry = '';
      this.$nextTick(() => {
        this.renderPie();
        if (this..videoTable) { this..videoTable.store.commit('setData', this.filteredVideos); this..videoTable.doLayout(); }
      });
    },
    parseAndSearch() {
      const text = (this.nlText || '').trim();
      this.resetSearch();
      if (!text) return;
      const q = {};
      let rest = text;
      let m = text.match(/(\d{4})\s*[年.\-\/]\s*(\d{1,2})\s*月?/);
      if (m) { q.month = m[1] + '-' + String(Number(m[2])).padStart(2, '0'); rest = rest.replace(m[0], ' '); }
      else { m = text.match(/(\d{4})\s*年/); if (m) { q.year = m[1]; rest = rest.replace(m[0], ' '); } }
      if (/(抖音|douyin)/i.test(text)) { q.platform = 'douyin'; rest = rest.replace(/抖音博主|抖音|douyin/gi, ' '); }
      else if (/(tiktok|tk)/i.test(text)) { q.platform = 'tk'; rest = rest.replace(/TikTok博主|TikTok|tiktok|TK博主|tk/gi, ' '); }
      const countries = ['美国','英国','法国','日本','韩国','印度','泰国','俄罗斯','德国','意大利','西班牙','加拿大','澳大利亚','墨西哥','土耳其','中国','香港','台湾','挪威','瑞典','丹麦','荷兰','巴西','阿根廷','新西兰','奥地利','波兰','比利时','伊朗','以色列','菲律宾','越南','印尼','芬兰','爱尔兰','葡萄牙','瑞士'];
      for (const c of countries) if (text.includes(c)) { q.country = c; rest = rest.replace(c, ' '); break; }
      const types = ['悬疑','科幻','动作','恐怖','剧情','喜剧','爱情','战争','犯罪','奇幻','惊悚','灾难','纪录片','动画','谍战','推理','音乐','冒险','运动','历史','家庭','西部','歌舞','传记','警匪'];
      for (const ty of types) if (text.includes(ty)) { q.type = ty; rest = rest.replace(ty, ' '); break; }
            const cnSmall = function (s) {
        const digits = {'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
        const units = {'十':10,'百':100,'千':1000};
        let result = 0, num = 0;
        for (const ch of s) {
          if (digits[ch] !== undefined) num = digits[ch];
          else if (units[ch]) { result += (num || 1) * units[ch]; num = 0; }
        }
        return result + num;
      };
      const parseFan = function (s) {
        if (s === '') return 10000;
        if (/^\d+(?:\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 10000);
        return cnSmall(s) * 10000;
      };
      let fm = rest.match(/([零一二三四五六七八九十百千两\d]*)\s*万\s*粉\s*(以下|以内|之内|内)/);
      if (fm) { q.fanMax = parseFan(fm[1]); rest = rest.replace(fm[0], ' '); }
      else {
        fm = rest.match(/([零一二三四五六七八九十百千两\d]*)\s*万\s*粉\s*(以上|起|之上)/);
        if (fm) { q.fanMin = parseFan(fm[1]); rest = rest.replace(fm[0], ' '); }
      }
      let fs = rest.match(/粉丝\s*(低于|少于|不到|不超过|以内)\s*([零一二三四五六七八九十百千两\d]+)\s*万/);
      if (fs) { q.fanMax = parseFan(fs[2]); rest = rest.replace(fs[0], ' '); }
      else {
        fs = rest.match(/粉丝\s*(高于|超过|达到|以上)\s*([零一二三四五六七八九十百千两\d]+)\s*万/);
        if (fs) { q.fanMin = parseFan(fs[2]); rest = rest.replace(fs[0], ' '); }
      }
      if (text.includes('爆')) {
        let mm = text.match(/(\d+(?:\.\d+)?)\s*万/);
        q.minLikes = mm ? Math.round(parseFloat(mm[1]) * 10000) : 100000;
      } else if (text.includes('热')) {
        q.minLikes = 50000;
      }
      let nm = text.match(/《(.+?)》/);
      if (nm) q.name = nm[1];
      const bloggerSrc = (q.platform === 'tk') ? TK_DATA : BLOGGER_DATA;
      for (const b of bloggerSrc) {
        if (text.includes(b.name)) { q.blogger = b.name; rest = rest.replace(b.name, ' '); break; }
      }
      if (!q.name) {
        const leftover = rest.replace(/哪些|都有|谁|的|了|片|剪|过|解说|视频|下|个|月|年|爆款|爆了|热门|有|没|查|找|推荐|看看|火/g, ' ').replace(/[，。？?！!、\s]+/g, ' ').trim();
        if (leftover && leftover.length <= 12) q.name = leftover;
      }
      this.searchMonth = q.month || (q.year || '');
      this.searchCountry = q.country || '';
      this.searchType = q.type || '';
      this.searchName = q.name || '';
      this.searchBlogger = q.blogger || '';
      this.searchMinLikes = q.minLikes || 0;
      this.searchPlatform = q.platform || '';
      this.fanMin = q.fanMin || 0;
      this.fanMax = q.fanMax || 0;
      this.searchRan = true;
      const parts = [];
      if (q.platform) parts.push('平台 ' + (q.platform === 'tk' ? 'TIKTOK' : '抖音'));
      if (q.month) parts.push('月份 ' + q.month);
      else if (q.year) parts.push('年份 ' + q.year);
      if (q.country) parts.push('国家 ' + q.country);
      if (q.type) parts.push('类型 ' + q.type);
      if (q.minLikes) parts.push('点赞 ≥' + (q.minLikes / 10000) + '万');
      if (q.fanMax) parts.push('粉丝 ≤' + (q.fanMax / 10000) + '万');
      if (q.fanMin) parts.push('粉丝 ≥' + (q.fanMin / 10000) + '万');
      if (q.name) parts.push('影片 ' + q.name);
      if (q.blogger) parts.push('博主 ' + q.blogger);
      this.nlRecognized = parts.length ? ('已识别：' + parts.join(' · ') + '（可在下方微调）') : '未识别到明确条件，展示全部视频（按点赞降序）';
    },
    resetFilter() {
      this.filterType = '';
      this.filterCountry = '';
    },
    openSearch() {
      this.resetSearch();
      this.searchDialogVisible = true;
    },
    resetSearch() {
      this.searchMonth = '';
      this.searchCountry = '';
      this.searchType = '';
      this.searchName = '';
      this.searchBlogger = '';
      this.searchMinLikes = 0;
      this.searchPlatform = '';
      this.fanMin = 0;
      this.fanMax = 0;
      this.searchRan = false;
    },
    playsRank(p) {
      const s = (p || '0').replace(/[ ,]/g, '');
      const m = s.match(/^([\d.]+)([KMB]?)$/);
      let v = 0;
      if (m) { v = parseFloat(m[1]) * ({K: 1e3, M: 1e6, B: 1e9}[m[2]] || 1); }
      if (v >= 500000) return {label: '爆款', tag: 'danger'};
      if (v >= 200000) return {label: '热门', tag: 'warning'};
      return {label: '普通', tag: 'info'};
    },
    previewCover(url) {
      this.currentCover = url;
      this.coverDialogVisible = true;
    },
    getStyleColor(name) {
      const colors = {
        '科幻': '#4f7cff', '悬疑': '#ef4444', '动作': '#f59e0b',
        '恐怖': '#6b7280', '剧情': '#10b981', '喜剧': '#ec4899',
        '爱情': '#f472b6', '动画': '#8b5cf6', '战争': '#92400e',
        '灾难': '#f97316', '其他': '#9ca3af', '犯罪': '#dc2626',
        '奇幻': '#7c3aed', '冒险': '#059669'
      };
      return colors[name] || '#4f7cff';
    },
    getCountryColor(name) {
      const colors = {
        '美国': '#4f7cff', '韩国': '#ef4444', '日本': '#f59e0b',
        '英国': '#10b981', '法国': '#8b5cf6', '意大利': '#f97316',
        '西班牙': '#14b8a6', '德国': '#374151', '俄罗斯': '#dc2626',
        '泰国': '#f59e0b', '印度': '#ea580c', '其他': '#9ca3af'
      };
      return colors[name] || '#9ca3af';
    },
    getTypeTag(type) {
      const map = {
        '科幻': '', '悬疑': 'danger', '动作': 'warning', '恐怖': 'info',
        '剧情': 'success', '喜剧': 'danger', '爱情': '', '动画': '',
        '战争': 'warning', '灾难': 'danger', '犯罪': 'danger', '其他': 'info',
        '奇幻': '', '冒险': 'success'
      };
      return map[type] || 'info';
    },
    renderPie() {
      if (!this.$refs.pieChart || !this.currentBlogger) return;
      if (this.pieChart) this.pieChart.dispose();
      this.pieChart = echarts.init(this.$refs.pieChart);
      let styleList = this.currentBlogger.style || [];
      if (!styleList.length) styleList = [{name: '待识别', value: 1, itemStyle: {color: '#e5e7eb'}}];
      const data = styleList.map(s => ({
        name: s.name,
        value: s.value,
        itemStyle: { color: this.getStyleColor(s.name) }
      }));
      this.pieChart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
        series: [{
          type: 'pie',
          radius: ['50%', '72%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          data: data
        }]
      });

      if (this.$refs.countryPieChart) {
        if (this.countryPieChart) this.countryPieChart.dispose();
        this.countryPieChart = echarts.init(this.$refs.countryPieChart);
        let cList = this.currentBlogger.country_dist || [];
        if (!cList.length) cList = [{name: '待识别', value: 1, itemStyle: {color: '#e5e7eb'}}];
        const countryData = cList.map(c => ({
          name: c.name,
          value: c.value,
          itemStyle: { color: this.getCountryColor(c.name) }
        }));
        this.countryPieChart.setOption({
          tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
          series: [{
            type: 'pie',
            radius: ['50%', '72%'],
            center: ['50%', '50%'],
            avoidLabelOverlap: false,
            label: { show: false },
            itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
            data: countryData
          }]
        });
      }
    },
    applyNameOverrides() {
      let ov = {};
      try { ov = JSON.parse(localStorage.getItem('movie_name_overrides') || '{}'); } catch (e) {}
      const keys = Object.keys(ov);
      if (!keys.length) return;
      const apply = src => src.forEach(b => (b.videos || []).forEach(v => { if (ov[v.url]) v.movie_name = ov[v.url]; }));
      apply(BLOGGER_DATA); apply(TK_DATA);
    },
    startEditName(video) {
      this.editingName = video.url;
      this.editNameVal = video.movie_name || '';
    },
    cancelEditName() {
      this.editingName = null;
    },
    confirmEditName(video) {
      const name = (this.editNameVal || '').trim();
      if (!name) { this.cancelEditName(); return; }
      let ov = {};
      try { ov = JSON.parse(localStorage.getItem('movie_name_overrides') || '{}'); } catch (e) {}
      ov[video.url] = name;
      try { localStorage.setItem('movie_name_overrides', JSON.stringify(ov)); } catch (e) {}
      const apply = src => src.forEach(b => (b.videos || []).forEach(v => { if (v.url === video.url) v.movie_name = name; }));
      apply(BLOGGER_DATA); apply(TK_DATA);
      this.editingName = null;
      if (this.activeMenu === 'search') { this.searchRan = false; this.$nextTick(() => { this.searchRan = true; }); }
      const isLocal = location.protocol === 'file:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost';
      if (isLocal) {
        this.saveViaLocal(video, name);
      } else if (location.hostname === '2607998743.github.io') {
        this.saveViaGitHub(video, name);
      } else {
        this.saveViaCloudflare(video, name);
      }
    },
    saveViaLocal(video, name) {
      const endpoint = 'http://127.0.0.1:8899/api/save_movie_name';
      try {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: video.url, movie_name: name })
        }).then(r => r.json()).then(d => {
          if (d && d.ok) {
            this.toast('已保存并同步线上' + (d.changed ? '' : '（内容一致）'), 'ok');
          } else {
            this.toast('已保存本机，但未同步线上：' + ((d && d.err) || '服务异常'), 'err');
          }
        }).catch(() => {
          this.toast('已保存到本机（同步服务未启动，请先双击启动监控服务.bat 或检查网络）', 'err');
        });
      } catch (e) {}
    },
    saveViaCloudflare(video, name) {
      try {
        fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: video.url, movie_name: name })
        }).then(r => r.json()).then(d => {
          if (d && d.ok) {
            this.toast('已保存并同步线上' + (d.changed ? '' : '（内容一致）'), 'ok');
          } else {
            this.toast('已保存本机，但未同步线上：' + ((d && d.err) || '服务异常'), 'err');
          }
        }).catch(() => {
          this.toast('已保存到本机（线上同步失败，请检查网络）', 'err');
        });
      } catch (e) {}
    },
    saveViaGitHub(video, name) {
      let token = (localStorage.getItem('github_token') || '').trim();
      if (!token) {
        token = (window.prompt('请输入 GitHub Token（github_pat_ 开头，只存于本浏览器，用于同步修改到仓库）：') || '').trim();
        if (!token) { this.toast('已取消同步', 'err'); return; }
        localStorage.setItem('github_token', token);
      }
      let ov = {};
      try { ov = JSON.parse(localStorage.getItem('movie_name_overrides') || '{}'); } catch (e) {}
      ov[video.url] = name;
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(ov, null, 2))));
      const api = 'https://api.github.com/repos/2607998743/BlackEightMovie/contents/movie_name_overrides.json';
      const hdr = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' };
      fetch(api, { headers: hdr }).then(r => r.json()).then(d => {
        const sha = d && d.sha ? d.sha : null;
        return fetch(api, {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, hdr),
          body: JSON.stringify({ message: '更新影片名 overrides', content: content, sha: sha })
        });
      }).then(r => r.json()).then(d => {
        if (d && d.content) {
          this.toast('已保存并同步线上（GitHub）', 'ok');
        } else {
          this.toast('同步失败：' + ((d && d.message) || '未知错误'), 'err');
        }
      }).catch(e => {
        this.toast('同步失败：' + (e && e.message ? e.message : '网络错误'), 'err');
      });
    },

    videoAction(cmd, row) {
      if (cmd === 'cover') return this.downloadCover(row);
      if (cmd === 'video') return this.downloadVideo(row);
      if (cmd === 'open') { window.open(row.url, '_blank'); return; }
      if (cmd === 'copy') this.copyText(row.url);
    },
    async downloadCover(row) {
      const url = row.cover;
      if (!url) { this.toast('该视频没有封面', 'err'); return; }
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const blob = await resp.blob();
        const base = ((row.blogger || '') + '_' + (row.movie_name || row.video_id || 'video')).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
        this.saveBlob(blob, base + '.jpg');
        this.toast('封面已保存：' + base + '.jpg（浏览器下载栏查看）', 'ok');
      } catch (e) {
        window.open(url, '_blank');
        this.toast('封面直下受限，已在新窗口打开，可在图片上右键保存', 'err');
      }
    },
    async downloadVideo(row) {
      const url = row.url || '';
      if (/tiktok\.com/i.test(url) || row.platform === 'tk') {
        return this.parseTikTok(url);
      }
      if (/douyin\.com/.test(url)) {
        this.toast('抖音视频受签名保护，网页端无法直下（所有免费网页方案均不可行）。已在抖音页打开，可点分享用App保存，或在本站下封面', 'err');
        setTimeout(() => window.open(url, '_blank'), 1500);
        return;
      }
      this.toast('无法识别视频来源', 'err');
    },
    async parseTikTok(url) {
      if (!/^https?:\/\//.test(url)) { this.toast('链接格式不对，请粘贴完整 TikTok 视频链接', 'err'); return; }
      this.toast('正在解析 TikTok 视频…', 'ok');
      try {
        const body = new URLSearchParams();
        body.append('url', url);
        const resp = await fetch('https://www.tikwm.com/api/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });
        const d = await resp.json();
        if (!d || d.code !== 0 || !d.data) throw new Error((d && d.msg) || '解析失败');
        const v = d.data;
        if (!v.play) throw new Error('未获取到播放地址');
        const title = (v.title || 'tiktok_video').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
        this.toast('解析成功，正在下载…', 'ok');
        const r = await fetch(v.play);
        if (!r.ok) throw new Error('视频下载失败 HTTP ' + r.status);
        const total = parseInt(r.headers.get('Content-Length') || '0', 10);
        let got = 0, parts = [];
        const reader = r.body.getReader();
        let lastPct = 0;
        for (;;) {
          const st = await reader.read();
          if (st.done) break;
          parts.push(st.value);
          got += st.value.length;
          if (total) {
            const pct = Math.floor(got / total * 100);
            if (pct - lastPct >= 25 || pct >= 100) { lastPct = pct; this.toast('下载中 ' + Math.min(pct, 99) + '%', 'ok'); }
          }
        }
        const blob = new Blob(parts, { type: 'video/mp4' });
        this.saveBlob(blob, title + '.mp4');
        this.toast('视频已保存，请在浏览器下载栏查看', 'ok');
      } catch (e) {
        const msg = String(e.message || e);
        if (/Failed to fetch|NetworkError|TypeError/.test(msg)) {
          this.toast('TikTok 下载失败：播放地址在当前网络不可达（TikTok 被墙，需挂梯子或换网络）。已打开原视频页', 'err');
        } else {
          this.toast('TikTok 下载失败：' + msg + '（解析服务可能被拦截）。已打开原视频页', 'err');
        }
        setTimeout(() => window.open(url, '_blank'), 1200);
      }
    },
    async batchDownloadTk() {
      if (this.batchDownloading) return;
      const vids = this.filteredVideos || (this.currentBlogger && this.currentBlogger.videos) || [];
      const tkVids = vids.filter(v => v.url && /tiktok\.com/i.test(v.url));
      if (!tkVids.length) { this.toast('当前没有可下载的 TK 视频', 'err'); return; }
      try {
        await this.$confirm('将批量下载 ' + tkVids.length + ' 个视频，按 1.mp4、2.mp4… 顺序命名。浏览器首次可能弹出"允许多文件下载"提示，请点允许。', '批量下载', { confirmButtonText: '开始下载', cancelButtonText: '取消', type: 'info' });
      } catch(e) { return; }
      this.batchDownloading = true;
      let ok = 0, fail = 0;
      for (let i = 0; i < tkVids.length; i++) {
        const row = tkVids[i];
        const n = i + 1;
        try {
          this.toast('[' + n + '/' + tkVids.length + '] 解析中…', 'ok');
          const body = new URLSearchParams();
          body.append('url', row.url);
          const resp = await fetch('https://www.tikwm.com/api/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
          });
          const d = await resp.json();
          if (!d || d.code !== 0 || !d.data || !d.data.play) throw new Error((d && d.msg) || '解析失败');
          const r = await fetch(d.data.play);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const blob = await r.blob();
          this.saveBlob(blob, n + '.mp4');
          ok++;
          this.toast('[' + n + '/' + tkVids.length + '] 已保存 ' + n + '.mp4', 'ok');
        } catch (e) {
          fail++;
          this.toast('[' + n + '/' + tkVids.length + '] 失败: ' + String(e.message || e).slice(0, 40), 'err');
        }
        if (i < tkVids.length - 1) await new Promise(r => setTimeout(r, 1500));
      }
      this.batchDownloading = false;
      this.toast('批量下载完成：成功 ' + ok + '，失败 ' + fail, fail ? 'err' : 'ok');
    },
    saveBlob(blob, filename) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
    },
    copyText(txt) {
      const done = () => this.toast('链接已复制', 'ok');
      const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); this.toast('链接已复制', 'ok'); } catch (e) { this.toast('复制失败，请手动复制', 'err'); }
        ta.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, fallback);
      } else fallback();
    },


    loadChunks() {
      const CHUNKS = (typeof BLOGGER_CHUNKS === 'number' && BLOGGER_CHUNKS > 0) ? BLOGGER_CHUNKS : 12;
      this.__chunkBuf = new Array(CHUNKS);
      this.__chunkNext = 0;
      const self = this;
      window.__DY_CHUNK = function (n, arr) { self.onChunk(n, arr); };
      const ts = Date.now();
      for (let i = 0; i < CHUNKS; i++) {
        (function (ci) {
          const s = document.createElement('script');
          s.src = 'blogger_data_' + (ci + 1) + '.js?v=' + ts;
          s.onerror = function () { self.onChunk(ci + 1, []); };
          document.body.appendChild(s);
        })(i);
      }
    },
    onChunk(n, arr) {
      if (!this.__chunkBuf) { this.__chunkBuf = new Array(12); this.__chunkNext = 0; }
      if (n < 1 || n > this.__chunkBuf.length) return;
      if (this.__chunkBuf[n - 1]) return;
      this.__chunkBuf[n - 1] = arr || [];
      this.__mergeChunks();
    },
    __mergeChunks() {
      while (this.__chunkNext < this.__chunkBuf.length && this.__chunkBuf[this.__chunkNext]) {
        const part = this.__chunkBuf[this.__chunkNext];
        BLOGGER_DATA.push.apply(BLOGGER_DATA, part);
        this.__chunkBuf[this.__chunkNext] = null;
        this.__chunkNext++;
      }
      this.dataVersion++;
      const el = document.getElementById('loadingMask');
      const prog = document.getElementById('loadingProgress');
      if (this.__chunkNext >= this.__chunkBuf.length) {
        if (el) el.style.display = 'none';
      } else if (this.__chunkNext >= 1) {
        if (el) el.style.display = 'none';
      } else {
        if (prog) prog.textContent = '数据加载中 ' + this.__chunkNext + '/' + this.__chunkBuf.length;
      }
    },

    toast(msg, type) {
      let el = document.getElementById('sync-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'sync-toast';
        el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;padding:10px 16px;border-radius:6px;color:#fff;font-size:13px;line-height:1.5;box-shadow:0 2px 8px rgba(0,0,0,.2);transition:opacity .3s;max-width:340px;';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.style.background = (type === 'ok') ? 'rgba(24,160,88,.95)' : 'rgba(245,108,108,.95)';
      el.style.opacity = '1';
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.style.opacity = '0'; }, 3500);
    }
  },
  mounted() {
    this.applyNameOverrides();
    this.loadChunks();
    this.checkLatest();
    setInterval(() => { this.checkLatest(); }, 60000);
    let saved = '';
    try { saved = localStorage.getItem('bb_login_role') || ''; } catch (e) {}
    this.loginRole = (saved === 'admin' || saved === 'guest') ? saved : '';
    this.initByRole();
    window.addEventListener('resize', () => {
      if (this.pieChart) this.pieChart.resize();
      if (this.countryPieChart) this.countryPieChart.resize();
    });
    // 在线模式：拉取云端 overrides（GitHub Pages 走仓库文件，Cloudflare 走 KV API）
    const isLocal = location.protocol === 'file:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    if (!isLocal) {
      const applyAfter = (ov) => {
        try { localStorage.setItem('movie_name_overrides', JSON.stringify(ov || {})); } catch (e) {}
        this.applyNameOverrides();
      };
      if (location.hostname === '2607998743.github.io') {
        fetch('movie_name_overrides.json').then(r => { if (!r.ok) throw new Error('nf'); return r.json(); })
          .then(ov => applyAfter(ov || {})).catch(() => {});
      } else {
        fetch('/api/overrides').then(r => r.json()).then(d => applyAfter((d && d.overrides) || {}))
          .catch(() => {});
      }
    }
  }
});
